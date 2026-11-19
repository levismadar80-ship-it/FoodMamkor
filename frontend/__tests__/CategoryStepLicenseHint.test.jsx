/**
 * MEH-2928 — the licence hint names the category that caused the requirement,
 * and the "what is it" line no longer contradicts the opt-in line.
 *
 * Renders the real CategoryStep with the real he.json through next-intl, so the
 * ICU plural and the interpolated names are what a business owner reads.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import he from "../messages/he.json";
import CategoryStep from "@/app/[locale]/register/producer/steps/CategoryStep";
import {
  formatHebrewQuotedList,
  licenseRequiringCategoryNames,
} from "@/lib/license-required-categories";

const CATEGORIES = [
  { id: 1, name: "ירקות", slug: "veg", requires_license: false },
  { id: 2, name: "לחמים ואפייה", slug: "bread", requires_license: true },
  { id: 3, name: "דבש", slug: "honey", requires_license: true },
];

function Harness({ selected }) {
  const t = useTranslations();
  const names = licenseRequiringCategoryNames(CATEGORIES, selected);
  return (
    <CategoryStep
      categories={CATEGORIES}
      categoriesFailed={false}
      fieldErrors={{}}
      form={{ category_ids: selected, producer_license_number: "" }}
      licenseCategoryNames={names}
      licenseOptionalExpanded={false}
      licensePending={false}
      licenseRequired={names.length > 0}
      licenseRequiredError={false}
      licenseWarning={false}
      loadCategories={vi.fn()}
      numberedTitle={(title) => title}
      requestFocus={vi.fn()}
      runRequiredGate={vi.fn()}
      set={() => vi.fn()}
      setAndSave={vi.fn()}
      setError={vi.fn()}
      setLicenseOptionalExpanded={vi.fn()}
      setLicensePending={vi.fn()}
      setLicenseRequiredError={vi.fn()}
      setShowCategoryModal={vi.fn()}
      setStep={vi.fn()}
      setStepError={vi.fn()}
      t={t}
      toggleCategory={vi.fn()}
    />
  );
}

function renderStep(selected) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <Harness selected={selected} />
    </NextIntlClientProvider>,
  );
}

describe("licence hint names the category (MEH-2928)", () => {
  it("one category: «ירקות» + bakery names only the bakery", () => {
    renderStep([1, 2]);
    const hint = screen.getByTestId("register-license-required-hint");
    expect(hint).toHaveTextContent("הקטגוריה «לחמים ואפייה» דורשת רישיון ייצור ממשרד הבריאות");
    expect(hint).not.toHaveTextContent("ירקות");
    expect(hint).not.toHaveTextContent("בקטגוריה זו");
  });

  it("two categories: both are named, in the plural", () => {
    renderStep([3, 1, 2]);
    expect(screen.getByTestId("register-license-required-hint")).toHaveTextContent(
      "הקטגוריות «דבש» ו«לחמים ואפייה» דורשות רישיון ייצור ממשרד הבריאות",
    );
  });

  it("no licence category: the hint is not rendered", () => {
    renderStep([1]);
    expect(screen.queryByTestId("register-license-required-hint")).toBeNull();
  });

  it("the explainer no longer promises completion «אחרי האישור»", () => {
    renderStep([2]);
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("אחרי האישור");
    expect(body).toContain("העסק יעלה לאתר אחרי שנקבל את המספר");
  });
});

describe("formatHebrewQuotedList", () => {
  it("joins with ו on the last item, no space", () => {
    expect(formatHebrewQuotedList(["א"])).toBe("«א»");
    expect(formatHebrewQuotedList(["א", "ב"])).toBe("«א» ו«ב»");
    expect(formatHebrewQuotedList(["א", "ב", "ג"])).toBe("«א», «ב» ו«ג»");
  });
});
