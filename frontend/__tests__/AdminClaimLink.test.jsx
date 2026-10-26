/**
 * MEH-2325 — the admin half of the owner-claim flow.
 *
 * Two surfaces, one contract each:
 *   - ProducerForm (create mode) sends `as_draft: true` ONLY when the box is
 *     ticked, and then lands on the new draft's edit page. Unticked, the
 *     payload is byte-for-byte what it was before (no key at all).
 *   - ClaimLinkPanel mints a link, shows it with its expiry, and shows the
 *     server's 409 detail verbatim when the business can't be claimed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";
import ClaimLinkPanel from "@/components/admin/ClaimLinkPanel";
import EditProducerPage from "@/app/[locale]/admin/producers/[id]/edit/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: "p-9" }),
}));

// One stable object: the edit page's fetch effect depends on `user`, so a
// fresh object per render would refetch forever.
const adminAuth = { user: { role: "admin" }, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => adminAuth,
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const F = he.admin.producers.form.fields;
const C = he.admin.producers.claim;

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const submitCreate = () =>
  fireEvent.submit(
    screen.getByRole("button", { name: he.admin.producers.form.submit_create }).closest("form"),
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // GET /categories
});

describe("ProducerForm — as_draft (MEH-2325)", () => {
  it("ticked: posts as_draft:true and lands on the draft's edit page", async () => {
    api.post.mockResolvedValue({ data: { id: "new-7" } });
    wrap(<ProducerForm />);

    fireEvent.click(await screen.findByTestId("as-draft-checkbox"));
    submitCreate();

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe("/admin/producers");
    expect(payload.as_draft).toBe(true);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/producers/new-7/edit"));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("unticked: the payload carries no as_draft key and redirects to the list", async () => {
    api.post.mockResolvedValue({ data: { id: "new-8" } });
    wrap(<ProducerForm />);

    await screen.findByTestId("as-draft-checkbox");
    submitCreate();

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect("as_draft" in api.post.mock.calls[0][1]).toBe(false);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin?tab=producers"));
  });

  it("edit mode: no draft option, and the PUT never carries as_draft", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(<ProducerForm producerId="p-1" initial={{ name: "קיים" }} />);

    await screen.findByText(he.admin.producers.form.sections.basic);
    expect(screen.queryByTestId("as-draft-checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(F.as_draft)).not.toBeInTheDocument();

    fireEvent.submit(
      screen.getByRole("button", { name: he.admin.producers.form.submit_update }).closest("form"),
    );
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect("as_draft" in api.put.mock.calls[0][1]).toBe(false);
  });
});

describe("ClaimLinkPanel (MEH-2325)", () => {
  it("before a click: the button, and no link", () => {
    wrap(<ClaimLinkPanel producerId="d-1" />);
    expect(screen.getByTestId("claim-link-create")).toHaveTextContent(C.create);
    expect(screen.queryByTestId("claim-link-result")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("mints a link and shows it with its expiry date", async () => {
    api.post.mockResolvedValue({
      data: {
        url: "https://mehamakor.co.il/claim/abc",
        expires_at: "2026-11-09T10:00:00+00:00",
      },
    });
    wrap(<ClaimLinkPanel producerId="d-1" />);

    fireEvent.click(screen.getByTestId("claim-link-create"));

    expect(await screen.findByTestId("claim-link-url")).toHaveValue(
      "https://mehamakor.co.il/claim/abc",
    );
    expect(api.post).toHaveBeenCalledWith("/admin/producers/d-1/claim-link");
    expect(screen.getByTestId("claim-link-expires")).toHaveTextContent("09.11.2026");
  });

  it("shows the server's 409 detail verbatim, and no link", async () => {
    const detail = "בית העסק כבר שויך לבעלת עסק";
    api.post.mockRejectedValue({ response: { status: 409, data: { detail } } });
    wrap(<ClaimLinkPanel producerId="d-2" />);

    fireEvent.click(screen.getByTestId("claim-link-create"));

    expect(await screen.findByTestId("claim-link-error")).toHaveTextContent(detail);
    expect(screen.queryByTestId("claim-link-result")).not.toBeInTheDocument();
  });

  it.each([
    ["a bad url", { url: "not-a-url", expires_at: "2026-11-09T10:00:00Z" }],
    ["a bad expires_at", { url: "https://mehamakor.co.il/claim/abc", expires_at: "x" }],
  ])("a malformed response (%s) is an error, never a link to paste", async (_, data) => {
    api.post.mockResolvedValue({ data });
    wrap(<ClaimLinkPanel producerId="d-3" />);

    fireEvent.click(screen.getByTestId("claim-link-create"));

    expect(await screen.findByTestId("claim-link-error")).toHaveTextContent(C.error);
    expect(screen.queryByTestId("claim-link-result")).not.toBeInTheDocument();
  });

  it("a failed re-mint clears the previous link", async () => {
    const detail = "בית העסק כבר שויך לבעלת עסק";
    api.post
      .mockResolvedValueOnce({
        data: { url: "https://mehamakor.co.il/claim/old", expires_at: "2026-11-09T10:00:00Z" },
      })
      .mockRejectedValueOnce({ response: { status: 409, data: { detail } } });
    wrap(<ClaimLinkPanel producerId="d-5" />);

    fireEvent.click(screen.getByTestId("claim-link-create"));
    await screen.findByTestId("claim-link-result");
    fireEvent.click(screen.getByTestId("claim-link-create"));

    expect(await screen.findByTestId("claim-link-error")).toHaveTextContent(detail);
    expect(screen.queryByTestId("claim-link-result")).not.toBeInTheDocument();
  });

  it("a failed copy says so", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    api.post.mockResolvedValue({
      data: { url: "https://mehamakor.co.il/claim/xyz", expires_at: "2026-11-09T10:00:00Z" },
    });
    wrap(<ClaimLinkPanel producerId="d-6" />);

    fireEvent.click(screen.getByTestId("claim-link-create"));
    fireEvent.click(await screen.findByTestId("claim-link-copy"));

    expect(await screen.findByTestId("claim-link-copy-failed")).toHaveTextContent(C.copy_failed);
    expect(screen.getByTestId("claim-link-copy")).toHaveTextContent(C.copy);
  });

  it("copy writes the URL to the clipboard and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    api.post.mockResolvedValue({
      data: { url: "https://mehamakor.co.il/claim/xyz", expires_at: "2026-11-09T10:00:00Z" },
    });
    wrap(<ClaimLinkPanel producerId="d-4" />);

    fireEvent.click(screen.getByTestId("claim-link-create"));
    fireEvent.click(await screen.findByTestId("claim-link-copy"));

    expect(writeText).toHaveBeenCalledWith("https://mehamakor.co.il/claim/xyz");
    await waitFor(() => expect(screen.getByTestId("claim-link-copy")).toHaveTextContent(C.copied));
  });
});

describe("edit page — the panel is for drafts only (MEH-2325)", () => {
  it.each([
    ["draft", true],
    ["approved", false],
  ])("status %s → panel shown: %s", async (status, shown) => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url === "/admin/producers/p-9" ? { id: "p-9", name: "עסק", status } : [],
      }),
    );
    wrap(<EditProducerPage />);

    await screen.findByText(he.admin.producers.form.sections.basic);
    if (shown) expect(screen.getByTestId("claim-link-panel")).toBeInTheDocument();
    else expect(screen.queryByTestId("claim-link-panel")).not.toBeInTheDocument();
  });
});
