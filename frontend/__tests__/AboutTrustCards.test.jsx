import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import en from "../messages/en.json";
import { rootClientMessages } from "@/lib/client-messages";

/**
 * MEH-2827 PR 1 — /about trust cards, founder quote, business line and the
 * comparison table, as approved on the FinalAbout board (Sapir 08/11).
 * Rendered with the REAL Hebrew catalog through the root client message set,
 * so a key in the wrong namespace fails here.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/about",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill, priority, unoptimized, ...props }) => <img {...props} />,
}));

beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

import AboutClient from "@/app/[locale]/about/AboutClient";
import TrustBadge from "@/components/TrustBadge";
import BadgesExplainer from "@/app/[locale]/about/badges/BadgesExplainer";

const C = he.about.consumer;
const classes = (el) => (el?.getAttribute("class") || "").split(/\s+/);

// The three bodies as they read BEFORE the split (verbatim from staging,
// 08/11). The split may only move line breaks, never words.
const OLD_HE = {
  verification:
    "כל בית עסק במהמקור עובר אישור ידני: אנחנו מדברות עם בעלי העסק, הם חותמים על הצהרה שהפרטים נכונים, ורק אז העסק עולה לאתר. בלי הרשמה אוטומטית, בלי קיצורי דרך. ואם יש לעסק מסמך רישוי או אישור פטור, אנחנו בודקות את המסמך בעצמנו במועד ההצטרפות: כשמופיע ✓ מאומת, זה אומר שמישהי מאיתנו באמת ראתה אותו — והתאריך שלצידו הוא מועד הבדיקה, לא הבטחה להמשך.",
  editors_pick:
    // MEH-3323 (Sapir 15/11): words changed on purpose — founder voice is plural now.
    "מדי פעם אנחנו מסמנות עסק שאהבנו במיוחד — בגלל איכות המוצרים, הטריות, או סיפור שראוי שתכירו. זו בחירה אישית שלנו, אחרי היכרות עם העסק. שני דברים חשוב שתדעו: אי אפשר לשלם על התגית הזו — לא בפרימיום ולא בשום דרך אחרת. והיא לא ציון — עסק בלי התגית הוא לא פחות טוב; פשוט עוד לא הספקנו, או שעוד לא יצא.",
  community_leader:
    "את התג הזה אנחנו לא מעניקות, הלקוחות מעניקים אותו. הוא מופיע מעצמו אצל בית עסק שקיבל לפחות 10 ביקורות, בדירוג ממוצע של 4.5 ומעלה. אי אפשר לבקש אותו ואי אפשר לשלם עליו, והוא יורד מעצמו אם הממוצע יורד. ועסק בלי התג הוא לא פחות טוב: לפעמים הוא פשוט חדש כאן, ועוד לא הספיקו לכתוב עליו.",
};
const OLD_EN = {
  verification:
    "Every business on Mehamakor is approved by hand: we talk with the owner, she signs a declaration that the details are true, and only then does the business go live. No automatic sign-ups, no shortcuts. And if the business has a licensing document or exemption approval, we check the document ourselves at the time it joins: when you see the ✓ Verified seal, you know a real person actually saw it — and that the date beside it is the date of the check, not a promise about what came after.",
  editors_pick:
    // MEH-3323: plural founder voice.
    "Every so often we mark a business we especially loved — for the quality of its products, its freshness, or a story worth knowing. It's our personal choice, after getting to know the business. Two things worth knowing: you can't pay for this tag — not with premium, not in any other way. And it isn't a score — a business without it is no less good; we simply haven't gotten to it yet, or the moment hasn't come.",
  community_leader:
    "We don't award this badge, customers do. It appears on its own for a business with at least 10 reviews and an average rating of 4.5 or higher. You can't ask for it and you can't pay for it, and it goes away on its own if the average drops. And a business without it is no less good: sometimes it's simply new here, and you haven't had the chance to write about it yet.",
};
const PARTS = {
  verification: ["body_1", "body_2"],
  editors_pick: ["body_1", "list_lead", "item_1", "item_2"],
  community_leader: ["body_1", "body_2"],
};

function renderAbout() {
  return render(
    <NextIntlClientProvider locale="he" messages={rootClientMessages(he)}>
      <AboutClient />
    </NextIntlClientProvider>,
  );
}

describe("split copy keeps every word (he + en)", () => {
  for (const [lang, msgs, old] of [
    ["he", he, OLD_HE],
    ["en", en, OLD_EN],
  ]) {
    for (const section of Object.keys(PARTS)) {
      it(`${lang} ${section}: joined parts == the old body`, () => {
        const c = msgs.about.consumer[section];
        expect(PARTS[section].map((k) => c[k]).join(" ")).toBe(old[section]);
        expect(c.body).toBeUndefined();
      });
    }
  }
});

// MEH-3667 (Sapir 21/11): the full cards moved to /about/badges. /about keeps
// the chapter mark, that page's intro, the three badge faces and the link.
describe("/about trust group — a summary that links to /about/badges", () => {
  it("chapter mark, the badges intro, the three faces and the link; no cards", () => {
    renderAbout();
    const group = screen.getByTestId("about-trust");
    expect(within(group).getByRole("heading", { level: 2 }).textContent).toBe(he.about_badges.h1);
    expect(group.textContent).toContain(he.about_badges.intro);
    expect(group.querySelectorAll("article")).toHaveLength(0);
    expect(group.querySelectorAll("h3")).toHaveLength(0);
    for (const body of [C.verification.body_1, C.editors_pick.body_1, C.community_leader.body_1]) {
      expect(group.textContent).not.toContain(body);
    }
    const faces = within(group).getByTestId("about-badge-faces");
    expect(faces.querySelector('[data-testid="verified-chip"]').textContent).toBe(he.producer.badge.verified_label);
    expect(classes(faces.querySelector('[data-testid="editors-pick-chip"]'))).toEqual(
      expect.arrayContaining(["bg-accent", "text-white", "rounded-full"]),
    );
    expect(faces.querySelector('[data-testid="community-chip"]').textContent).toBe(he.trust.tier_4.label);
    const link = within(group).getByRole("link", { name: C.badges_link.label });
    expect(link.getAttribute("href")).toBe("/about/badges");
  });

  it("old anchors still land on this section", () => {
    renderAbout();
    const group = screen.getByTestId("about-trust");
    for (const id of ["verification", "editors-pick", "community-leader"]) {
      expect(group.contains(document.getElementById(id))).toBe(true);
    }
  });

  it("no popover trigger in the faces (the verified seal is not BadgeRow's button)", () => {
    renderAbout();
    const group = screen.getByTestId("about-trust");
    expect(group.querySelector('[data-badge="verified"]')).toBeNull();
    expect(group.querySelector("[aria-haspopup]")).toBeNull();
  });
});

describe("/about/badges carries the full text /about used to show (MEH-3667)", () => {
  function renderBadges() {
    return render(
      <NextIntlClientProvider locale="he" messages={rootClientMessages(he)}>
        <BadgesExplainer />
      </NextIntlClientProvider>,
    );
  }

  it("verified: both paragraphs, under #verification", () => {
    renderBadges();
    const v = document.getElementById("verification");
    expect(v.getAttribute("data-testid")).toBe("badges-item-verified");
    const ps = [...v.querySelectorAll("p")].map((p) => p.textContent);
    expect(ps).toEqual([C.verification.body_1, C.verification.body_2]);
  });

  it("editor's pick: paragraph, lead line, then the 2-item list with gold dots, under #editors-pick", () => {
    renderBadges();
    const e = document.getElementById("editors-pick");
    expect(e.getAttribute("data-testid")).toBe("badges-item-recommended");
    const ps = [...e.querySelectorAll(":scope > p")].map((p) => p.textContent);
    expect(ps).toEqual([C.editors_pick.body_1, C.editors_pick.list_lead]);
    const items = e.querySelectorAll("ul > li");
    expect([...items].map((li) => li.textContent)).toEqual([C.editors_pick.item_1, C.editors_pick.item_2]);
    for (const li of items) {
      expect(classes(li.querySelector('[aria-hidden="true"]'))).toEqual(expect.arrayContaining(["bg-accent", "rounded-full"]));
    }
  });

  it("community leader: both paragraphs, under #community-leader", () => {
    renderBadges();
    const c = document.getElementById("community-leader");
    expect(c.getAttribute("data-testid")).toBe("badges-item-community_leader");
    const ps = [...c.querySelectorAll(":scope > p")].map((p) => p.textContent);
    expect(ps).toEqual([C.community_leader.body_1, C.community_leader.body_2]);
  });
});

describe("founder signature — quote first, then who said it", () => {
  it("gold quote mark → caption3 → name · role; no side border", () => {
    renderAbout();
    const sig = screen.getByTestId("about-signature");
    expect(classes(sig)).not.toContain("border-s-2");
    const [mark, quote, attribution] = sig.children;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(classes(mark)).toContain("text-accent");
    expect(quote.textContent).toBe(C.story.caption3);
    expect(attribution.textContent).toContain(he.about.signature.name);
    expect(attribution.textContent).toContain(he.about.signature.role);
    expect(attribution.textContent.indexOf(he.about.signature.name)).toBeLessThan(
      attribution.textContent.indexOf(he.about.signature.role),
    );
  });
});

describe("business line — one row, plural copy (row 1)", () => {
  it("lead + link share one flex-wrap row; aria-labelledby unchanged", () => {
    renderAbout();
    const lead = document.getElementById("about-biz-lead");
    expect(lead.textContent).toBe("יש לכם עסק?");
    const link = screen.getByTestId("about-biz-strip");
    expect(link.getAttribute("aria-labelledby")).toBe("about-biz-lead about-biz-cta");
    expect(lead.parentElement).toBe(link.parentElement);
    expect(classes(lead.parentElement)).toEqual(expect.arrayContaining(["flex", "flex-wrap", "items-baseline"]));
  });
});

describe("comparison table — the Mehamakor column stands out", () => {
  it("58/42 columns, gold header rule, seed mark, ✓ per brand cell and − per supermarket cell", () => {
    renderAbout();
    const table = screen.getByTestId("about-comparison").querySelector("table");
    const cols = [...table.querySelectorAll("colgroup col")].map((c) => c.style.width);
    expect(cols).toEqual(["58%", "42%"]);
    const heads = table.querySelectorAll("thead th");
    for (const th of heads) expect(classes(th)).toContain("border-b-accent/35");
    expect(classes(heads[0])).toContain("bg-surface-card");
    const seed = heads[0].querySelector("img");
    expect(seed.getAttribute("src")).toContain("logo.svg");
    expect(seed.getAttribute("aria-hidden")).toBe("true");
    const rows = table.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(0);
    for (const tr of rows) {
      const brand = tr.querySelector("th[scope=row]");
      expect(classes(brand)).toContain("bg-surface-card");
      expect(brand.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(tr.querySelector('td svg[aria-hidden="true"]')).not.toBeNull();
    }
  });
});

describe("closing heading in plural (row 2)", () => {
  it("about.consumer.cta.heading", () => {
    expect(he.about.consumer.cta.heading).toBe("בניתם עסק שמגיע לו בית? אנחנו רוצות להכיר.");
  });
});

describe("the community chip IS the TrustBadge tier-4 face", () => {
  it("same classes and label as the real TrustBadge (no tooltip wrapper, no aria-label)", () => {
    const { container } = render(
      <NextIntlClientProvider locale="he" messages={rootClientMessages(he)}>
        <TrustBadge tier={4} />
      </NextIntlClientProvider>,
    );
    const real = container.querySelector(".bg-warning-50");
    const realClasses = classes(real).filter(Boolean).sort();
    document.body.innerHTML = "";
    renderAbout();
    const chip = screen.getByTestId("community-chip");
    expect(classes(chip).filter(Boolean).sort()).toEqual(realClasses);
    expect(chip.textContent).toBe(real.textContent.trim());
    expect(chip.hasAttribute("aria-label")).toBe(false);
  });
});

