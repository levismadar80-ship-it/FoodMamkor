/**
 * MEH-1508 ch2 Phase B — DietaryScopeCard isolation tests.
 *
 * Renders the card under the REAL NextIntlClientProvider + he.json (mirrors the
 * EditTabCategoriesCard harness). Covers value mapping BOTH directions:
 *   - seed scope value → the matching radio is checked (all↔כן, some↔לא, gluten);
 *   - 'unknown' vegan/vegetarian → neither YES/NO radio checked (unanswered);
 *   - clicking a radio + Save → api.put payload carries the mapped enum values.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import DietaryScopeCard from "@/app/[locale]/producer/dashboard/edit/DietaryScopeCard";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.dietaryScope;

function renderCard(profile = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <DietaryScopeCard profile={profile} onSave={onSave} reportDirty={() => {}} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

// A radio is addressed by its group name + accessible label.
function radio(name, label) {
  return screen
    .getAllByRole("radio", { name: label })
    .find((el) => el.getAttribute("name") === name);
}

describe("DietaryScopeCard (MEH-1508 ch2 Phase B)", () => {
  beforeEach(() => {
    api.put.mockReset();
    api.put.mockResolvedValue({ data: {} });
  });

  it("seeds the radios from the producer's scope values (value → checked)", () => {
    renderCard({
      vegan_scope: "all",
      vegetarian_scope: "some",
      gluten_free_facility: "shared",
    });
    expect(radio("vegan_scope", D.opt_yes)).toBeChecked(); // all → כן
    expect(radio("vegetarian_scope", D.opt_no)).toBeChecked(); // some → לא
    expect(radio("gluten_free_facility", D.gluten_shared)).toBeChecked();
  });

  it("'unknown' vegan/vegetarian leaves BOTH yes/no radios unchecked (unanswered)", () => {
    renderCard({ vegan_scope: "unknown", vegetarian_scope: "unknown" });
    expect(radio("vegan_scope", D.opt_yes)).not.toBeChecked();
    expect(radio("vegan_scope", D.opt_no)).not.toBeChecked();
    // gluten defaults to the 'unknown' option being checked (3-way, always set).
    expect(radio("gluten_free_facility", D.opt_unknown)).toBeChecked();
  });

  it("clicking radios + Save PUTs the mapped enum payload (checked → value)", async () => {
    const { onSave } = renderCard({
      vegan_scope: "unknown",
      vegetarian_scope: "unknown",
      gluten_free_facility: "unknown",
    });
    fireEvent.click(radio("vegan_scope", D.opt_yes)); // → all
    fireEvent.click(radio("vegetarian_scope", D.opt_no)); // → some
    fireEvent.click(radio("gluten_free_facility", D.gluten_dedicated)); // → dedicated

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      vegan_scope: "all",
      vegetarian_scope: "some",
      gluten_free_facility: "dedicated",
    });
    expect(onSave).toHaveBeenCalledWith({
      vegan_scope: "all",
      vegetarian_scope: "some",
      gluten_free_facility: "dedicated",
    });
  });

  it("Save stays disabled until something changes (dirty gate)", () => {
    renderCard({
      vegan_scope: "all",
      vegetarian_scope: "all",
      gluten_free_facility: "unknown",
    });
    expect(screen.getByRole("button")).toBeDisabled();
    fireEvent.click(radio("vegan_scope", D.opt_no)); // all → some
    expect(screen.getByRole("button")).toBeEnabled();
  });
});
