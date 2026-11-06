/**
 * MEH-2760 — the profile-completeness heuristic emits field SLUGS, and the
 * words live in messages (`dashboard.producer.completeness.fields.<slug>`).
 * Before this the slugs were Hebrew labels, so the admin "missing details"
 * tooltip read Hebrew in every locale.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { COMPLETENESS_FIELDS, producerCompleteness } from "@/lib/producer-completeness";
import { CompletenessBadge } from "@/app/[locale]/admin/producers/AdminProducersTable";

const HEBREW = /[֐-׿]/;
const SLUGS = Object.keys(COMPLETENESS_FIELDS);

describe("MEH-2760 — completeness fields are slugs with he + en words", () => {
  it("every field id is its own slug — no words in code", () => {
    for (const slug of SLUGS) expect(COMPLETENESS_FIELDS[slug]).toBe(slug);
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s.json names every field", (_, msgs) => {
    for (const slug of SLUGS) {
      expect(msgs.dashboard.producer.completeness.fields[slug], slug).toBeTruthy();
    }
  });

  it("the en words hold no Hebrew", () => {
    for (const slug of SLUGS) {
      expect(en.dashboard.producer.completeness.fields[slug], slug).not.toMatch(HEBREW);
    }
  });

  it("an empty producer is missing slugs, never Hebrew words", () => {
    const { missing, priority } = producerCompleteness({});
    expect(priority).toBe("red");
    expect(missing.length).toBeGreaterThan(0); // control: the empty case reports something
    for (const m of missing) expect(SLUGS).toContain(m);
  });

  it.each([
    ["he", he, "עיר, פרטי קשר (טלפון/אינסטגרם)"],
    ["en", en, "City, Contact details (phone/Instagram)"],
  ])("the admin tooltip names the missing fields in %s", (locale, msgs, expected) => {
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={msgs} onError={() => {}}>
        <CompletenessBadge missing={["city", "contact"]} priority="red" />
      </NextIntlClientProvider>,
    );
    const title = container.querySelector("[title]").getAttribute("title");
    expect(title).toContain(expected);
  });
});
