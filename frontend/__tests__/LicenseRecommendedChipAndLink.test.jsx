/**
 * MEH-3026 — a missing licence blocks nothing, so the trust card says «מומלץ»
 * (not «רשות», not «חובה») while a license-required category has no number,
 * and the «נשאר להשלים» CTA lands on the licence section in that case.
 * Behaviour tests: render, then read what came out.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import EditAccordionCard from "@/components/EditAccordionCard";
import ChangesRequestedBanner from "@/app/[locale]/producer/dashboard/ChangesRequestedBanner";
import { licenseMissingForProfile } from "@/lib/license-required-categories";

vi.mock("@phosphor-icons/react", () => ({
  CaretDown: () => <span />,
  ClipboardText: () => <span />,
  CheckCircle: () => <span />,
  Warning: () => <span />,
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const ACC = he.dashboard.producer.edit_accordion;
const BAKERY = { id: 1, name: "לחמים ואפייה", requires_license: true };
const VEG = { id: 2, name: "ירקות", requires_license: false };

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

const card = (props) =>
  wrap(
    <EditAccordionCard title="t" open={false} onToggle={() => {}} {...props}>
      <div />
    </EditAccordionCard>,
  );

describe("licenseMissingForProfile", () => {
  it.each([
    ["license-required category, no number", { categories: [BAKERY], producer_license_number: null }, true],
    ["license-required category, blank number", { categories: [BAKERY], producer_license_number: "  " }, true],
    ["license-required category, with number", { categories: [BAKERY], producer_license_number: "1234567" }, false],
    ["no license-required category", { categories: [VEG], producer_license_number: null }, false],
    ["no categories", { categories: [] }, false],
    ["no profile", null, false],
  ])("%s", (_name, profile, expected) => {
    expect(licenseMissingForProfile(profile)).toBe(expected);
  });
});

describe("trust card chip", () => {
  it("CONTROL: the three chip strings differ", () => {
    expect(new Set([ACC.chip_required, ACC.chip_optional, ACC.chip_recommended]).size).toBe(3);
  });

  it("recommended → «מומלץ»", () => {
    card({ anchorId: "trust", recommended: true });
    expect(screen.getByTestId("section-chip-trust")).toHaveTextContent(ACC.chip_recommended);
  });

  it("not recommended → «רשות», as before", () => {
    card({ anchorId: "trust" });
    expect(screen.getByTestId("section-chip-trust")).toHaveTextContent(ACC.chip_optional);
  });

  it("recommended never downgrades a required card", () => {
    card({ anchorId: "images", recommended: true });
    expect(screen.getByTestId("section-chip-images")).toHaveTextContent(ACC.chip_required);
  });
});

describe("«נשאר להשלים» CTA target", () => {
  const banner = (extra) =>
    wrap(<ChangesRequestedBanner profile={{ requested_changes: "חסר מספר רישיון ייצור", ...extra }} />);

  it("licence missing → the licence section", () => {
    banner({ categories: [BAKERY], producer_license_number: null });
    expect(screen.getByTestId("changes-requested-cta")).toHaveAttribute(
      "href",
      "/producer/dashboard/edit#license",
    );
  });

  it("licence present → the edit hub, as before", () => {
    banner({ categories: [BAKERY], producer_license_number: "1234567" });
    expect(screen.getByTestId("changes-requested-cta")).toHaveAttribute("href", "/producer/dashboard/edit");
  });

  it("no license-required category → the edit hub", () => {
    banner({ categories: [VEG] });
    expect(screen.getByTestId("changes-requested-cta")).toHaveAttribute("href", "/producer/dashboard/edit");
  });
});
