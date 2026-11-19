// MEH-3464: the owner-claim panel and the draft-preview panel are one
// AdminLinkPanel. Each wrapper still posts to its own endpoint, with its own
// copy and test-id prefix (AdminClaimLink.test.jsx covers the panel's states).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ClaimLinkPanel from "@/components/admin/ClaimLinkPanel";
import DraftPreviewLinkPanel from "@/components/admin/DraftPreviewLinkPanel";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

const LINK = { url: "https://example.test/x/tok", expires_at: "2026-12-03T10:00:00Z" };

describe.each([
  ["claim", ClaimLinkPanel, "/admin/producers/p-9/claim-link", "claim-link", he.admin.producers.claim],
  ["preview", DraftPreviewLinkPanel, "/admin/producers/p-9/preview-link", "draft-preview-link", he.admin.producers.draft_preview],
])("%s panel", (_n, Panel, endpoint, prefix, copy) => {
  beforeEach(() => api.post.mockReset());

  it("shows its own title and posts to its own endpoint, then shows the link", async () => {
    api.post.mockResolvedValue({ data: LINK });
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <Panel producerId="p-9" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId(`${prefix}-panel`)).toHaveTextContent(copy.title);
    fireEvent.click(screen.getByTestId(`${prefix}-create`));
    await waitFor(() => expect(screen.getByTestId(`${prefix}-url`)).toHaveValue(LINK.url));
    expect(api.post).toHaveBeenCalledWith(endpoint);
  });
});
