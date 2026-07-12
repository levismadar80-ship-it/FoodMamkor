/**
 * MEH-1157 — BioPanelCard error-mapping isolation tests.
 *
 * Renders the CARD directly (not ProducerDashboardEditPage — the full-page
 * mount hangs the vitest runner) under the REAL NextIntlClientProvider +
 * he.json, mirroring the EditTabCategoriesCard harness. Covers the four
 * generate() outcomes: 401 (session expired), 429 (bio limiter 5/hour),
 * 200 {"bio": ""} (backend fail-open, MEH-56), and a plain network error
 * (generic copy).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { BioPanelCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const B = he.dashboard.producer.bio;

function renderCard(props = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <BioPanelCard
        profile={{ instagram: "@mehamakor" }}
        onSave={onSave}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

const clickGenerate = () =>
  fireEvent.click(screen.getByRole("button", { name: B.generate_cta }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Edit-tab BioPanelCard error mapping (MEH-1157)", () => {
  it("401 → session-expired copy (not the generic input-blaming error)", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 401 } });
    renderCard();
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(B.error_session_expired);
  });

  it("429 (limiter 5/hour) → rate-limit copy", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 429 } });
    renderCard();
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(B.error_rate_limit);
  });

  it('200 with {"bio": ""} (fail-open) → service-unavailable copy', async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "" } });
    renderCard();
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(B.error_unavailable);
  });

  it("network / other error → existing generic copy", async () => {
    api.post.mockRejectedValueOnce(new Error("network"));
    renderCard();
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(B.error_generate);
  });

  it("successful generate shows the editable bio, no error", async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "ביו שנוצר" } });
    renderCard();
    clickGenerate();
    expect(await screen.findByDisplayValue("ביו שנוצר")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
