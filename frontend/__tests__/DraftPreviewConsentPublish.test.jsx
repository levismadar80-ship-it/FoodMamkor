/**
 * MEH-3377 — the read-only draft preview link and «פרסום בהסכמה».
 *
 * Three surfaces:
 *   - DraftPreviewLinkPanel mints the link and shows it; a refusal shows the
 *     server's reason and no link.
 *   - PublishWithConsentPanel posts only with a note AND the consent box, and
 *     sends the licence override only when its box is ticked.
 *   - DraftPreviewClient (what the business opens): loading → the page with
 *     the banner, or the dead-link page.
 *   - The edit page shows the two panels for an OWNERLESS draft only.
 *
 * Honest limit: ProducerDetail is a stand-in here (it has its own suite); the
 * rendered page is covered by the 390 / 1280 captures in qa-artifacts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import DraftPreviewLinkPanel from "@/components/admin/DraftPreviewLinkPanel";
import PublishWithConsentPanel from "@/components/admin/PublishWithConsentPanel";
import DraftPreviewClient from "@/app/[locale]/draft-preview/[token]/DraftPreviewClient";
import EditProducerPage from "@/app/[locale]/admin/producers/[id]/edit/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "p-9" }),
}));
const adminAuth = { user: { role: "admin" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => adminAuth }));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({
  default: ({ initialProducer }) => (
    <div data-testid="producer-detail" data-name={initialProducer?.name || ""} />
  ),
}));
// The edit page's form and sibling panels have their own suites.
vi.mock("@/components/admin/ProducerForm", () => ({ default: () => <div data-testid="form" /> }));
vi.mock("@/components/admin/DraftProductsPanel", () => ({ default: () => null }));

const L = he.admin.producers.draft_preview;
const P = he.admin.producers.consent_publish;
const D = he.draft_preview;

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DraftPreviewLinkPanel", () => {
  it("before a click: the button, no link, no request", () => {
    wrap(<DraftPreviewLinkPanel producerId="d-1" />);
    expect(screen.getByTestId("draft-preview-link-create")).toHaveTextContent(L.create);
    expect(screen.queryByTestId("draft-preview-link-result")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("mints from the preview-link route and shows the link", async () => {
    const url = "https://mehamakor.co.il/draft-preview/aaa.bbb.ccc";
    api.post.mockResolvedValue({ data: { url, expires_at: "2026-12-01T10:00:00Z" } });
    wrap(<DraftPreviewLinkPanel producerId="d-1" />);
    fireEvent.click(screen.getByTestId("draft-preview-link-create"));
    await waitFor(() => expect(screen.getByTestId("draft-preview-link-url")).toHaveValue(url));
    expect(api.post).toHaveBeenCalledWith("/admin/producers/d-1/preview-link");
  });

  it("a refusal shows the server's reason and no link", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "אפשר רק לטיוטה שעוד אין לה בעלים" } } });
    wrap(<DraftPreviewLinkPanel producerId="d-1" />);
    fireEvent.click(screen.getByTestId("draft-preview-link-create"));
    expect(await screen.findByTestId("draft-preview-link-error")).toHaveTextContent(
      "אפשר רק לטיוטה שעוד אין לה בעלים",
    );
    expect(screen.queryByTestId("draft-preview-link-result")).not.toBeInTheDocument();
  });
});

describe("PublishWithConsentPanel", () => {
  const fill = (note = "אישרו בוואטסאפ, 17.11") =>
    fireEvent.change(screen.getByTestId("consent-publish-note"), { target: { value: note } });
  const tick = (id) => fireEvent.click(screen.getByTestId(id));
  const submit = () => screen.getByTestId("consent-publish-submit");

  it("empty: the button is disabled", () => {
    wrap(<PublishWithConsentPanel producerId="d-1" />);
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveTextContent(P.submit);
  });

  it("a note without the consent box: still disabled", () => {
    wrap(<PublishWithConsentPanel producerId="d-1" />);
    fill();
    expect(submit()).toBeDisabled();
  });

  it("the consent box without a note (spaces only): still disabled", () => {
    wrap(<PublishWithConsentPanel producerId="d-1" />);
    fill("   ");
    tick("consent-publish-consent");
    expect(submit()).toBeDisabled();
  });

  it("note + consent: posts the trimmed note, with NO licence override", async () => {
    api.post.mockResolvedValue({ data: { status: "approved" } });
    const onPublished = vi.fn();
    wrap(<PublishWithConsentPanel producerId="d-1" onPublished={onPublished} />);
    fill("  אישרו בוואטסאפ, 17.11  ");
    tick("consent-publish-consent");
    fireEvent.click(submit());
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(
      "/admin/producers/d-1/publish-with-consent",
      { consent_confirmed: true, consent_note: "אישרו בוואטסאפ, 17.11" },
      undefined,
    );
  });

  const SHOT = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/abc.jpg";
  const pick = () =>
    fireEvent.change(screen.getByTestId("consent-publish-screenshot"), {
      target: { files: [new File(["x"], "yes.png", { type: "image/png" })] },
    });

  it("a screenshot: uploaded on pick, then its URL rides the publish request", async () => {
    api.post.mockImplementation((url) =>
      Promise.resolve({ data: url === "/upload/image" ? { url: SHOT } : { status: "approved" } }),
    );
    const onPublished = vi.fn();
    wrap(<PublishWithConsentPanel producerId="d-1" onPublished={onPublished} />);
    pick();
    const attached = await screen.findByTestId("consent-publish-screenshot-attached");
    expect(attached.querySelector("a")).toHaveAttribute("href", SHOT);
    expect(api.post.mock.calls[0][0]).toBe("/upload/image");
    expect(api.post.mock.calls[0][1].get("file").name).toBe("yes.png");
    fill();
    tick("consent-publish-consent");
    fireEvent.click(submit());
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenLastCalledWith(
      "/admin/producers/d-1/publish-with-consent",
      {
        consent_confirmed: true,
        consent_note: "אישרו בוואטסאפ, 17.11",
        consent_screenshot_url: SHOT,
      },
      undefined,
    );
  });

  it("a screenshot removed before publishing: the request carries none", async () => {
    api.post.mockImplementation((url) =>
      Promise.resolve({ data: url === "/upload/image" ? { url: SHOT } : { status: "approved" } }),
    );
    const onPublished = vi.fn();
    wrap(<PublishWithConsentPanel producerId="d-1" onPublished={onPublished} />);
    pick();
    await screen.findByTestId("consent-publish-screenshot-attached");
    tick("consent-publish-screenshot-remove");
    expect(screen.getByTestId("consent-publish-screenshot")).toBeInTheDocument();
    fill();
    tick("consent-publish-consent");
    fireEvent.click(submit());
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(api.post.mock.lastCall[1]).toEqual({
      consent_confirmed: true,
      consent_note: "אישרו בוואטסאפ, 17.11",
    });
  });

  it("a screenshot upload in flight: publishing waits for it", async () => {
    let finish;
    api.post.mockImplementation(() => new Promise((res) => { finish = res; }));
    wrap(<PublishWithConsentPanel producerId="d-1" />);
    fill();
    tick("consent-publish-consent");
    expect(submit()).not.toBeDisabled();
    pick();
    await waitFor(() => expect(submit()).toBeDisabled());
    finish({ data: { url: SHOT } });
    await screen.findByTestId("consent-publish-screenshot-attached");
    expect(submit()).not.toBeDisabled();
  });

  it("a screenshot upload that fails: the server's reason, and publishing stays possible", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "תמונה גדולה מדי (מקסימום 5MB)" } } });
    wrap(<PublishWithConsentPanel producerId="d-1" />);
    pick();
    expect(await screen.findByTestId("consent-publish-screenshot-error")).toHaveTextContent(
      "תמונה גדולה מדי (מקסימום 5MB)",
    );
    expect(screen.queryByTestId("consent-publish-screenshot-attached")).not.toBeInTheDocument();
    fill();
    tick("consent-publish-consent");
    expect(submit()).not.toBeDisabled();
  });

  it("the licence box ticked: the override is sent", async () => {
    api.post.mockResolvedValue({ data: { status: "approved" } });
    wrap(<PublishWithConsentPanel producerId="d-1" />);
    fill();
    tick("consent-publish-consent");
    tick("consent-publish-without-license");
    fireEvent.click(submit());
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][2]).toEqual({ params: { allow_without_license: true } });
  });

  it("a refusal shows the server's reason and does not report success", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "לא ניתן לאשר בית עסק ללא תמונה." } } });
    const onPublished = vi.fn();
    wrap(<PublishWithConsentPanel producerId="d-1" onPublished={onPublished} />);
    fill();
    tick("consent-publish-consent");
    fireEvent.click(submit());
    expect(await screen.findByTestId("consent-publish-error")).toHaveTextContent(
      "לא ניתן לאשר בית עסק ללא תמונה.",
    );
    expect(onPublished).not.toHaveBeenCalled();
    expect(submit()).not.toBeDisabled();
  });
});

describe("DraftPreviewClient — what the business opens", () => {
  it("a valid link: the banner and the page, read from the token route", async () => {
    api.get.mockResolvedValue({ data: { id: "p-1", name: "משק הדוגמה" } });
    wrap(<DraftPreviewClient token="aaa.bbb.ccc" />);
    expect(screen.getByTestId("draft-preview-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("draft-preview-banner")).toHaveTextContent(D.banner);
    expect(screen.getByTestId("producer-detail")).toHaveAttribute("data-name", "משק הדוגמה");
    expect(api.get).toHaveBeenCalledWith("/producer-preview/aaa.bbb.ccc");
  });

  it("a dead link (404): the «לא פעיל» page, and no business page", async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });
    wrap(<DraftPreviewClient token="dead" />);
    expect(await screen.findByTestId("draft-preview-invalid")).toHaveTextContent(D.invalid.title);
    expect(screen.queryByTestId("producer-detail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("draft-preview-banner")).not.toBeInTheDocument();
  });

  it("a 200 with no business in it: treated as dead, never rendered", async () => {
    api.get.mockResolvedValue({ data: {} });
    wrap(<DraftPreviewClient token="odd" />);
    expect(await screen.findByTestId("draft-preview-invalid")).toBeInTheDocument();
  });
});

describe("the edit page — who gets the two panels", () => {
  const open = async (producer) => {
    api.get.mockResolvedValue({ data: { id: "p-9", name: "טיוטה", products: [], ...producer } });
    wrap(<EditProducerPage />);
    await screen.findByTestId("form");
  };

  it("an ownerless draft: both panels", async () => {
    await open({ status: "draft", has_owner: false });
    expect(screen.getByTestId("draft-preview-link-panel")).toBeInTheDocument();
    expect(screen.getByTestId("consent-publish-panel")).toBeInTheDocument();
  });

  it("a draft that has an owner: neither", async () => {
    await open({ status: "draft", has_owner: true });
    expect(screen.queryByTestId("draft-preview-link-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consent-publish-panel")).not.toBeInTheDocument();
  });

  it("a draft whose has_owner was not hydrated (null): neither — fail closed", async () => {
    await open({ status: "draft", has_owner: null });
    expect(screen.queryByTestId("consent-publish-panel")).not.toBeInTheDocument();
  });

  it("a published business with a consent screenshot: the link to it", async () => {
    await open({ status: "approved", has_owner: false, consent_screenshot_url: "https://res.cloudinary.com/demo/image/upload/a.jpg" });
    expect(screen.getByTestId("consent-screenshot-link")).toHaveAttribute(
      "href",
      "https://res.cloudinary.com/demo/image/upload/a.jpg",
    );
  });

  it("a business with no consent screenshot: no link", async () => {
    await open({ status: "approved", has_owner: false });
    expect(screen.queryByTestId("consent-screenshot-link")).not.toBeInTheDocument();
  });

  it("an approved business: neither", async () => {
    await open({ status: "approved", has_owner: false });
    expect(screen.queryByTestId("draft-preview-link-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consent-publish-panel")).not.toBeInTheDocument();
  });
});
