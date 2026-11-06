/**
 * MEH-2729 — TagsCard: one «תגים» card holding «תזונה» (MEH-1508) and
 * «גידול במרעה» (MEH-1851 row 23) as sub-sections with ONE save.
 *
 * Ports the DietaryScopeCard + GrassFedCard isolation tests (both components
 * were merged into this one) and adds the merge's own contract:
 *   - both sub-headings render, diet first;
 *   - the payload carries ONLY the keys that changed (PUT /producers/me is
 *     shared by every card; an untouched key must not overwrite a sibling's);
 *   - activeTagCount drives the summary line.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import TagsCard, { activeTagCount } from "@/app/[locale]/producer/dashboard/edit/TagsCard";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.dietaryScope;
const G = he.dashboard.producer.grassFed;
const T = he.dashboard.producer.tags;
const CHROME = he.dashboard.producer.pricing;

function renderCard(profile = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <TagsCard profile={profile} onSave={onSave} reportDirty={() => {}} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

function radio(name, label) {
  return screen
    .getAllByRole("radio", { name: label })
    .find((el) => el.getAttribute("name") === name);
}
const box = () => screen.getByRole("checkbox", { name: G.label });
const saveBtn = () => screen.getByRole("button", { name: CHROME.save_cta });

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
});

describe("TagsCard structure (MEH-2729)", () => {
  it("shows «תזונה» then «גידול במרעה» as sub-headings, with ONE save button", () => {
    renderCard();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([D.heading, G.heading]);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("the card copy is the one Sapir approved", () => {
    expect(T.heading).toBe("תגים");
  });
});

describe("TagsCard — diet (ported from DietaryScopeCard, MEH-1508)", () => {
  it("seeds the radios from the producer's scope values", () => {
    renderCard({ vegan_scope: "all", vegetarian_scope: "some", gluten_free_facility: "shared" });
    expect(radio("vegan_scope", D.opt_yes)).toBeChecked();
    expect(radio("vegetarian_scope", D.opt_no)).toBeChecked();
    expect(radio("gluten_free_facility", D.gluten_shared)).toBeChecked();
  });

  it("'unknown' vegan/vegetarian leaves BOTH yes/no radios unchecked", () => {
    renderCard({ vegan_scope: "unknown", vegetarian_scope: "unknown" });
    expect(radio("vegan_scope", D.opt_yes)).not.toBeChecked();
    expect(radio("vegan_scope", D.opt_no)).not.toBeChecked();
    expect(radio("gluten_free_facility", D.opt_unknown)).toBeChecked();
  });

  it("changing the three diet answers PUTs exactly those three keys", async () => {
    const { onSave } = renderCard({
      vegan_scope: "unknown",
      vegetarian_scope: "unknown",
      gluten_free_facility: "unknown",
    });
    fireEvent.click(radio("vegan_scope", D.opt_yes));
    fireEvent.click(radio("vegetarian_scope", D.opt_no));
    fireEvent.click(radio("gluten_free_facility", D.gluten_dedicated));
    fireEvent.click(saveBtn());
    const expected = { vegan_scope: "all", vegetarian_scope: "some", gluten_free_facility: "dedicated" };
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith("/producers/me", expected);
    expect(onSave).toHaveBeenCalledWith(expected);
  });
});

describe("TagsCard — grass-fed (ported from GrassFedCard, MEH-1851 row 23)", () => {
  it("seeds the checkbox from producer.grass_fed", () => {
    const { unmount } = renderCard({ grass_fed: true });
    expect(box()).toBeChecked();
    unmount();
    renderCard({});
    expect(box()).not.toBeChecked();
  });

  it("save is disabled until something changes, then sends ONLY grass_fed", async () => {
    const { onSave } = renderCard({ grass_fed: false, vegan_scope: "all" });
    expect(saveBtn()).toBeDisabled();
    fireEvent.click(box());
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [url, payload] = api.put.mock.calls[0];
    expect(url).toBe("/producers/me");
    // Exact shape: the untouched diet keys must not ride along.
    expect(payload).toEqual({ grass_fed: true });
    expect(onSave).toHaveBeenCalledWith({ grass_fed: true });
  });

  it("un-declaring sends grass_fed:false", async () => {
    renderCard({ grass_fed: true });
    fireEvent.click(box());
    fireEvent.click(saveBtn());
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1]).toEqual({ grass_fed: false });
  });

  it("toggling back to the stored value disables save again (no no-op PUT)", () => {
    renderCard({ grass_fed: false });
    fireEvent.click(box());
    fireEvent.click(box());
    expect(saveBtn()).toBeDisabled();
  });

  it("the owner-facing label matches the consumer chip string exactly", async () => {
    const { TOGGLE_CHIPS } = await import("@/lib/map-chips");
    const chip = TOGGLE_CHIPS.find((c) => c.key === "grass_fed");
    expect(chip).toBeDefined();
    expect(G.label).toBe(chip.label);
  });
});

describe("activeTagCount (summary line)", () => {
  it.each([
    [{}, 0],
    [{ vegan_scope: "some", vegetarian_scope: "unknown", gluten_free_facility: "shared", grass_fed: false }, 0],
    [{ grass_fed: true }, 1],
    [{ vegan_scope: "all", vegetarian_scope: "all" }, 2],
    [{ vegan_scope: "all", vegetarian_scope: "all", gluten_free_facility: "dedicated", grass_fed: true }, 4],
  ])("%j → %i", (profile, n) => {
    expect(activeTagCount(profile)).toBe(n);
  });
});
