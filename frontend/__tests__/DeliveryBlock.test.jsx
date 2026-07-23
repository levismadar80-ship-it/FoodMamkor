import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1146 chunk B — editorial delivery: per-city rows (city · min order · day,
// fix 4) + an optional self-pickup line (fix 6). MEH-1466: the tertiary WhatsApp
// order CTA was removed (all producer-detail WA CTAs open the same wa.me).

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    // MEH-1233 B3: the delivery day is now labeled ("משלוח ביום {day}").
    if (key === "delivery_day_label") return `משלוח ביום ${vars?.day ?? ""}`;
    // MEH-1305 A: dispatch-day pivot copy.
    if (key === "dispatch_days") return `יוצאים בימי ${vars?.day ?? ""}`;
    if (key === "delivery_day_group") return `ימי ${vars?.day ?? ""}`;
    // MEH-1255: nationwide-with-exclusions display.
    if (key === "nationwide_except") return `משלוחים לכל הארץ (למעט ${vars?.cities ?? ""})`;
    // MEH-1435: compact city-list toggle copy.
    if (key === "show_all") return `הצג עוד ${vars?.count ?? ""} ערים`;
    const map = {
      "heading": "משלוחים",
      "nationwide": "משלוחים לכל הארץ",
      "arranged": "בתיאום מראש",
      "arranged_group": "בתיאום מראש",
      "min_order": "מינימום",
      "pickup": "איסוף עצמי",
      "show_less": "הצג פחות",
      // MEH-1512: map.mini keys reused by the pickup-row Waze nav link.
      "open_in_waze": "Waze",
      "open_in_waze_aria": "פתיחה ב-Waze",
    };
    return map[key] ?? key;
  },
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  normalizePhone: (p) => (p ? p.replace(/^0/, "972").replace(/\D/g, "") : ""),
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { Truck: Stub, Package: Stub, WhatsappLogo: Stub, CaretDown: Stub, CaretUp: Stub, NavigationArrow: Stub };
});

import DeliveryBlock from "@/components/DeliveryBlock";

const producer = { id: 1, name: "חוות", phone: "0501234567" };

