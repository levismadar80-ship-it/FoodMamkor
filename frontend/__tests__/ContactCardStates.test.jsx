import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1551 — the two degenerate states of the secondary-channel row, neither
// of which MEH-1334's design specified:
//   (1) exactly ONE surviving channel used to render a lone unlabeled 44px
//       circle floating on its own → now a labeled quiet row;
//   (2) the desktop phone-reveal appended the number pill as a SIBLING below
//       the row → now swaps the phone affordance in place.
// The >= 2 circle row and the mobile tel: passthrough are guarded here as
// regressions (they must not change).

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    const map = {
      "producer.detail.contact_card.aria.phone": "התקשרו",
      "producer.detail.contact_card.aria.instagram": "אינסטגרם",
      "producer.detail.contact_card.aria.website": "אתר",
      "producer.detail.contact_card.aria.email": "אימייל",
      // MEH-1551: the single-channel labels (LOCKED copy, he.json twins).
      "producer.detail.contact_card.single.phone": "חייגו אלינו",
      "producer.detail.contact_card.single.instagram": "אינסטגרם",
      "producer.detail.contact_card.single.website": "לאתר העסק",
      "producer.detail.contact_card.single.email": "שלחו אימייל",
      "whatsapp.question_chips.my_area": "האזור שלי",
      "whatsapp.question_chips.delivery_to_city": `אפשר משלוח ל${vars?.city ?? ""}?`,
      "whatsapp.question_chips.greeting_template": `שלום ${vars?.name ?? ""}, ${vars?.q ?? ""}`,
    };
    return map[full] ?? full;
  },
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  normalizePhone: (p) => (p ? p.replace(/^0/, "972").replace(/\D/g, "") : ""),
}));

