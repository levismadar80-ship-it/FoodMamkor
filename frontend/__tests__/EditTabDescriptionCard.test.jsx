/**
 * MEH-1173 — DescriptionCard isolation tests (was EditTabBioPanel).
 *
 * Renders the CARD directly (the full-page mount hangs the vitest runner)
 * under the REAL NextIntlClientProvider + he.json, mirroring the
 * EditTabCategoriesCard harness. Covers:
 *   • disabled generate button + visible reason line (q_sell empty)
 *   • structured {sells, area, special, instagram} payload
 *   • success → hero filled + toast + assist closed
 *   • empty fail-open result NEVER wipes existing text (MEH-1163)
 *   • single save → PUT {description, short_description} (both fields)
 *   • MEH-1157 error mapping preserved 1:1 (401 / 429 / fail-open / other)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { DescriptionCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const D = he.dashboard.producer.description_card;

function renderCard(props = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <DescriptionCard profile={{}} onSave={onSave} {...props} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

const openAssist = () =>
  fireEvent.click(screen.getByRole("button", { name: D.assist_cta }));
const typeSell = (v) =>
  fireEvent.change(screen.getByPlaceholderText(D.q_sell_placeholder), {
    target: { value: v },
  });
const clickGenerate = () =>
  fireEvent.click(screen.getByRole("button", { name: D.generate_cta }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DescriptionCard — assist gating (MEH-1173)", () => {
  it("generate is disabled with a visible reason until q_sell has content", () => {
    renderCard();
    openAssist();
    expect(screen.getByRole("button", { name: D.generate_cta })).toBeDisabled();
    expect(screen.getByText(D.generate_hint_disabled)).toBeInTheDocument();

    typeSell("ריבות ביתיות");
    expect(screen.getByRole("button", { name: D.generate_cta })).toBeEnabled();
    expect(screen.queryByText(D.generate_hint_disabled)).not.toBeInTheDocument();
  });

  it("sends the structured payload (sells + optional area/special/instagram)", async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "תיאור" } });
    renderCard({ profile: { instagram: "https://instagram.com/jam" } });
    openAssist();
    typeSell("ריבות ביתיות");
    fireEvent.change(screen.getByPlaceholderText(D.q_area_placeholder), {
      target: { value: "הגליל" },
    });
    fireEvent.change(screen.getByPlaceholderText(D.q_special_placeholder), {
      target: { value: "מתכון סבתא" },
    });
    clickGenerate();
    await screen.findByDisplayValue("תיאור");
    expect(api.post).toHaveBeenCalledWith("/producers/me/bio/generate", {
      sells: "ריבות ביתיות",
      area: "הגליל",
      special: "מתכון סבתא",
      instagram: "https://instagram.com/jam",
    });
  });
});

describe("DescriptionCard — generate outcomes (MEH-1173 / MEH-1163)", () => {
  it("success fills the hero field, fires the toast, and closes the assist", async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "ריבות בעבודת יד מהגליל" } });
    renderCard();
    openAssist();
    typeSell("ריבות");
    clickGenerate();
    expect(await screen.findByDisplayValue("ריבות בעבודת יד מהגליל")).toBeInTheDocument();
    expect(showToast.success).toHaveBeenCalledWith(D.toast_generated);
    // assist panel closed → its title is gone
    expect(screen.queryByText(D.assist_title)).not.toBeInTheDocument();
  });

  it("empty fail-open result keeps existing text and shows the unavailable copy", async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "" } });
    renderCard({ profile: { description: "טקסט שלא נמחק" } });
    openAssist();
    typeSell("ריבות");
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(D.error_unavailable);
    expect(screen.getByDisplayValue("טקסט שלא נמחק")).toBeInTheDocument();
  });
});

describe("DescriptionCard — single save (MEH-1173 / MEH-1002)", () => {
  it("one save sends BOTH description and short_description", async () => {
    api.put.mockResolvedValueOnce({});
    const { onSave } = renderCard();
    fireEvent.change(screen.getByPlaceholderText(D.desc_placeholder), {
      target: { value: "תיאור מלא של העסק" },
    });
    fireEvent.change(screen.getByPlaceholderText(D.tagline_placeholder), {
      target: { value: "ריבות בוטיק מהגליל" },
    });
    fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
    await screen.findByRole("button", { name: D.saved });
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      description: "תיאור מלא של העסק",
      short_description: "ריבות בוטיק מהגליל",
      // MEH-1261 F5: instagram joined the save payload (untouched here → null).
      instagram: null,
    });
    expect(onSave).toHaveBeenCalledWith({
      description: "תיאור מלא של העסק",
      short_description: "ריבות בוטיק מהגליל",
      instagram: null,
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("empty tagline saves short_description as null", async () => {
    api.put.mockResolvedValueOnce({});
    renderCard();
    fireEvent.change(screen.getByPlaceholderText(D.desc_placeholder), {
      target: { value: "רק תיאור, בלי משפט תדמית" },
    });
    fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
    await screen.findByRole("button", { name: D.saved });
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      description: "רק תיאור, בלי משפט תדמית",
      short_description: null,
      // MEH-1261 F5: instagram joined the save payload (untouched here → null).
      instagram: null,
    });
  });
});

describe("DescriptionCard — error mapping preserved (MEH-1157)", () => {
  const cases = [
    [401, D.error_session_expired],
    [429, D.error_rate_limit],
  ];
  it.each(cases)("HTTP %s → matching copy", async (status, copy) => {
    api.post.mockRejectedValueOnce({ response: { status } });
    renderCard();
    openAssist();
    typeSell("ריבות");
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(copy);
  });

  it("network / other error → generic copy", async () => {
    api.post.mockRejectedValueOnce(new Error("network"));
    renderCard();
    openAssist();
    typeSell("ריבות");
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(D.error_generate);
  });
});