describe("DeliveryBlock (MEH-1146 chunk B)", () => {
  it("MEH-1305 A: one shared day is hoisted to a subline, rows carry city + min only", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "זכרון יעקב", min_order: 100, delivery_day: "שישי" },
          { id: 2, city: "עתלית", min_order: 120, delivery_day: "שישי" },
        ]}
        pickup={false}
        producer={producer}
      />,
    );
    // Day stated ONCE in the hoisted subline, not repeated per row.
    expect(screen.getByText("יוצאים בימי שישי")).toBeInTheDocument();
    expect(screen.queryByText("משלוח ביום שישי")).not.toBeInTheDocument();
    expect(screen.getByText("זכרון יעקב")).toBeInTheDocument();
    expect(screen.getByText(/100₪/)).toBeInTheDocument(); // formatPrice canonical
  });

  it("MEH-1305 A: 2+ distinct days group under day headers", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי" },
          { id: 2, city: "עכו", min_order: 80, delivery_day: "שלישי" },
        ]}
        pickup={false}
        producer={producer}
      />,
    );
    expect(screen.getByText("ימי שישי")).toBeInTheDocument();
    expect(screen.getByText("ימי שלישי")).toBeInTheDocument();
    expect(screen.getByText("חיפה")).toBeInTheDocument();
    expect(screen.getByText("עכו")).toBeInTheDocument();
  });

  it("shows the self-pickup line only when pickup_points is set", () => {
    const { rerender } = render(
      <DeliveryBlock nationwide={false} areas={[]} pickup={false} producer={producer} />,
    );
    expect(screen.queryByText("איסוף עצמי")).not.toBeInTheDocument();
    rerender(
      <DeliveryBlock nationwide={false} areas={[]} pickup={true} producer={producer} />,
    );
    expect(screen.getByText("איסוף עצמי")).toBeInTheDocument();
  });

  it("shows the plain nationwide badge when there are no exclusions", () => {
    render(
      <DeliveryBlock nationwide={true} excluded={[]} areas={[]} pickup={false} producer={producer} />,
    );
    expect(screen.getByText("משלוחים לכל הארץ")).toBeInTheDocument();
    expect(screen.queryByText(/למעט/)).not.toBeInTheDocument();
  });

  it("shows 'משלוחים לכל הארץ (למעט …)' when nationwide has an exclusion list (MEH-1255)", () => {
    render(
      <DeliveryBlock
        nationwide={true}
        excluded={["זכרון יעקב", "עתלית"]}
        areas={[]}
        pickup={false}
        producer={producer}
      />,
    );
    expect(
      screen.getByText("משלוחים לכל הארץ (למעט זכרון יעקב, עתלית)"),
    ).toBeInTheDocument();
  });

  it("ignores an exclusion list when not nationwide (guarded upstream)", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        excluded={["זכרון יעקב"]}
        areas={[{ id: 1, city: "חיפה", min_order: 0, delivery_day: "" }]}
        pickup={false}
        producer={producer}
      />,
    );
    expect(screen.queryByText(/למעט/)).not.toBeInTheDocument();
    expect(screen.getByText("חיפה")).toBeInTheDocument();
  });

  it("MEH-1466: no WhatsApp order CTA is rendered inside the delivery section", () => {
    render(
      <DeliveryBlock nationwide={true} areas={[]} pickup={false} producer={producer} />,
    );
    expect(screen.queryByTestId("whatsapp-cta")).not.toBeInTheDocument();
  });

  it("MEH-1435: city-only areas render as a compact Hebrew-sorted list, no editorial rows / no toggle ≤15", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "תל אביב" },
          { id: 2, city: "אשדוד" },
          { id: 3, city: "חיפה" },
        ]}
        pickup={false}
        producer={producer}
      />,
    );
    // All cities shown, no "מינימום" row, no toggle under the 15-city limit.
    expect(screen.getByText("אשדוד")).toBeInTheDocument();
    expect(screen.getByText("חיפה")).toBeInTheDocument();
    expect(screen.getByText("תל אביב")).toBeInTheDocument();
    expect(screen.queryByText("מינימום")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /הצג/ })).not.toBeInTheDocument();
    // Hebrew a→ז order: אשדוד before חיפה before תל אביב.
    const cities = ["אשדוד", "חיפה", "תל אביב"].map((c) => screen.getByText(c));
    expect(cities[0].compareDocumentPosition(cities[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cities[1].compareDocumentPosition(cities[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("MEH-1435: >15 city-only areas preview 15 + a toggle that expands/collapses", () => {
    const areas = Array.from({ length: 18 }, (_, i) => ({
      id: i + 1,
      // Zero-padded so Hebrew localeCompare keeps a stable order; "עיר 01".."עיר 18".
      city: `עיר ${String(i + 1).padStart(2, "0")}`,
    }));
    render(
      <DeliveryBlock nationwide={false} areas={areas} pickup={false} producer={producer} />,
    );
    // Preview: first 15, 16th hidden; toggle names the 3 hidden.
    expect(screen.getByText("עיר 15")).toBeInTheDocument();
    expect(screen.queryByText("עיר 16")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "הצג עוד 3 ערים" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    // Expanded: all 18 shown, toggle flips to "show less".
    expect(screen.getByText("עיר 18")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "הצג פחות" })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("עיר 16")).not.toBeInTheDocument();
  });

  // ── MEH-1512: pickup / market_stand rows from producer.locations[] ──────────

  it("MEH-1512: renders a row per pickup location — label, city subline, hours, Waze nav", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[]}
        pickup={true}
        producer={{
          ...producer,
          locations: [
            { kind: "pickup", label: "דוכן השוק", city: "חיפה", lat: 32.8, lng: 35.0, opening_hours: "שישי 8-13" },
            { kind: "market_stand", label: "יריד אורגני", city: "עכו", lat: 32.9, lng: 35.1 },
            { kind: "branch", label: "הסניף הראשי", city: "נהריה", lat: 33.0, lng: 35.1 },
          ],
        }}
      />,
    );
    // Pickup heading (locked string), both pickup/market rows, branch excluded.
    expect(screen.getByText("איסוף עצמי")).toBeInTheDocument();
    expect(screen.getByText("דוכן השוק")).toBeInTheDocument();
    expect(screen.getByText("יריד אורגני")).toBeInTheDocument();
    expect(screen.getByText("חיפה")).toBeInTheDocument(); // city subline (label present)
    expect(screen.getByText("שישי 8-13")).toBeInTheDocument(); // opening_hours
    expect(screen.queryByText("הסניף הראשי")).not.toBeInTheDocument(); // branch out of scope
    // Outbound Waze nav link built from lat/lng (no second in-page map).
    const nav = screen.getAllByRole("link", { name: "פתיחה ב-Waze" });
    expect(nav).toHaveLength(2);
    expect(nav[0]).toHaveAttribute("href", expect.stringContaining("waze.com/ul?ll="));
  });

  it("MEH-1512: label falls back to city when label is null", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[]}
        pickup={true}
        producer={{ ...producer, locations: [{ kind: "pickup", label: null, city: "מודיעין", lat: 31.9, lng: 35.0 }] }}
      />,
    );
    // City is the heading; no duplicate city subline when label is absent.
    expect(screen.getAllByText("מודיעין")).toHaveLength(1);
  });

  it("MEH-1512: 10 pickup rows show a 5-row preview + the existing show-more toggle", () => {
    const locations = Array.from({ length: 10 }, (_, i) => ({
      kind: "pickup",
      label: `נקודה ${String(i + 1).padStart(2, "0")}`,
      city: `עיר ${String(i + 1).padStart(2, "0")}`,
      lat: 32 + i / 100,
      lng: 35,
    }));
    render(
      <DeliveryBlock nationwide={false} areas={[]} pickup={true} producer={{ ...producer, locations }} />,
    );
    // First 5 shown (sorted city→label), the 6th hidden behind the reused toggle.
    expect(screen.getByText("נקודה 05")).toBeInTheDocument();
    expect(screen.queryByText("נקודה 06")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "הצג עוד 5 ערים" });
    fireEvent.click(toggle);
    expect(screen.getByText("נקודה 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הצג פחות" })).toBeInTheDocument();
  });

  it("MEH-1512: fallback — pickup=true with zero pickup rows still renders the generic line", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[]}
        pickup={true}
        producer={{ ...producer, locations: [{ kind: "branch", label: "סניף", city: "חיפה", lat: 32.8, lng: 35 }] }}
      />,
    );
    // Only a branch row exists → no pickup rows → the generic "איסוף עצמי" line.
    expect(screen.getByText("איסוף עצמי")).toBeInTheDocument();
    // No Waze nav link is rendered for the generic fallback line.
    expect(screen.queryByRole("link", { name: "פתיחה ב-Waze" })).not.toBeInTheDocument();
  });
});
