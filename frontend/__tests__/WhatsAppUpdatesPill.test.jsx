import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-2626: the WhatsApp updates link in the delivery section. Where it shows:
//   - DeliveryChecker, POSITIVE answer ("yes" / "yes_nationwide") + link set
//   - DeliveryBlock, nationwide branch when NO checker renders
// and where it must not: a "no" answer, no answer yet, no link at all.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    const city = vars?.city ?? "";
    if (key === "checker.yes_nationwide") return `כן! משלוחים לכל הארץ — כולל ${city}`;
    if (key === "checker.yes") return `כן, מגיעים ל${city}`;
    if (key === "checker.no") return `עדיין לא מגיעים ל${city}`;
    if (key === "nationwide_except") return `משלוחים לכל הארץ (למעט ${vars?.cities ?? ""})`;
    const map = {
      "producer.detail.whatsapp_updates.full": "עדכונים מבית העסק בוואטסאפ",
      "group_buys.delivery.checker.label": "מגיעים אלייך?",
      "group_buys.delivery.nationwide": "משלוחים לכל הארץ",
    };
    return map[full] ?? key;
  },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return {
    ArrowUpLeft: Stub,
    BellRinging: Stub, // MEH-2618: DeliveryWaitlistForm mounts under a "no" verdict
    CaretDown: Stub,
    CaretUp: Stub,
    ChatCircle: Stub,
    CheckCircle: Stub,
    NavigationArrow: Stub,
    Package: Stub,
    Phone: Stub,
    Truck: Stub,
    Clock: Stub, // MEH-3028: order-cutoff + no-hours fact lines
    WhatsappLogo: Stub,
    XCircle: Stub,
  };
});

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));

vi.mock("@/lib/contact-tracking", () => ({
  trackContactClick: vi.fn(),
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
}));

import DeliveryChecker from "@/components/DeliveryChecker";
import DeliveryBlock from "@/components/DeliveryBlock";
import { trackContactClick } from "@/lib/contact-tracking";

const LINK = "https://whatsapp.com/channel/0029VaABC";
const withLink = { id: 9, name: "חוות", phone: "0501234567", whatsapp_group: LINK };
const noLink = { id: 9, name: "חוות", phone: "0501234567", whatsapp_group: null };
const AREAS = [{ id: 1, city: "חיפה" }];

const check = (value) => {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
  fireEvent.mouseDown(screen.getByRole("option", { name: value }));
};
const pill = () => screen.queryByTestId("whatsapp-updates-pill");

beforeEach(() => {
  vi.mocked(trackContactClick).mockClear();
  try {
    localStorage.clear();
  } catch {}
});

describe("DeliveryChecker — updates pill (MEH-2626)", () => {
  it("shows the pill under a 'yes' verdict when the business has a link", () => {
    render(<DeliveryChecker offersDelivery areas={AREAS} producer={withLink} />);
    expect(pill()).not.toBeInTheDocument(); // no answer yet → nothing
    check("חיפה");
    const el = pill();
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("עדכונים מבית העסק בוואטסאפ");
    expect(el).toHaveAttribute("href", LINK);
    expect(el).toHaveAttribute("target", "_blank");
    expect(el).toHaveAttribute("rel", "noopener noreferrer");
    // Inside the verdict region, not floating elsewhere in the band.
    expect(screen.getByTestId("delivery-checker-result")).toContainElement(el);
  });

  it("tapping the pill fires one contact-click beacon with method whatsapp_group", () => {
    render(<DeliveryChecker offersDelivery areas={AREAS} producer={withLink} />);
    check("חיפה");
    fireEvent.click(pill());
    expect(trackContactClick).toHaveBeenCalledTimes(1);
    expect(trackContactClick).toHaveBeenCalledWith(9, "whatsapp_group");
  });

  it("shows the pill under a 'yes_nationwide' verdict", () => {
    render(
      <DeliveryChecker offersDelivery nationwide excluded={["עתלית"]} producer={withLink} />,
    );
    check("חיפה");
    expect(screen.getByTestId("delivery-checker-result")).toHaveAttribute(
      "data-result",
      "yes_nationwide",
    );
    expect(pill()).toBeInTheDocument();
  });

  it("renders nothing on a 'no' verdict, even with a link", () => {
    render(<DeliveryChecker offersDelivery areas={AREAS} producer={withLink} />);
    check("עתלית");
    expect(screen.getByTestId("delivery-checker-result")).toHaveAttribute("data-result", "no");
    expect(pill()).not.toBeInTheDocument();
  });

  it("renders nothing on a 'yes' verdict when the business has no link", () => {
    render(<DeliveryChecker offersDelivery areas={AREAS} producer={noLink} />);
    check("חיפה");
    expect(screen.getByTestId("delivery-checker-result")).toHaveAttribute("data-result", "yes");
    expect(pill()).not.toBeInTheDocument();
  });
});

describe("DeliveryBlock — nationwide updates pill (MEH-2626)", () => {
  it("nationwide with no checker → exactly one pill, after the nationwide badge", () => {
    render(
      <DeliveryBlock
        nationwide
        excluded={[]}
        areas={[]}
        pickup={false}
        producer={{ ...withLink, offers_delivery: true }}
      />,
    );
    expect(screen.queryByTestId("delivery-checker")).not.toBeInTheDocument();
    const pills = screen.getAllByTestId("whatsapp-updates-pill");
    expect(pills).toHaveLength(1);
    const badge = screen.getByText("משלוחים לכל הארץ");
    // DOCUMENT_POSITION_FOLLOWING: the pill comes after the badge.
    expect(badge.compareDocumentPosition(pills[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("nationwide with no checker and no link → no pill", () => {
    render(
      <DeliveryBlock
        nationwide
        excluded={[]}
        areas={[]}
        pickup={false}
        producer={{ ...noLink, offers_delivery: true }}
      />,
    );
    expect(pill()).not.toBeInTheDocument();
  });

  it("nationwide WITH a checker → no pill until a positive answer (never two homes)", () => {
    render(
      <DeliveryBlock
        nationwide
        excluded={["עתלית"]}
        areas={[]}
        pickup={false}
        producer={{ ...withLink, offers_delivery: true }}
      />,
    );
    expect(screen.getByTestId("delivery-checker")).toBeInTheDocument();
    expect(pill()).not.toBeInTheDocument();
    check("חיפה");
    expect(screen.getAllByTestId("whatsapp-updates-pill")).toHaveLength(1);
  });

  it("area-based delivery (not nationwide) → no pill outside the checker", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        excluded={[]}
        areas={AREAS}
        pickup={false}
        producer={{ ...withLink, offers_delivery: true }}
      />,
    );
    expect(pill()).not.toBeInTheDocument();
  });
});
