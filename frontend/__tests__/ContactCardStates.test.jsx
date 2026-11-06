import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

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
      "whatsapp.question_chips.delivery_to_my_area": "אפשר משלוח לאזור שלי?",
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
    Bell: Stub, // MEH-2626: the «עדכונים» channel icon (module-scope in CHANNELS)
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
    // the label is visible text, and it is inside the accessible name — the
    // orphan circle had neither.
    // MEH-2775: the label is the number itself, not «חייגו אלינו».
    expect(rows[0]).toHaveTextContent("0501234567");
    expect(rows[0]).not.toHaveTextContent("חייגו אלינו");
    // a screen reader hears what the number is for, and the visible value.
    expect(rows[0]).toHaveAccessibleName("התקשרו 0501234567");
    expect(rows[0]).toHaveAttribute("href", "tel:0501234567");
    expect(rows[0].className).toContain("w-full");
    expect(screen.queryByLabelText("התקשרו")).not.toBeInTheDocument();
  });

  it("uses the single row for a non-phone sole channel too", () => {
    renderCard({ website: "https://www.havat-hashikma.co.il/shop/" });
    const row = screen.getByTestId("contact-single-row");
    // MEH-2775: the host people know, not the label and not the full URL.
    expect(row).toHaveTextContent(/^havat-hashikma\.co\.il$/);
    // MEH-1525: the website link keeps noopener but drops noreferrer.
    expect(row).toHaveAttribute("rel", "noopener");
    expect(row).toHaveAttribute("target", "_blank");
  });

  it("keeps the circle row unchanged at 2+ channels", () => {
    renderCard({ phone: "0501234567", instagram: "@shikma" });
    expect(screen.queryByTestId("contact-single-row")).not.toBeInTheDocument();
    const phone = screen.getByLabelText("התקשרו");
    // MEH-2592 C: the 44px circle is the icon span; the name is visible under it.
    const circle = phone.querySelector("span");
    expect(circle.className).toContain("w-11");
    expect(circle.className).toContain("rounded-full");
    expect(phone).toHaveTextContent("התקשרו");
    expect(phone.parentElement.className).toContain("grid-cols-4");
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

  // MEH-2775: a sole phone row already shows the number, so the desktop tap
  // is a plain tel: link — no reveal, no second row, no layout change.
  it("(1 x desktop) a sole phone does not reveal — the number is already shown", () => {
    withDesktop(() => {
      renderCard({ phone: "0501234567" });
      const row = screen.getByTestId("contact-single-row");
      const evt = fireEvent.click(row);
      expect(evt).toBe(true); // not preventDefault()-ed
      expect(screen.queryByTestId("revealed-phone")).not.toBeInTheDocument();
      expect(screen.getByTestId("contact-single-row")).toHaveTextContent("0501234567");
      expect(trackContactClick).toHaveBeenCalledWith(7, "phone");
    });
  });

  // MEH-1583 — the reveal now adopts the geometry of the element it replaces.
  // MEH-1551 fixed WHERE the number lands but left it wearing pill anatomy, so
  // a revealed card could show two geometric languages at once.

  /** The geometry contract both full-width affordances must satisfy. */
  // MEH-2775: the geometry is now a plain info line — no box.
  const ROW_GEOMETRY = ["flex", "w-full", "min-w-0", "items-center", "gap-2", "min-h-touch", "text-sm"];
  // ...and these, the box that read as one more question, must never return.
  const BOX_CLASSES = ["border", "bg-surface", "bg-background", "px-3", "rounded-full", "inline-flex"];

  it("(1 x closed) the sole-channel row is an unboxed line under a hairline", () => {
    renderCard({ phone: "0501234567" });
    const row = screen.getByTestId("contact-single-row");
    const cls = row.className.split(/\s+/);
    for (const c of ROW_GEOMETRY) expect(cls).toContain(c);
    for (const c of BOX_CLASSES) expect(cls).not.toContain(c);
    // the same hairline the circle grid has, so it is set apart from the
    // ready-made questions above it.
    const wrap = row.parentElement.className.split(/\s+/);
    expect(wrap).toContain("border-t");
    expect(wrap).toContain("border-border");
  });

  it("(survivor x open) the revealed number and the lone survivor share one geometry", () => {
    withDesktop(() => {
      renderCard({ phone: "0501234567", instagram: "@shikma" });
      fireEvent.click(screen.getByTestId("contact-channel-phone"));
      const survivor = screen.getByTestId("contact-single-row").className.split(/\s+/);
      const open = screen.getByTestId("revealed-phone").className.split(/\s+/);
      for (const c of ROW_GEOMETRY) {
        expect(survivor).toContain(c);
        expect(open).toContain(c);
      }
      for (const c of BOX_CLASSES) {
        expect(survivor).not.toContain(c);
        expect(open).not.toContain(c);
      }
    });
  });

  it("(many x open) drops the phone from the circle row and adds one full-width number row", () => {
    withDesktop(() => {
      renderCard({ phone: "0501234567", instagram: "@shikma", website: "x.co.il" });
      fireEvent.click(screen.getByTestId("contact-channel-phone"));

      const revealed = screen.getByTestId("revealed-phone");
      // phone gone from the circle row; the survivors keep circle anatomy.
      expect(screen.queryByTestId("contact-channel-phone")).not.toBeInTheDocument();
      // MEH-2592 C: the circle is the icon span inside the labelled channel.
      expect(screen.getByTestId("contact-channel-instagram").querySelector("span").className).toContain("rounded-full");
      // ...and the number is a row, not a pill wedged among the circles.
      for (const cls of ROW_GEOMETRY) expect(revealed.className).toContain(cls);
      expect(revealed.className).not.toContain("rounded-full");
    });
  });

  it("puts dir/numeric on the number span, not the row (icon stays at the RTL start)", () => {
    withDesktop(() => {
      renderCard({ phone: "0501234567", instagram: "@shikma" });
      fireEvent.click(screen.getByTestId("contact-channel-phone"));

      const revealed = screen.getByTestId("revealed-phone");
      expect(revealed).not.toHaveAttribute("dir");
      const span = revealed.querySelector("span[dir='ltr']");
      expect(span).toHaveTextContent("0501234567");
      expect(span.className).toContain("numeric");
    });
    // MEH-2775: same rule on the sole-phone row.
    cleanup();
    renderCard({ phone: "0501234567" });
    const row = screen.getByTestId("contact-single-row");
    expect(row).not.toHaveAttribute("dir");
    const span = row.querySelector("span[dir='ltr']");
    expect(span).toHaveTextContent("0501234567");
    expect(span.className).toContain("numeric");
  });

  // MEH-2775: every sole channel, value-or-label. The value runs LTR so an
  // "@handle" keeps its "@" first in an RTL card.
  it.each([
    ["instagram", { instagram: "@shikma" }, "@shikma", true],
    ["instagram (bare handle)", { instagram: "shikma" }, "@shikma", true],
    ["email", { contact_email: " hello@shikma.co.il " }, "hello@shikma.co.il", true],
    ["website", { website: "http://www.shikma.co.il/a?b=1" }, "shikma.co.il", true],
    ["website (bare host)", { website: "shikma.co.il" }, "shikma.co.il", true],
    ["website (caps scheme, port, query)", { website: "HTTPS://WWW.Shikma.co.il:8080?a=1" }, "Shikma.co.il:8080", true],
    ["instagram (legacy URL row)", { instagram: "https://instagram.com/shikma" }, "אינסטגרם", false],
    ["whatsapp_group", { whatsapp_group: "https://chat.whatsapp.com/AbC123" }, "producer.detail.contact_card.single.whatsapp_group", false],
    ["facebook", { facebook: "facebook.com/shikma" }, "producer.detail.contact_card.single.facebook", false],
    ["external_order", { external_order_form: "forms.gle/x" }, "producer.detail.contact_card.single.external_order", false],
  ])("sole %s row shows %s", (_name, extra, text, ltr) => {
    renderCard(extra);
    const row = screen.getByTestId("contact-single-row");
    expect(row).toHaveTextContent(text);
    if (ltr) expect(row.querySelector("span[dir='ltr']")).toHaveTextContent(text);
    else expect(row.querySelector("span[dir='ltr']")).toBeNull();
  });

  it("promotes the lone survivor to a labeled row (no orphan circle after reveal)", () => {
    withDesktop(() => {
      // 2 channels: revealing the phone leaves instagram alone. Left as a bare
      // circle it would re-create exactly the orphan MEH-1551 closed.
      renderCard({ phone: "0501234567", instagram: "@shikma" });
      fireEvent.click(screen.getByTestId("contact-channel-phone"));

      const survivor = screen.getByTestId("contact-single-row");
      expect(survivor).toHaveTextContent("@shikma"); // MEH-2775: the value
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
