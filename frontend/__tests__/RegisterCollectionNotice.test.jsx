import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import RegisterProducerClient from "@/app/[locale]/register/producer/RegisterProducerClient";
import { CONTACT_EMAIL } from "@/lib/env.client";
import api from "@/lib/api";
import heMessages from "../messages/he.json";

// MEH-2200 — Amendment-13 (s.11) collection notice on the producer register
// wizard's submitting frame.
//
// Unlike RegisterProducerClient.test.jsx, this file resolves keys against the
// REAL messages/he.json instead of echoing the key path. That is deliberate:
// the thing under test is a legal disclosure, so a test that passes while the
// shipped Hebrew says nothing of the sort would be worthless (MEH-1909 — a
// probe green against a shape the repo does not actually use).
function lookup(key) {
  return key.split(".").reduce((o, k) => (o == null ? o : o[k]), heMessages);
}

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key) => {
      const raw = lookup(key);
      return typeof raw === "string" ? raw : key;
    };
    // Minimal <tag>…</tag> renderer mirroring next-intl's t.rich contract, so
    // the assertions below see the real <Link>/<a> nodes the component builds.
    t.rich = (key, tags = {}) => {
      const raw = lookup(key);
      if (typeof raw !== "string") return key;
      const parts = [];
      const re = /<(\w+)>(.*?)<\/\1>/g;
      let last = 0;
      let m;
      let i = 0;
      while ((m = re.exec(raw)) !== null) {
        if (m.index > last) parts.push(raw.slice(last, m.index));
        const renderTag = tags[m[1]];
        // An unmapped tag falls through as its literal markup — that is what
        // the "no raw markup" assertion below is written to catch.
        parts.push(renderTag ? <span key={i++}>{renderTag(m[2])}</span> : m[0]);
        last = re.lastIndex;
      }
      if (last < raw.length) parts.push(raw.slice(last));
      return parts;
    };
    return t;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refreshUser: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, id }) => (
    <input data-testid="city" id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/CategorySelector", () => ({
  default: ({ onChange }) => (
    <button type="button" data-testid="pick-category" onClick={() => onChange(1)}>
      category
    </button>
  ),
}));

// onChange emits a plain string — the wizard stores form.address as a string
// and calls .trim() on it (RegisterProducerClient.jsx), so an object here
// crashes the frame rather than failing an assertion.
vi.mock("@/components/AddressSearch", () => ({
  default: ({ value, onChange, id, placeholder, inputTestId }) => (
    <input
      id={id}
      data-testid={inputTestId}
      placeholder={placeholder}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/components/MiniMap", () => ({ default: () => <div /> }));

const ph = (key) => screen.getByPlaceholderText(lookup(`auth.register.producer.fields.${key}`));

async function reachStoryFrame() {
  render(<RegisterProducerClient />);
  fireEvent.click(await screen.findByTestId("register-preflight-start"));
  fireEvent.change(ph("name"), { target: { value: "טסט" } });
  fireEvent.change(ph("email"), { target: { value: "t@example.com" } });
  fireEvent.change(ph("password"), { target: { value: "Abcdefgh1234" } });
  fireEvent.click(screen.getByTestId("register-account-next"));
  await screen.findByTestId("register-frame-details");
  fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
  fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
  fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
  fireEvent.change(ph("address"), { target: { value: "הרצל 1" } });
  fireEvent.click(screen.getByTestId("register-details-next"));
  fireEvent.click(await screen.findByTestId("pick-category"));
  fireEvent.click(screen.getByTestId("register-category-next"));
  return screen.findByTestId("register-frame-story");
}

describe("MEH-2200 — Amendment-13 collection notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [{ id: 1, name: "מאפים" }] });
    localStorage.clear();
  });

  it("renders exactly one notice on the frame that submits", async () => {
    await reachStoryFrame();
    // COUNT, not presence: a duplicated notice passes any getBy* check, and a
    // second copy of a legal disclosure is its own defect.
    expect(screen.getAllByTestId("register-collection-notice")).toHaveLength(1);
  });

  it("is absent from the account frame and appears only at the submitting frame", async () => {
    render(<RegisterProducerClient />);
    fireEvent.click(await screen.findByTestId("register-preflight-start"));
    // Falsifiable by the change under test: a notice rendered unconditionally
    // outside the step guard would fail here.
    expect(screen.queryByTestId("register-collection-notice")).not.toBeInTheDocument();
  });

  it("links to the privacy policy and to the rights-request mailbox", async () => {
    await reachStoryFrame();
    const notice = screen.getByTestId("register-collection-notice");
    expect(within(notice).getByRole("link", { name: /מדיניות הפרטיות/ })).toHaveAttribute(
      "href",
      "/privacy",
    );
    // Same constant the privacy page uses for rights requests, so the two
    // surfaces cannot name different addresses.
    expect(within(notice).getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${CONTACT_EMAIL}`,
    );
  });

  it("resolves its rich-text tags instead of leaking raw markup to the seller", async () => {
    await reachStoryFrame();
    const notice = screen.getByTestId("register-collection-notice");
    // A missing tag callback, or a renamed tag in he.json, ships literal
    // "<privacy>" into a legal notice. Nothing else in the suite catches that.
    expect(notice.textContent).not.toMatch(/<\/?(privacy|email)>/);
  });

  it("states the three s.11 elements the notice exists to carry", async () => {
    await reachStoryFrame();
    const text = screen.getByTestId("register-collection-notice").textContent;
    // Asserted against the shipped he.json, not a fixture. These are the
    // disclosure's reason for existing: volition, consequence of refusal, and
    // the purposes the data serves.
    expect(text).toMatch(/אינה חובה על פי חוק/);
    expect(text).toMatch(/לא נוכל להשלים את ההרשמה/);
    expect(text).toMatch(/לניהול החשבון/);
  });
});
