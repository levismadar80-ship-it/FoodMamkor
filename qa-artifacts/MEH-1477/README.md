# MEH-1477 — custom-questions guardrail (content guidance + example placeholders)

`custom-questions-card-375.webp` — mobile 375px, RTL. Harness of the
`CustomQuestionsCard` in the producer dashboard edit page (contact group); the
CC sandbox can't authenticate + SSR-populate the dashboard, so this renders the
card's structure + design tokens. Final mobile QA is Sapir's on the Vercel
preview.

New guidance helper line above the inputs (reusing the MEH-1116 helper-text
idiom): **"הכי עובד: שאלות שלקוחות באמת שואלים לפני קנייה — מה במלאי, משלוח,
הזמנה."**, plus five example placeholders (in order): "מה יש במלאי השבוע?" /
"יש משלוח ל[עיר]?" / "אפשר להזמין לאירוע?" / "מה עונתי עכשיו?" /
"אפשר לתאם טעימה?". `he` keeps the literal `[עיר]` token; the `en` placeholder
uses `[city]`. All copy flows from i18n keys under
`dashboard.producer.custom_questions` — no hardcoded Hebrew in JSX; no new
component (one `<p>` added, existing `placeholder_1..5` values updated).