vi.mock("@/lib/contact-tracking", () => ({
  markWhatsAppClickedLocal: vi.fn(),
  pingWhatsAppBeacon: vi.fn(),
  trackContactClick: vi.fn(),
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return {
    EnvelopeSimple: Stub,
    FacebookLogo: Stub,
    Globe: Stub,
    InstagramLogo: Stub,
    Phone: Stub,
    Receipt: Stub,
    WhatsappLogo: Stub,
    ChatCircle: Stub,
    CaretDown: Stub,
  };
});

import ContactCard from "@/app/[locale]/producer/[id]/components/ContactCard";
import { trackContactClick } from "@/lib/contact-tracking";

// primary_contact_method = whatsapp has no matching row icon, so every field
// set below survives the filter — the channel count is exactly the field count.
const base = {
  id: 7,
  name: "מאפיית רוח השדה",
  city: "זכרון יעקב",
  primary_contact_method: "whatsapp",
};

const renderCard = (extra = {}) =>
  render(<ContactCard producer={{ ...base, ...extra }} isVacation={false} />);

/** Force the desktop branch of the click-time matchMedia read. */
function withDesktop(fn) {
  const prev = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  try {
    fn();
  } finally {
    window.matchMedia = prev;
  }
}

describe("ContactCard degenerate states (MEH-1551)", () => {
  beforeEach(() => {
    trackContactClick.mockClear();
  });

  it("renders ONE labeled row (not a lone circle) when a single channel survives", () => {
    renderCard({ phone: "0501234567" });
    const rows = screen.getAllByTestId("contact-single-row");
    expect(rows).toHaveLength(1);
    // the label is visible text, and it is the accessible name (no aria-label
    // override) — the orphan circle had neither.
    expect(rows[0]).toHaveTextContent("חייגו אלינו");
    expect(rows[0]).toHaveAttribute("href", "tel:0501234567");
    expect(rows[0].className).toContain("w-full");
    expect(screen.queryByLabelText("התקשרו")).not.toBeInTheDocument();
  });

  it("uses the single row for a non-phone sole channel too", () => {
    renderCard({ website: "havat-hashikma.co.il" });
    const row = screen.getByTestId("contact-single-row");
    expect(row).toHaveTextContent("לאתר העסק");
    // MEH-1525: the website link keeps noopener but drops noreferrer.
    expect(row).toHaveAttribute("rel", "noopener");
    expect(row).toHaveAttribute("target", "_blank");
  });

  it("keeps the circle row unchanged at 2+ channels", () => {
    renderCard({ phone: "0501234567", instagram: "@shikma" });
    expect(screen.queryByTestId("contact-single-row")).not.toBeInTheDocument();
    const phone = screen.getByLabelText("התקשרו");
    expect(phone.className).toContain("w-11");
    expect(phone.className).toContain("rounded-full");
    expect(screen.getByLabelText("אינסטגרם")).toBeInTheDocument();
  });

  it("swaps the phone circle in place on desktop reveal (no sibling append)", () => {
    withDesktop(() => {
      renderCard({ phone: "0501234567", instagram: "@shikma", website: "x.co.il" });
      const row = screen.getByLabelText("התקשרו").parentElement;
      fireEvent.click(screen.getByLabelText("התקשרו"));

      const revealed = screen.getByTestId("revealed-phone");
      // same flex container — not a block below the row. MEH-1583 moved it to
      // the END of that container (it is a full-width row now, so it wraps
      // under the surviving circles rather than sitting between them).
      expect(revealed.parentElement).toBe(row);
      expect(row.lastElementChild).toBe(revealed);
      // the circle it replaced is gone; the other channels are untouched.
      expect(screen.queryByLabelText("התקשרו")).not.toBeInTheDocument();
      expect(screen.getByLabelText("אינסטגרם")).toBeInTheDocument();
      expect(revealed).toHaveAttribute("href", "tel:0501234567");
      expect(trackContactClick).toHaveBeenCalledWith(7, "phone");
    });
  });

  it("swaps the single row in place on desktop reveal", () => {
    withDesktop(() => {
      renderCard({ phone: "0501234567" });
      const row = screen.getByTestId("contact-single-row").parentElement;
      fireEvent.click(screen.getByTestId("contact-single-row"));

      const revealed = screen.getByTestId("revealed-phone");
      expect(revealed.parentElement).toBe(row);
      expect(screen.queryByTestId("contact-single-row")).not.toBeInTheDocument();
    });
  });

  // MEH-1583 — the reveal now adopts the geometry of the element it replaces.
  // MEH-1551 fixed WHERE the number lands but left it wearing pill anatomy, so
  // a revealed card could show two geometric languages at once.

  /** The geometry contract both full-width affordances must satisfy. */
  const ROW_GEOMETRY = [
    "flex",
    "w-full",
    "items-center",
    "gap-2",
    "min-h-[44px]",
    "px-3",
    "rounded-[10px]",
    "border",
    "border-border",
    "bg-white",
    "text-sm",
  ];

  it("(1 x open) is geometrically identical to (1 x closed) — no layout jump", () => {
    withDesktop(() => {
      const { unmount } = renderCard({ phone: "0501234567" });
      const closed = screen.getByTestId("contact-single-row").className.split(/\s+/);
      unmount();

      renderCard({ phone: "0501234567" });
      fireEvent.click(screen.getByTestId("contact-single-row"));
      const open = screen.getByTestId("revealed-phone").className.split(/\s+/);

      for (const cls of ROW_GEOMETRY) {
        expect(closed).toContain(cls);
        expect(open).toContain(cls);
      }
      // the pill anatomy is gone from the revealed row for good.
      expect(open).not.toContain("rounded-full");
      expect(open).not.toContain("inline-flex");
    });
  });

  it("(many x open) drops the phone from the circle row and adds one full-width number row", () => {
    withDesktop(() => {
      renderCard({ phone: "0501234567", instagram: "@shikma", website: "x.co.il" });
      fireEvent.click(screen.getByTestId("contact-channel-phone"));

      const revealed = screen.getByTestId("revealed-phone");
      // phone gone from the circle row; the survivors keep circle anatomy.
      expect(screen.queryByTestId("contact-channel-phone")).not.toBeInTheDocument();
      expect(screen.getByTestId("contact-channel-instagram").className).toContain("rounded-full");
      // ...and the number is a row, not a pill wedged among the circles.
      for (const cls of ROW_GEOMETRY) expect(revealed.className).toContain(cls);
      expect(revealed.className).not.toContain("rounded-full");
    });
  });

  it("puts dir/numeric on the number span, not the row (icon stays at the RTL start)", () => {
    withDesktop(() => {
      renderCard({ phone: "0501234567" });
      fireEvent.click(screen.getByTestId("contact-single-row"));

      const revealed = screen.getByTestId("revealed-phone");
      expect(revealed).not.toHaveAttribute("dir");
      const span = revealed.querySelector("span[dir='ltr']");
      expect(span).toHaveTextContent("0501234567");
      expect(span.className).toContain("numeric");
    });
  });

  it("promotes the lone survivor to a labeled row (no orphan circle after reveal)", () => {
    withDesktop(() => {
      // 2 channels: revealing the phone leaves instagram alone. Left as a bare
      // circle it would re-create exactly the orphan MEH-1551 closed.
      renderCard({ phone: "0501234567", instagram: "@shikma" });
      fireEvent.click(screen.getByTestId("contact-channel-phone"));

      const survivor = screen.getByTestId("contact-single-row");
      expect(survivor).toHaveTextContent("אינסטגרם");
      expect(survivor.className).toContain("w-full");
      expect(screen.getByTestId("revealed-phone")).toBeInTheDocument();
    });
  });

  it("keeps the mobile tel: passthrough (no reveal, tracking still fires)", () => {
    // setup.js's default matchMedia stub reports matches:false = mobile.
    renderCard({ phone: "0501234567" });
    const row = screen.getByTestId("contact-single-row");
    const evt = fireEvent.click(row);

    expect(evt).toBe(true); // not preventDefault()-ed → the tel: href navigates
    expect(screen.queryByTestId("revealed-phone")).not.toBeInTheDocument();
    expect(trackContactClick).toHaveBeenCalledWith(7, "phone");
  });
});
