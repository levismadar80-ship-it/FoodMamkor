/**
 * MEH-2410 — the /register meta description described the site, not the page
 * ("בתי עסק מקומיים מתחום המזון בישראל", 34 chars). Google asks for a
 * description unique to each page. It now reuses the already-shipped
 * og:description wording, so no new copy was invented.
 */
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";

const OLD_GENERIC = "בתי עסק מקומיים מתחום המזון בישראל";

describe("/register meta description (MEH-2410)", () => {
  it("describes the page, in the og:description wording", () => {
    expect(he.seo.register.description).toBe(he.seo.register.og_description);
  });

  it("is not the old site-wide line", () => {
    expect(he.seo.register.description).not.toBe(OLD_GENERIC);
  });
});
