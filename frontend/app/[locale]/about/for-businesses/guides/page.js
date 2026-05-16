/**
 * Module:   guides-index
 * Purpose:  Index page for the 3 onboarding guides linked from the
 *           Day-2 / Day-5 / Day-10 follow-up emails (MEH-539). Each
 *           card links to /about/for-businesses/guides/{slug}.
 * Touches:  none.
 * Does NOT: render guide bodies (each guide has its own page.js).
 * Related:  backend/app/services/onboarding_followup.py (the email
 *           bodies that link here), frontend/components/GuideArticle.jsx.
 * History:  MEH-539 (creation, 2026-05-16) — Phase 2D of MEH-615.
 */
import Link from "next/link";
import { BRAND_NAME } from "@/lib/constants";

export const metadata = {
  title: `מדריכים לבעלות עסק | ${BRAND_NAME}`,
  description:
    "שלושה מדריכים קצרים לבעלות עסק במהמקור: איך לכתוב את הסיפור, איך לצלם את המוצרים, ואיך להגיב להודעות מלקוחות.",
  openGraph: {
    title: `מדריכים לבעלות עסק | ${BRAND_NAME}`,
    description:
      "שלושה מדריכים קצרים לבעלות עסק במהמקור — סיפור, צילום, הודעות.",
    type: "website",
    siteName: BRAND_NAME,
    locale: "he_IL",
  },
  alternates: { canonical: "/about/for-businesses/guides" },
};

const PRIMARY = "#2e6853";
const PRIMARY_DARK = "#2E4A2E";
const BODY_INK = "#1C1A17";
const BODY_PROSE = "#3a3a3a";
const EYEBROW_GOLD = "#8B6914";
const BG_CREAM = "#F5F0E8";
const CARD_BORDER = "rgba(46,104,83,0.18)";

const GUIDES = [
  {
    slug: "business-story",
    title: "איך לכתוב סיפור טוב על העסק שלך",
    preview:
      "השדה שמשנה הכל בפרופיל — איך לכתוב אותו פעם אחת, נכון, ובלי שייקרא כמו פרסומת.",
    readMinutes: 4,
  },
  {
    slug: "product-photography",
    title: "איך לצלם את המוצרים שלכם נכון",
    preview:
      "בלי מצלמה מקצועית, בלי סטודיו. 5 עקרונות + workflow של 30 דקות שמספיק לעמוד שלם.",
    readMinutes: 5,
  },
  {
    slug: "customer-messages",
    title: "איך להגיב להודעות שמגיעות אליכם",
    preview:
      "זמן תגובה, טון, ו-5 תבניות מוכנות. הדברים הקטנים שמכריעים אם השיחה נסגרת בהזמנה.",
    readMinutes: 6,
  },
];

export default function GuidesIndexPage() {
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BG_CREAM, color: BODY_INK }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-10 sm:mb-14">
          <p
            className="text-xs sm:text-sm mb-3"
            style={{
              color: EYEBROW_GOLD,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            מדריכים לבעלות עסק
          </p>
          <h1
            className="font-headline mb-4"
            style={{
              color: PRIMARY_DARK,
              fontSize: "clamp(28px, 6vw, 44px)",
              lineHeight: 1.15,
              fontWeight: 900,
            }}
          >
            שלושה מדריכים לחודש הראשון
          </h1>
          <p
            className="text-[17px] sm:text-[18px] leading-relaxed"
            style={{ color: BODY_PROSE }}
          >
            הצטרפת לאחרונה? אלה שלושת המדריכים שאני שולחת לכל בעלת עסק חדשה
            במהמקור. קצרים, ישירים, בלי הבטחות גדולות — רק מה שעובד.
          </p>
        </header>

        <ul className="flex flex-col gap-5">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/about/for-businesses/guides/${g.slug}`}
                className="block rounded-lg border bg-white p-5 sm:p-6 transition-colors hover:shadow-sm focus-visible:outline-none focus-visible:ring-2"
                style={{ borderColor: CARD_BORDER }}
              >
                <p
                  className="text-[11px] sm:text-[12px] mb-2"
                  style={{
                    color: EYEBROW_GOLD,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  קריאה כ-{g.readMinutes} דקות
                </p>
                <h2
                  className="font-headline mb-2"
                  style={{
                    color: PRIMARY_DARK,
                    fontSize: "20px",
                    fontWeight: 700,
                  }}
                >
                  {g.title}
                </h2>
                <p
                  className="text-[15px] sm:text-[16px] leading-relaxed mb-3"
                  style={{ color: BODY_PROSE }}
                >
                  {g.preview}
                </p>
                <span
                  className="inline-flex items-center gap-2 text-[14px]"
                  style={{ color: PRIMARY, fontWeight: 600 }}
                >
                  קראי את המדריך ←
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <footer
          className="mt-14 sm:mt-16 border-t pt-8"
          style={{ borderColor: CARD_BORDER }}
        >
          <p className="text-[15px]" style={{ color: BODY_PROSE }}>
            יש שאלה שמדריך לא ענה עליה? כתבי לי באינסטגרם{" "}
            <a
              href="https://www.instagram.com/meha_makor"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: PRIMARY }}
            >
              @meha_makor
            </a>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
