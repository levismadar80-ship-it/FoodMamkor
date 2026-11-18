import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderHe as render } from "./helpers/render-with-he";
import PasskeySettings from "@/app/[locale]/admin/settings/PasskeySettings";
import api from "@/lib/api";
import { createPasskey, getPasskeyAssertion } from "@/lib/webauthn";

/**
 * MEH-3305 — the admin's own passkeys card.
 *
 * Pinned: the three list counts (0 / 1 / many); the recovery codes are shown
 * once after the first passkey and gone after «שמרתי»; the proof sent before a
 * change is the strongest the account has (password with no passkey, the
 * device with one, a typed recovery code over the device); the card says so
 * when the environment has passkeys off.
 */

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/webauthn", () => ({
  passkeysSupported: () => true,
  createPasskey: vi.fn(async () => ({ id: "new" })),
  getPasskeyAssertion: vi.fn(async () => ({ id: "assert" })),
}));

const row = (i, extra = {}) => ({
  id: `00000000-0000-0000-0000-00000000000${i}`,
  name: `מפתח ${i}`,
  synced: false,
  created_at: "2026-11-18T10:00:00Z",
  last_used_at: null,
  ...extra,
});
const state = (passkeys, extra = {}) => ({
  enabled: true,
  passkeys,
  recovery_codes_left: passkeys.length ? 10 : 0,
  has_password: true,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PasskeySettings", () => {
  it("0 passkeys: the empty line, the password field, no codes row", async () => {
    api.get.mockResolvedValue({ data: state([]) });
    render(<PasskeySettings />);
    expect(await screen.findByTestId("passkey-empty")).toHaveTextContent("עוד לא נוסף מפתח גישה.");
    expect(screen.getByLabelText("הסיסמה של החשבון")).toBeInTheDocument();
    expect(screen.queryByText(/קודי שחזור$/)).toBeNull();
  });

  it("1 passkey: one row with its name and «מסונכרן», no password field", async () => {
    api.get.mockResolvedValue({ data: state([row(1, { synced: true })]) });
    render(<PasskeySettings />);
    const rows = await screen.findAllByTestId("passkey-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("מפתח 1");
    expect(rows[0]).toHaveTextContent("מסונכרן");
    expect(screen.queryByLabelText("הסיסמה של החשבון")).toBeNull();
    expect(screen.getByText("נשארו 10 קודי שחזור")).toBeInTheDocument();
  });

  it("many passkeys: one row each", async () => {
    api.get.mockResolvedValue({ data: state([row(1), row(2), row(3)]) });
    render(<PasskeySettings />);
    expect(await screen.findAllByTestId("passkey-row")).toHaveLength(3);
  });

  it("the first passkey sends the password, then shows the codes once", async () => {
    api.get.mockResolvedValueOnce({ data: state([]) }).mockResolvedValue({ data: state([row(1)]) });
    api.post.mockImplementation(async (url) => {
      if (url === "/auth/passkey/register/options") return { data: { ticket: "t", options: {} } };
      return { data: { passkey: row(1), recovery_codes: ["AAAAA-BBBBB", "CCCCC-DDDDD"] } };
    });
    render(<PasskeySettings />);
    fireEvent.change(await screen.findByLabelText("הסיסמה של החשבון"), { target: { value: "pw-123456789" } });
    fireEvent.click(screen.getByTestId("passkey-add"));
    expect(await screen.findByTestId("passkey-codes")).toHaveTextContent("AAAAA-BBBBB");
    expect(api.post).toHaveBeenCalledWith("/auth/passkey/register/options", { password: "pw-123456789" });
    expect(createPasskey).toHaveBeenCalled();
    fireEvent.click(screen.getByText("שמרתי"));
    await waitFor(() => expect(screen.queryByTestId("passkey-codes")).toBeNull());
  });

  it("removing with a passkey asks the device; a typed code is sent instead of it", async () => {
    api.get.mockResolvedValue({ data: state([row(1), row(2)]) });
    api.post.mockImplementation(async (url) =>
      url === "/auth/passkey/step-up/options" ? { data: { ticket: "s", options: {} } } : { data: {} }
    );
    render(<PasskeySettings />);
    const rows = await screen.findAllByTestId("passkey-row");
    fireEvent.click(rows[0].querySelector("button"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(`/auth/passkey/${row(1).id}/delete`, {
        ticket: "s",
        credential: { id: "assert" },
      })
    );
    expect(getPasskeyAssertion).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("קוד שחזור (אם המכשיר לא זמין)"), { target: { value: "AAAAA-BBBBB" } });
    fireEvent.click((await screen.findAllByTestId("passkey-row"))[1].querySelector("button"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(`/auth/passkey/${row(2).id}/delete`, {
        recovery_code: "AAAAA-BBBBB",
      })
    );
    expect(getPasskeyAssertion).toHaveBeenCalledTimes(1);
  });

  it("off in this environment: says so and offers no add button", async () => {
    api.get.mockResolvedValue({ data: state([], { enabled: false }) });
    render(<PasskeySettings />);
    expect(await screen.findByText("מפתח גישה לא זמין בסביבה הזאת.")).toBeInTheDocument();
    expect(screen.queryByTestId("passkey-add")).toBeNull();
  });
});
