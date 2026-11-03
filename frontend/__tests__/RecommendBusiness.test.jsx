import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecommendClient from "@/app/[locale]/recommend/RecommendClient";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(() => Promise.resolve({ data: { ok: true } })) },
}));

// MEH-1767: the page must use the canonical <CitySearch>, never a raw input.
// Stubbed rather than rendered so this file tests the FORM — but the stub
// carries a testid, which turns "is the canonical component used?" into an
// assertion instead of a hope. A hand-rolled city <input> would make
// `recommend-city-search` absent and the test below red.
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, label, value, onChange }) => (
    <input
      data-testid="recommend-city-search"
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value, { known: true })}
    />
  ),
}));

vi.mock("next-intl", () => {
  const flat = {
    "recommend.title": "מכירים בית עסק שצריך להיות כאן?",
    "recommend.subtitle":
      "ספרו לנו עליו. אנחנו בודקים כל המלצה, פונים לבית העסק ומצרפים רק בתי עסק עם רישיון.",
    "recommend.field_name_label": "שם בית העסק",
    "recommend.field_city_label": "עיר",
    "recommend.field_contact_label": "אינסטגרם, טלפון או אתר",
    "recommend.field_contact_hint": "מספיק אחד, כדי שנוכל לפנות אליהם",
    "recommend.field_instagram_label": "אינסטגרם",
    "recommend.field_phone_label": "טלפון",
    "recommend.field_website_label": "אתר",
    "recommend.field_reason_label": "מה מיוחד שם? (לא חובה)",
    "recommend.field_suggester_name_label": "השם שלכם (לא חובה)",
    "recommend.field_suggester_email_label": "אימייל (לא חובה)",
    "recommend.wants_update_label": "עדכנו אותי כשבית העסק עולה לאתר",
    "recommend.submit": "שליחת ההמלצה",
    "recommend.success": "תודה! קיבלנו את ההמלצה. נבדוק ונפנה לבית העסק.",
    "recommend.success_wants_update":
      "תודה! קיבלנו את ההמלצה. אם בית העסק יצטרף, נעדכן אתכם במייל.",
    "recommend.error_contact_missing": "צריך לפחות דרך אחת ליצור קשר עם בית העסק",
    "recommend.error_rate_limited": "קיבלנו כבר כמה המלצות מכם. אפשר לנסות שוב בעוד שעה.",
    "recommend.error_generic": "משהו השתבש. נסו שוב בעוד רגע.",
    "contact.submit_loading": "בשליחה...",
    // The REAL string, markup included — a tag-free mock here is what let a
    // plain t() call ship once. The assertion below depends on these tags.
    "contact.privacy_notice":
      "בשליחת הטופס את מאשרת שקראת את <link>מדיניות הפרטיות</link>.",
  };
  return {
    useLocale: () => "he",
    useTranslations: (scope) => {
      const full = (key) => (scope ? `${scope}.${key}` : key);
      const t = (key) => flat[full(key)] ?? key;
      t.raw = t;
      // Minimal next-intl rich-text stand-in: split on a single <tag>…</tag>
      // and hand the inner chunk to the caller's renderer, so a component that
      // forgets `.rich` renders the literal tags and the test below reds.
      t.rich = (key, tags = {}) => {
        const raw = flat[full(key)] ?? key;
        const m = raw.match(/^(.*?)<(\w+)>(.*?)<\/\2>(.*)$/s);
        if (!m) return raw;
        const [, before, tag, inner, after] = m;
        return [before, tags[tag] ? tags[tag](inner) : inner, after];
      };
      return t;
    },
  };
});

/** Fill the minimum a valid submission needs: name, city, one contact. */
function fillValid() {
  fireEvent.change(screen.getByLabelText(/שם בית העסק/), { target: { value: "מעדניית הזיתים" } });
  fireEvent.change(screen.getByTestId("recommend-city-search"), { target: { value: "חיפה" } });
  fireEvent.change(screen.getByLabelText("אינסטגרם"), { target: { value: "hazeitim" } });
}

