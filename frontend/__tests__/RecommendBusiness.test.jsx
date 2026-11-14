import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecommendClient from "@/app/[locale]/recommend/RecommendClient";
import api from "@/lib/api";

// MEH-2827 PR 5: the owner line under the subtitle is a BusinessCtaLink,
// which reads the auth context. A guest sees the join link.
// MEH-2642: the update opt-in reads the same context (useAuth), so the
// mock is switchable — `authState.user` null = guest, an object = signed in.
const authState = vi.hoisted(() => ({ user: null }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
  useOptionalAuth: () => ({ user: authState.user, loading: false }),
}));
const MEMBER = { id: 7, email: "member@example.com", role: "user", email_verified: true };
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
      "ספרו לנו עליו. אנחנו בודקות כל המלצה, פונות לבית העסק, ומצרפות רק בתי עסק שפועלים כדין.",
    "recommend.field_name_label": "שם בית העסק",
    "recommend.field_city_label": "עיר",
    "recommend.field_contact_label": "אינסטגרם, טלפון או אתר",
    "recommend.field_contact_hint": "מספיק אחד, כדי שנוכל לפנות אליהם",
    "recommend.field_instagram_label": "אינסטגרם",
    "recommend.field_phone_label": "טלפון",
    "recommend.field_website_label": "אתר",
    "recommend.field_reason_label": "מה מיוחד שם? (לא חובה)",
    "recommend.field_suggester_name_label": "השם שלכם (לא חובה)",
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
    // MEH-2633 Sapir 04/11 — notice at collection, under the email field.
    "privacy.collection_notice.business_suggestion":
      "נשתמש באימייל רק כדי לעדכן אתכם על ההמלצה הזו. הוא לא עובר לבית העסק ולא משמש לשיווק.",
    "recommend.privacy_link": "מדיניות הפרטיות",
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
    authState.user = null;
    api.post.mockResolvedValue({ data: { ok: true } });
  });

  // ---------- state 1: idle ----------
  it("idle renders the approved title, subtitle and the contact hint", () => {
    render(<RecommendClient />);
    expect(screen.getByText("מכירים בית עסק שצריך להיות כאן?")).toBeInTheDocument();
    expect(screen.getByText(/אנחנו בודקות כל המלצה/)).toBeInTheDocument();
    expect(screen.getByText("מספיק אחד, כדי שנוכל לפנות אליהם")).toBeInTheDocument();
    expect(screen.getByTestId("recommend-form")).toBeInTheDocument();
    expect(screen.queryByTestId("recommend-success")).toBeNull();
  });

  it("renders the privacy notice as a link, not literal <link> tags", () => {
    // The failure this catches is visible to a human and invisible to a
    // tag-free mock: `t()` instead of `t.rich()` prints "<link>…</link>".
    authState.user = MEMBER;
    render(<RecommendClient />);
    // getAllByText, not getByText: a signed-in visitor sees TWO links with
    // this label (the consent line under the button and the notice under the
    // update opt-in). Both must be real links.
    const links = screen.getAllByText("מדיניות הפרטיות");
    expect(links.length).toBe(2);
    for (const el of links) expect(el.tagName).toBe("A");
    expect(document.body.textContent).not.toContain("<link>");
  });

  it("states the email's purpose at the point of collection, with a /privacy link", () => {
    // Amendment 13 §11: purpose + who it is NOT shared with, next to the
    // field. Asserting the sentence, not just the component's presence — an
    // empty or wrong message would render a link with no disclosure.
    authState.user = MEMBER;
    render(<RecommendClient />);
    const notice = screen.getByTestId("recommend-collection-notice");
    expect(notice).toHaveTextContent("נשתמש באימייל רק כדי לעדכן אתכם על ההמלצה הזו");
    expect(notice).toHaveTextContent("לא עובר לבית העסק ולא משמש לשיווק");
    const link = screen.getByTestId("recommend-collection-notice-link");
    expect(link).toHaveTextContent("מדיניות הפרטיות");
    expect(link.getAttribute("href")).toContain("/privacy");
  });

  it("the notice sits with the update opt-in, not at the end of the form", () => {
    // "At the point of collection" is a position, not just a presence: a
    // notice under the submit button is a different (weaker) disclosure.
    // MEH-2642: the opt-in is now what makes us use an address (the
    // account's), so the notice follows the checkbox.
    authState.user = MEMBER;
    render(<RecommendClient />);
    const optIn = screen.getByTestId("recommend-wants-update");
    const notice = screen.getByTestId("recommend-collection-notice");
    // previousElementSibling, not parentElement.contains: the <form> contains
    // everything, so a notice moved to the end of the form would pass that.
    expect(notice.previousElementSibling).toBeTruthy();
    expect(notice.previousElementSibling.contains(optIn)).toBe(true);
  });

  // ---------- MEH-2642: no typed email, the account address only ----------
  it("renders no email field for anyone", () => {
    render(<RecommendClient />);
    expect(document.getElementById("recommend-suggester-email")).toBeNull();
    expect(document.querySelector('input[type="email"]')).toBeNull();
  });

  it("a guest sees neither the update opt-in nor the email notice", () => {
    render(<RecommendClient />);
    expect(screen.getByTestId("recommend-form")).toBeInTheDocument();
    expect(screen.queryByTestId("recommend-wants-update")).toBeNull();
    expect(screen.queryByTestId("recommend-collection-notice")).toBeNull();
    // Control: the consent line under the button is still there for a guest.
    expect(screen.getAllByText("מדיניות הפרטיות").length).toBe(1);
  });

  it("a signed-in visitor with an UNVERIFIED email sees no opt-in", () => {
    // The server ignores an unverified account address (review M1), so
    // offering the opt-in would promise an email nobody sends.
    authState.user = { ...MEMBER, email_verified: false };
    render(<RecommendClient />);
    expect(screen.getByTestId("recommend-form")).toBeInTheDocument();
    expect(screen.queryByTestId("recommend-wants-update")).toBeNull();
    expect(screen.queryByTestId("recommend-collection-notice")).toBeNull();
  });

  it("a signed-in visitor sees the opt-in, unchecked", () => {
    authState.user = MEMBER;
    render(<RecommendClient />);
    expect(screen.getByTestId("recommend-wants-update")).not.toBeChecked();
  });

  it("a guest's post carries no email and wants_update false", async () => {
    render(<RecommendClient />);
    fillValid();
    fireEvent.submit(screen.getByTestId("recommend-form"));
    await screen.findByTestId("recommend-success");
    const body = api.post.mock.calls[0][1];
    expect(body).not.toHaveProperty("suggester_email");
    expect(body.wants_update).toBe(false);
  });

  it("keeps the browser's empty-field gate: no noValidate, native required", () => {
    // Adversarial review, finding 2. jsdom's fireEvent.submit does NOT run
    // constraint validation, so there is no honest way to assert "an empty
    // name is blocked" here — a test that claimed to would be measuring
    // nothing. What IS checkable is the structure the native gate needs:
    // the form must not opt out, and the field must carry the real attribute
    // (ui/Input forwards `required`, MEH-2015). Both reds on the old code.
    render(<RecommendClient />);
    expect(screen.getByTestId("recommend-form").hasAttribute("novalidate")).toBe(false);
    expect(document.getElementById("recommend-name").required).toBe(true);
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
    const err = await screen.findByTestId("recommend-contact-error");
    expect(err).toHaveTextContent("צריך לפחות דרך אחת ליצור קשר עם בית העסק");
    expect(api.post).not.toHaveBeenCalled();

    // The rule is about the GROUP: the message must NOT be bound to the
    // instagram field, which is how it first shipped — that red-bordered one
    // box and read as "instagram is invalid". Caught by reading the 375
    // capture; pinned here so it cannot come back.
    const instagram = document.getElementById("recommend-instagram");
    const describedBy = instagram.getAttribute("aria-describedby");
    const desc = describedBy ? document.getElementById(describedBy) : null;
    expect(desc?.textContent ?? "").not.toContain("צריך לפחות דרך אחת");
    expect(err.closest("fieldset")).toBeTruthy();
    // The error must be VISIBLY an error. `text-destructive` is not a token in
    // this repo's Tailwind config, so it shipped once as a dead class and the
    // message rendered in body colour — invisible to every content assertion.
    // ui/Input.jsx:148 uses `text-error`; so does this.
    expect(err.className).toContain("text-error");
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

  it("success opens the light seed burst right above the success panel (MEH-2833)", async () => {
    render(<RecommendClient />);
    expect(screen.queryByTestId("seed-burst")).toBeNull();
    fillValid();
    fireEvent.submit(screen.getByTestId("recommend-form"));
    const panel = await screen.findByTestId("recommend-success");
    const burst = panel.previousElementSibling;
    expect(burst.getAttribute("data-testid")).toBe("seed-burst");
    expect(burst.getAttribute("data-variant")).toBe("light");
  });

  // MEH-2844 (Sapir 08/11): one success mark — the burst. The ✓ that sat in
  // the panel under it is gone; heading and text unchanged.
  it("success shows ONE mark: the burst, no ✓ in the panel", async () => {
    render(<RecommendClient />);
    fillValid();
    fireEvent.submit(screen.getByTestId("recommend-form"));
    const panel = await screen.findByTestId("recommend-success");
    expect(panel.querySelectorAll("svg")).toHaveLength(0);
    expect(screen.getAllByTestId("seed-burst")).toHaveLength(1);
    expect(screen.getByText("תודה! קיבלנו את ההמלצה. נבדוק ונפנה לבית העסק.")).toBeInTheDocument();
  });

  it("opting in swaps the success copy for the email promise", async () => {
    authState.user = MEMBER;
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

    const limited = await screen.findByTestId("recommend-rate-limited");
    expect(limited).toHaveTextContent("אפשר לנסות שוב בעוד שעה");
    expect(limited.className).toContain("text-error");
    expect(screen.queryByTestId("recommend-error")).toBeNull();
    expect(screen.getByTestId("recommend-form")).toBeInTheDocument();
  });

  // ---------- state 4: error ----------
  it("a 500 shows the generic copy, NOT the 429 copy", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 500 } });
    render(<RecommendClient />);
    fillValid();
    fireEvent.submit(screen.getByTestId("recommend-form"));

    const generic = await screen.findByTestId("recommend-error");
    expect(generic).toHaveTextContent("משהו השתבש");
    expect(generic.className).toContain("text-error");
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
