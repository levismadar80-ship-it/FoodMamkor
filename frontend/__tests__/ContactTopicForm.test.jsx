import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-2832 PR 1 — /contact («דברו איתנו») is the site's one contact form. It
 * carries the topic select that lived on /about (MEH-1113): ?topic= preselects
 * a whitelisted topic, anything else falls back to "general" silently, and the
 * topic goes in the POST body. /about keeps its section as a signpost only.
 */

const post = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock("@/lib/api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/about",
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }) => <img alt={alt} src={typeof src === "string" ? src : ""} />,
}));
vi.mock("@/components/BusinessCtaLink", () => ({
  default: ({ children, href, className }) => <a href={href} className={className}>{children}</a>,
}));

beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

import ContactClient from "@/app/[locale]/contact/ContactClient";
import AboutClient from "@/app/[locale]/about/AboutClient";
import { CONTACT_TOPICS, contactTopicFrom } from "@/lib/contact-topics";

const at = (search) => window.history.replaceState({}, "", `/contact${search}`);
const renderContact = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <ContactClient />
    </NextIntlClientProvider>,
  );

async function submit() {
  fireEvent.change(document.getElementById("contact-name"), { target: { value: "דנה" } });
  fireEvent.change(document.getElementById("contact-email"), { target: { value: "dana@example.com" } });
  fireEvent.change(document.getElementById("contact-message"), { target: { value: "שאלה על המדריכים" } });
  fireEvent.submit(document.getElementById("contact-message").closest("form"));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  return post.mock.calls[0];
}

describe("/contact — topic select", () => {
  beforeEach(() => post.mockClear());

  it("no ?topic= → «שאלה כללית» selected, and the POST carries topic: general", async () => {
    at("");
    renderContact();
    const select = screen.getByTestId("contact-topic");
    expect(select.value).toBe("general");
    expect([...select.options].map((o) => o.textContent)).toEqual(
      CONTACT_TOPICS.map((k) => he.contact.topic_options[k]),
    );
    const [url, body] = await submit();
    expect(url).toBe("/contact");
    expect(body).toEqual({ name: "דנה", email: "dana@example.com", message: "שאלה על המדריכים", topic: "general" });
  });

  it("?topic=business preselects «פנייה של בית עסק» and sends it", async () => {
    at("?topic=business");
    renderContact();
    await waitFor(() => expect(screen.getByTestId("contact-topic").value).toBe("business"));
    const [, body] = await submit();
    expect(body.topic).toBe("business");
  });

  it("?topic=bogus → general, silently (no error on the page)", async () => {
    at("?topic=bogus");
    renderContact();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("contact-topic").value).toBe("general");
    expect(document.body.textContent).not.toContain("bogus");
  });

  it("the reader can change the topic", async () => {
    at("");
    renderContact();
    fireEvent.change(screen.getByTestId("contact-topic"), { target: { value: "correction" } });
    const [, body] = await submit();
    expect(body.topic).toBe("correction");
  });
});

describe("one whitelist, one set of words", () => {
  it("mirrors the backend CONTACT_TOPIC_LABELS keys", () => {
    const py = fs.readFileSync(path.resolve(__dirname, "../../backend/app/schemas/schemas.py"), "utf8");
    const block = py.match(/CONTACT_TOPIC_LABELS = \{([\s\S]*?)\}/)[1];
    const keys = [...block.matchAll(/"(\w+)":/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    expect([...CONTACT_TOPICS].sort()).toEqual([...keys].sort());
  });

  it("contactTopicFrom keeps a whitelisted value and drops anything else to general", () => {
    for (const k of CONTACT_TOPICS) expect(contactTopicFrom(k)).toBe(k);
    for (const v of ["bogus", "", null, undefined, "Business", "general "]) expect(contactTopicFrom(v)).toBe("general");
  });

  it("the topic keys moved to the contact namespace with the same words (he + en)", () => {
    expect(he.contact.topic_label).toBe("נושא הפנייה");
    expect(he.contact.topic_options).toEqual({ general: "שאלה כללית", business: "פנייה של בית עסק", correction: "תיקון מידע באתר", other: "אחר" });
    expect(en.contact.topic_label).toBe("Inquiry topic");
    expect(Object.keys(en.contact.topic_options).sort()).toEqual([...CONTACT_TOPICS].sort());
    expect(he.about.consumer.contact.topic_label).toBeUndefined();
    expect(en.about.consumer.contact.topic_options).toBeUndefined();
  });
});

describe("/about section 08 — a signpost, not a form", () => {
  it("no form, keeps #contact + heading + /messages link, and links to /contact", () => {
    const { container } = render(
      <NextIntlClientProvider locale="he" messages={he}>
        <AboutClient />
      </NextIntlClientProvider>,
    );
    const section = container.querySelector("#contact");
    expect(section).not.toBeNull();
    expect(section.querySelector("form")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(section.querySelector("h2").textContent).toBe(he.about.consumer.contact.heading);
    expect(section.querySelector('a[href="/messages"]')).not.toBeNull();
    const link = section.querySelector('[data-testid="about-contact-link"]');
    expect(link.getAttribute("href")).toBe("/contact");
    expect(link.textContent).toBe(he.nav.footer.contact);
  });
});
