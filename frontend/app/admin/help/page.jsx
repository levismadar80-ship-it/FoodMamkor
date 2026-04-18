"use client";

import Link from "next/link";
import {
  Gauge,
  Storefront,
  Users,
  Star,
  Warning,
  Sparkle,
  Lifebuoy,
  LinkSimple,
  ArrowUpRight,
} from "@phosphor-icons/react";

/**
 * /admin/help — internal admin handbook (MEH-21).
 *
 * Static Hebrew guide rendered inside the /admin layout. A sticky
 * table-of-contents links to in-page anchors; each section is a
 * self-contained block that admins can skim without scrolling the
 * whole document.
 *
 * Credentials, project IDs, and personal contacts are intentionally
 * left as `<להזין>` placeholders — they belong in the team's password
 * manager, not in git. The handover checklist in docs/ADMIN.md has
 * the same redaction pattern.
 */
export default function AdminHelpPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Lifebuoy size={28} weight="fill" className="text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold">עזרה לאדמין</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6 leading-relaxed">
        המדריך הזה מסכם את הכלים של פאנל הניהול, תהליכי אישור מרכזיים,
        ותגובות לתקלות. מעודכן ידנית — אם משהו כאן לא נכון, פתחי PR עם
        תיקון במקום להשאיר את הכיוון הבא באפלה.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        {/* Sticky TOC */}
        <aside className="md:sticky md:top-24 self-start bg-white border border-border rounded-[12px] p-4 text-sm">
          <p className="text-xs uppercase tracking-wider text-text-secondary mb-2">תוכן</p>
          <nav className="flex flex-col gap-1.5">
            <a href="#dashboard" className="hover:text-primary transition">סקירת לוח המחוונים</a>
            <a href="#producers" className="hover:text-primary transition">אישור ודחיית בתי עסק</a>
            <a href="#users" className="hover:text-primary transition">ניהול משתמשים</a>
            <a href="#reviews" className="hover:text-primary transition">ביקורות</a>
            <a href="#reports" className="hover:text-primary transition">דיווחים</a>
            <a href="#experiences" className="hover:text-primary transition">חוויות</a>
            <a href="#emergency" className="hover:text-primary transition">תקלות חירום</a>
            <a href="#urls" className="hover:text-primary transition">כתובות חשובות</a>
          </nav>
        </aside>

        {/* Content */}
        <div className="space-y-10">
          {/* ===== Dashboard ===== */}
          <Section id="dashboard" icon={Gauge} title="סקירת לוח המחוונים">
            <p>
              <strong>/admin</strong> — הדף הראשי. ארבע מטריקות עליונות (משתמשים,
              בתי עסק, אירועים, דיווחים פתוחים) + שורת delta שבועית מתחתיה.
            </p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li>
                <strong>Pill צהוב על &ldquo;לוח מחוונים&rdquo; ב-sidebar</strong> — כמות פריטים
                ממתינים לאישור (בתי עסק + דיווחים + מוצרים מסומנים + חוויות).
                מתרענן בכל ניווט פנימי.
              </li>
              <li>
                <strong>גרף DAU 30 ימים</strong> — מבוסס על
                <code className="mx-1 bg-light px-1.5 py-0.5 rounded text-xs">users.last_active_at</code>
                שמתעדכן בכל בקשה מאומתת (throttle של 5 דק׳).
              </li>
              <li>
                <strong>ערים מובילות</strong> — מצטבר מ-
                <code className="mx-1 bg-light px-1.5 py-0.5 rounded text-xs">producer_page_views</code>
                (שורות ללא city לא נספרות).
              </li>
              <li>
                <strong>בריאות שרת</strong> — זמן תגובה ממוצע + בקשות לדקה משעה
                אחרונה. הנתון per-process בלבד (מתאפס בכל deploy).
              </li>
            </ul>
          </Section>

          {/* ===== Producers ===== */}
          <Section id="producers" icon={Storefront} title="אישור ודחיית בתי עסק">
            <p><strong>/admin/producers</strong> — טבלה + חיפוש + ייבוא Excel.</p>
            <ol className="list-decimal ps-5 space-y-2 mt-3">
              <li>סנני לפי סטטוס <strong>pending</strong>.</li>
              <li>
                לחצי על שם העסק → עמוד פרטים מלא, כולל הצהרות רישוי,
                תמונות, ותיאור.
              </li>
              <li>
                <strong>לאשר:</strong> לחצי <em>201Cאישור מהיר201D</em>. העסק עובר
                ל-<code className="bg-light px-1.5 py-0.5 rounded text-xs">approved</code>,
                מופיע בדף הבית, ומגיע במפה.
              </li>
              <li>
                <strong>לדחות:</strong> <em>201Cדחייה201D</em> + סיבה קצרה שתישלח
                במייל לבעלת העסק.
              </li>
              <li>
                <strong>ערוך (pencil):</strong> מעביר ל-
                <code className="bg-light px-1.5 py-0.5 rounded text-xs">
                  /admin/producers/[id]/edit
                </code>
                — כל השדות כולל 201Cמאומת201D / 201Cמומלץ201D / 201Cסטטוס זמינות201D / 201Cאמצעי קשר ראשי201D.
              </li>
            </ol>
            <p className="mt-3 text-xs text-text-secondary">
              העסק לא חייב להיות מאומת כדי להיות <em>approved</em> —
              <strong> מאומת</strong> מוסיף תגית כחולה אחרי שבדקת רישוי וזהות, בדרך כלל
              ב-audit חודשי.
            </p>
          </Section>

          {/* ===== Users ===== */}
          <Section id="users" icon={Users} title="ניהול משתמשים">
            <p><strong>/admin/users</strong> — חיפוש לפי מייל/שם, סינון לפי role.</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li><strong>role:</strong> consumer / producer / admin — שינוי מיידי, ללא אישור נוסף.</li>
              <li><strong>חסימה:</strong> login חסום מחזיר 403. המשתמש לא יודע מיד, רואה הודעה בלבד בנסיון ההתחברות הבא.</li>
              <li><strong>מועדפים:</strong> לחצי על הספירה ליד המשתמש כדי לראות את העסקים ששמרה — שימושי לאיתור פעילות חשודה.</li>
            </ul>
            <p className="mt-3 text-xs text-text-secondary">
              הזיכרון שלך: חסימה היא reversible, שינוי role משפיע מיד על ה-JWT הבא.
              <strong> אל תקדמי משתמש ל-admin</strong> בלי לאמת זהות מחוץ למערכת.
            </p>
          </Section>

          {/* ===== Reviews ===== */}
          <Section id="reviews" icon={Star} title="ביקורות">
            <p><strong>/admin/reviews</strong> — כל הביקורות ברשימה אחת (חדשות קודם).</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li>סנני לפי דירוג (1–5) או חיפוש חופשי על עסק/משתמש/כותרת/טקסט.</li>
              <li>מחיקה דורשת אישור (window.confirm). אחרי מחיקה ה-
                <code className="bg-light px-1.5 py-0.5 rounded text-xs">avg_rating</code>
                והספירה של העסק מתעדכנים אוטומטית.
              </li>
              <li>מחיקה היא pattern הנכון ל: לשון מבזה, זיהוי אישי, ספאם, ביקורת על עסק אחר.</li>
            </ul>
          </Section>

          {/* ===== Reports ===== */}
          <Section id="reports" icon={Warning} title="דיווחים">
            <p><strong>/admin/reports</strong> — ממוין לפי דחיפות (חדש + מרובה-דיווחים קודם).</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li><strong>פתור</strong> — סגירת הדיווח, אופציונלי עם פעולה נלווית (חסימה / מחיקה).</li>
              <li><strong>השהה</strong> — משאיר פתוח אבל מעביר לתחתית הרשימה. לשימוש כשצריך לאסוף עוד מידע.</li>
              <li><strong>התעלם</strong> — סגירה בלי פעולה, לדיווחים שלא מבססים בעיה.</li>
            </ul>
            <p className="mt-3 text-xs text-text-secondary">
              חוק האצבע: <strong>תגובה תוך 24 שעות</strong>. דיווחים על בטיחות
              מוצר (אלרגנים, תאריך תפוגה) — מיד.
            </p>
          </Section>

          {/* ===== Experiences ===== */}
          <Section id="experiences" icon={Sparkle} title="חוויות">
            <p><strong>/admin/experiences</strong> — 5 טאבים: ממתינות / דרוש תיקון / מאושרות / נדחו / הכל.</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li>בלחיצה: אישור / דחייה / בקשת תיקון. המארחת מקבלת מייל.</li>
              <li>Haiku pre-check עובר לפני שהיא מגיעה לטאב 201Cממתינות201D — טאב 201Cדרוש תיקון201D זה כאשר ה-AI סימן אזהרה אך לא חסם.</li>
            </ul>
          </Section>

          {/* ===== Emergency ===== */}
          <Section id="emergency" icon={Warning} title="תקלות חירום" danger>
            <ul className="space-y-3">
              <li>
                <strong>האתר לא עולה</strong>
                <p className="text-sm text-text-secondary mt-1">
                  בדקי <code className="bg-light px-1.5 py-0.5 rounded text-xs">mehamakor.online/health</code>.
                  אם זה לא 200 OK, בדקי Railway → healthcheck + logs. ראה
                  CLAUDE.md §&ldquo;Railway runtime port = 8080&rdquo; לפני כל דיבוג —
                  זה הסעיף הכי נפוץ של 502.
                </p>
              </li>
              <li>
                <strong>Migration נכשלה אחרי deploy</strong>
                <p className="text-sm text-text-secondary mt-1">
                  הסימפטום: ה-container עולה אבל endpoints מחזירים 500 עם
                  <code className="bg-light px-1.5 py-0.5 rounded text-xs">UndefinedColumn</code>.
                  הפתרון: בדקי ש-
                  <code className="bg-light px-1.5 py-0.5 rounded text-xs">_migrate_columns</code>
                  ב-main.py רשום את העמודה החדשה. אם לא, הוסיפי והעלי commit hotfix.
                </p>
              </li>
              <li>
                <strong>Login שבור לכולם</strong>
                <p className="text-sm text-text-secondary mt-1">
                  ודאי ש-
                  <code className="bg-light px-1.5 py-0.5 rounded text-xs">JWT_SECRET_KEY</code>
                  קיים ב-Railway Variables. אם הוחלף בטעות — JWTs ישנים ייפסלו
                  וכל משתמש צריך להתחבר מחדש. אל תחליפי את המפתח בלי להתריע לצוות.
                </p>
              </li>
              <li>
                <strong>סופת ספאם / רישומים מזויפים</strong>
                <p className="text-sm text-text-secondary mt-1">
                  /register/producer כבר מוגבל ב-3/שעה (slowapi). אם זה לא
                  מספיק, הדק ל-1/שעה זמנית ב-
                  <code className="bg-light px-1.5 py-0.5 rounded text-xs">auth.py</code>
                  + hotfix push. חסמי IPs חשודים דרך Railway edge אם יש נפח חריג.
                </p>
              </li>
              <li>
                <strong>AI features מחזירים שגיאות silent</strong>
                <p className="text-sm text-text-secondary mt-1">
                  בדקי
                  <code className="bg-light px-1.5 py-0.5 rounded text-xs">ANTHROPIC_API_KEY</code>.
                  גם fail-open הוא לא אינסופי — אם המפתח פג תוקף, moderation
                  מאשר הכל (APPROVED default). CLAUDE.md §&ldquo;Anthropic client init&rdquo;
                  מתאר את באג httpx 0.28+ שעשוי להחזיר TypeError דרך הכפתור הירוק.
                </p>
              </li>
            </ul>
          </Section>

          {/* ===== URLs ===== */}
          <Section id="urls" icon={LinkSimple} title="כתובות חשובות">
            <p className="text-sm text-text-secondary mb-3">
              הכתובות הספציפיות (project IDs, tokens) לא כאן — הן בכספת של הצוות.
              הרשימה כאן מכוונת אותך לאיפה להסתכל, לא מספקת credentials.
            </p>
            <ul className="space-y-2">
              <ExternalRow label="האתר בפרודקשן" href="https://mehamakor.online">mehamakor.online</ExternalRow>
              <ExternalRow label="האתר ב-staging" href="https://staging.mehamakor.online">staging.mehamakor.online</ExternalRow>
              <ExternalRow label="קוד המקור" href="https://github.com/levismadar80-ship-it/FoodMamkor">GitHub</ExternalRow>
              <li className="flex items-start gap-3 text-sm">
                <span className="text-text-secondary min-w-[140px]">Railway</span>
                <span className="text-site-muted">&lt;להזין&gt; — project: <code className="bg-light px-1 rounded">believable-tenderness</code>, service: backend</span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="text-text-secondary min-w-[140px]">Vercel</span>
                <span className="text-site-muted">&lt;להזין&gt; — project: <code className="bg-light px-1 rounded">food-mamkor</code></span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="text-text-secondary min-w-[140px]">Cloudinary</span>
                <span className="text-site-muted">&lt;להזין&gt; — cloud: <code className="bg-light px-1 rounded">dvtcojtye</code> (בערך)</span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="text-text-secondary min-w-[140px]">Anthropic Console</span>
                <span className="text-site-muted">&lt;להזין&gt; — workspace: מהמקור</span>
              </li>
            </ul>
          </Section>

          {/* Footer link back to the docs */}
          <div className="pt-6 border-t border-border">
            <p className="text-xs text-text-secondary">
              צ&rsquo;קליסט יומי/שבועי/חודשי + אנשי קשר לחירום —
              ראה <code className="bg-light px-1.5 py-0.5 rounded">docs/ADMIN.md</code>
              (סקציה &quot;Handover checklist&quot;).
              <Link href="/admin" className="ms-3 text-primary hover:underline">
                ← חזרה ללוח המחוונים
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, children, danger = false }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-3">
        <Icon
          size={22}
          weight="duotone"
          className={danger ? "text-red-600" : "text-primary"}
          aria-hidden="true"
        />
        <h2 className={`text-xl font-bold ${danger ? "text-red-700" : "text-site-text"}`}>
          {title}
        </h2>
      </div>
      <div className="text-sm text-site-text leading-relaxed space-y-2 bg-white border border-border rounded-[12px] p-5">
        {children}
      </div>
    </section>
  );
}

function ExternalRow({ label, href, children }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className="text-text-secondary min-w-[140px]">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1"
      >
        {children}
        <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
      </a>
    </li>
  );
}
