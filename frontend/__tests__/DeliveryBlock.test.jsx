import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1146 chunk B — editorial delivery: per-city rows (city · min order · day,
// fix 4), an optional self-pickup line (fix 6), and a DEMOTED tertiary CTA.

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    // MEH-1233 B3: the delivery day is now labeled ("משלוח ביום {day}").
    if (key === "delivery_day_label") return `משלוח ביום ${vars?.day ?? ""}`;
    const map = {
      "heading": "משלוחים",
      "nationwide": "משלוחים לכל הארץ",
      "arranged": "בתיאום מראש",
      "min_order": "מינימום",
      "pickup": "איסוף עצמי",
      "whatsapp.button.default_message": "msg",
      "whatsapp.button.opening": "opening",
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
  return { Truck: Stub, Package: Stub, WhatsappLogo: Stub };
});

import DeliveryBlock from "@/components/DeliveryBlock";

const producer = { id: 1, name: "חוות", phone: "0501234567" };

describe("DeliveryBlock (MEH-1146 chunk B)", () => {
  it("renders a city · min order · day row from delivery_areas", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[{ id: 1, city: "זכרון יעקב", min_order: 100, delivery_day: "שישי" }]}
        pickup={false}
        producer={producer}
      />,
    );
    expect(screen.getByText("זכרון יעקב")).toBeInTheDocument();
    expect(screen.getByText(/מינימום/)).toBeInTheDocument();
    expect(screen.getByText(/100₪/)).toBeInTheDocument(); // formatPrice canonical
    expect(screen.getByText("משלוח ביום שישי")).toBeInTheDocument();
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

  it("renders the WhatsApp CTA demoted to tertiary (not the green primary)", () => {
    render(
      <DeliveryBlock nationwide={true} areas={[]} pickup={false} producer={producer} />,
    );
    const cta = screen.getByTestId("whatsapp-cta");
    expect(cta).toHaveAttribute("data-tone", "tertiary");
    expect(cta.className).not.toMatch(/btn-whatsapp/);
  });
});
