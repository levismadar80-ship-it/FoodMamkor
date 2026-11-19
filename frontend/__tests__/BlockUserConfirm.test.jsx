import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import he from "@/messages/he.json";
import BlockUserConfirm from "@/components/admin/BlockUserConfirm";

// MEH-3375 — before an admin blocks a user, the confirm shows what the block
// takes down. The cells that matter: no business · business × 0 / 1 / many
// open bookings · the read failing (the block must not be reachable then,
// or the admin blocks blind — the bug this card exists for).

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));

vi.mock("next-intl", () => ({
  // The real he.json strings, with {name}-style placeholders filled in.
  useTranslations: (scope) => (key, values = {}) => {
    const raw = `${scope}.${key}`.split(".").reduce((o, k) => o?.[k], he) ?? key;
    return String(raw).replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
  },
}));

const USER = { id: "u1", name: "נועה" };

function renderWith(impact, props = {}) {
  if (impact === "fail") apiMock.get.mockRejectedValue({ response: { status: 500 } });
  else apiMock.get.mockResolvedValue({ data: impact });
  const onConfirm = vi.fn();
  render(
    <BlockUserConfirm user={USER} busy={false} onConfirm={onConfirm} onClose={() => {}} {...props} />
  );
  return { onConfirm };
}

const submit = () => screen.getByTestId("block-confirm-submit");

describe("BlockUserConfirm (MEH-3375)", () => {


  it("asks the impact endpoint for this user", async () => {
    renderWith({ business_name: null, open_bookings: 0 });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/admin/users/u1/block-impact"));
  });

  it("a user with no live business: the plain sentence, no bookings line", async () => {
    renderWith({ business_name: null, open_bookings: 0 });
    expect(await screen.findByText(/לא תהיה אפשרות להתחבר לחשבון/)).toBeTruthy();
    expect(screen.queryByTestId("block-confirm-bookings")).toBeNull();
    expect(screen.queryByText(/«הפעל»/)).toBeNull();
  });

  it("a business with no open bookings", async () => {
    renderWith({ business_name: "מאפיית הגליל", open_bookings: 0 });
    expect(await screen.findByText(/בית העסק «מאפיית הגליל» יוסתר מהאתר/)).toBeTruthy();
    expect(screen.getByTestId("block-confirm-bookings").textContent).toBe("אין בו הזמנות פתוחות.");
    expect(screen.getByText(/«הפעל»/)).toBeTruthy();
  });

  it("one open booking", async () => {
    renderWith({ business_name: "מאפיית הגליל", open_bookings: 1 });
    await screen.findByTestId("block-confirm-bookings");
    expect(screen.getByTestId("block-confirm-bookings").textContent).toBe(
      "הזמנה פתוחה אחת תבוטל, ומי שהזמינה תקבל מייל."
    );
  });

  it("many open bookings name the count", async () => {
    renderWith({ business_name: "מאפיית הגליל", open_bookings: 7 });
    await screen.findByTestId("block-confirm-bookings");
    expect(screen.getByTestId("block-confirm-bookings").textContent).toBe(
      "7 הזמנות פתוחות יבוטלו, וכל מי שהזמינה תקבל מייל."
    );
  });

  it("the block button waits for the count, then confirms", async () => {
    const { onConfirm } = renderWith({ business_name: "מאפיית הגליל", open_bookings: 2 });
    expect(submit().disabled).toBe(true);
    await screen.findByTestId("block-confirm-bookings");
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a failed read says so and keeps the block out of reach", async () => {
    const { onConfirm } = renderWith("fail");
    expect(await screen.findByText(/לא הצלחנו לבדוק אם יש הזמנות פתוחות/)).toBeTruthy();
    expect(submit().disabled).toBe(true);
    fireEvent.click(submit());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