describe("RecommendClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: { ok: true } });
  });

  // ---------- state 1: idle ----------
  it("idle renders the approved title, subtitle and the contact hint", () => {
    render(<RecommendClient />);
    expect(screen.getByText("מכירים בית עסק שצריך להיות כאן?")).toBeInTheDocument();
    expect(screen.getByText(/אנחנו בודקים כל המלצה/)).toBeInTheDocument();
    expect(screen.getByText("מספיק אחד, כדי שנוכל לפנות אליהם")).toBeInTheDocument();
    expect(screen.getByTestId("recommend-form")).toBeInTheDocument();
    expect(screen.queryByTestId("recommend-success")).toBeNull();
  });

  it("renders the privacy notice as a link, not literal <link> tags", () => {
    // The failure this catches is visible to a human and invisible to a
    // tag-free mock: `t()` instead of `t.rich()` prints "<link>…</link>".
    render(<RecommendClient />);
    expect(screen.getByText("מדיניות הפרטיות")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("<link>");
  });

  it("uses the canonical CitySearch, not a hand-rolled city input", () => {
    render(<RecommendClient />);
    expect(screen.getByTestId("recommend-city-search")).toBeInTheDocument();
  });

  // ---------- the contact rule ----------
  it("no contact method → field error, and NOTHING is posted", async () => {
    render(<RecommendClient />);
    fireEvent.change(screen.getByLabelText(/שם בית העסק/), { target: { value: "מעדנייה" } });
    fireEvent.submit(screen.getByTestId("recommend-form"));
    expect(await screen.findByText("צריך לפחות דרך אחת ליצור קשר עם בית העסק")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("a phone alone satisfies the contact rule", async () => {
    render(<RecommendClient />);
    fireEvent.change(screen.getByLabelText(/שם בית העסק/), { target: { value: "מעדנייה" } });
    fireEvent.change(screen.getByLabelText("טלפון"), { target: { value: "0521234567" } });
    fireEvent.submit(screen.getByTestId("recommend-form"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.queryByText("צריך לפחות דרך אחת ליצור קשר עם בית העסק")).toBeNull();
  });

  // ---------- state 3: success ----------
  it("success posts to /business-suggestions and replaces the form", async () => {
    render(<RecommendClient />);
    fillValid();
    fireEvent.submit(screen.getByTestId("recommend-form"));

    await screen.findByTestId("recommend-success");
    expect(api.post).toHaveBeenCalledWith(
      "/business-suggestions",
      expect.objectContaining({ name: "מעדניית הזיתים", city: "חיפה", instagram: "hazeitim" })
    );
    expect(screen.getByText("תודה! קיבלנו את ההמלצה. נבדוק ונפנה לבית העסק.")).toBeInTheDocument();
    expect(screen.queryByTestId("recommend-form")).toBeNull();
  });

  it("opting in swaps the success copy for the email promise", async () => {
    render(<RecommendClient />);
    fillValid();
    fireEvent.click(screen.getByTestId("recommend-wants-update"));
    fireEvent.submit(screen.getByTestId("recommend-form"));

    await screen.findByTestId("recommend-success");
    expect(
      screen.getByText("תודה! קיבלנו את ההמלצה. אם בית העסק יצטרף, נעדכן אתכם במייל.")
    ).toBeInTheDocument();
    // Discriminates the two success strings: a single hard-coded panel would
    // pass the test above and fail here.
    expect(screen.queryByText("תודה! קיבלנו את ההמלצה. נבדוק ונפנה לבית העסק.")).toBeNull();
  });

  // ---------- state 5: rate limited, distinct from state 4 ----------
  it("429 shows the hour-long wait copy and KEEPS the form", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 429 } });
    render(<RecommendClient />);
    fillValid();
    fireEvent.submit(screen.getByTestId("recommend-form"));

    expect(await screen.findByTestId("recommend-rate-limited")).toHaveTextContent(
      "אפשר לנסות שוב בעוד שעה"
    );
    expect(screen.queryByTestId("recommend-error")).toBeNull();
    expect(screen.getByTestId("recommend-form")).toBeInTheDocument();
  });

  // ---------- state 4: error ----------
  it("a 500 shows the generic copy, NOT the 429 copy", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 500 } });
    render(<RecommendClient />);
    fillValid();
    fireEvent.submit(screen.getByTestId("recommend-form"));

    expect(await screen.findByTestId("recommend-error")).toHaveTextContent("משהו השתבש");
    // The pair of assertions is the point: folding 429 into `error` would make
    // one of these two tests fail, which is why both exist.
    expect(screen.queryByTestId("recommend-rate-limited")).toBeNull();
    expect(screen.getByTestId("recommend-form")).toBeInTheDocument();
  });

  // ---------- state 2: submitting ----------
  it("submitting disables the button and shows the loading label", async () => {
    let release;
    api.post.mockReturnValueOnce(new Promise((res) => { release = res; }));
    render(<RecommendClient />);
    fillValid();
    fireEvent.submit(screen.getByTestId("recommend-form"));

    const btn = screen.getByTestId("recommend-submit");
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveTextContent("בשליחה...");

    release({ data: { ok: true } });
    await screen.findByTestId("recommend-success");
  });

  // ---------- honeypot ----------
  it("the honeypot is present, hidden from AT, and out of the tab order", () => {
    render(<RecommendClient />);
    const pot = document.querySelector('input[name="company"]');
    expect(pot).toBeTruthy();
    expect(pot.tabIndex).toBe(-1);
    expect(pot.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("the honeypot value is sent, so the server can decide", async () => {
    render(<RecommendClient />);
    fillValid();
    fireEvent.change(document.querySelector('input[name="company"]'), {
      target: { value: "Acme SEO Ltd" },
    });
    fireEvent.submit(screen.getByTestId("recommend-form"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    // The CLIENT must not silently drop it — the trap is server-side, and a
    // client that stripped the field would disarm it with no visible symptom.
    expect(api.post.mock.calls[0][1].company).toBe("Acme SEO Ltd");
  });
});
