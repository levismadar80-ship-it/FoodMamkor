# MEH-1473 — recipe chip rephrased to question form

`recipe-idea-chip-375.webp` — mobile 375px, RTL. Harness of the
`WhatsAppQuestionChips` row (the CC sandbox can't SSR-populate `/producer/[id]`,
so this renders the row's structure + design tokens; final mobile QA is Sapir's
on the Vercel preview).

i18n-only change (MEH-1462 follow-up): the recipe chip label was rephrased from
the statement **"יש לי רעיון למתכון"** to the question form
**"אפשר לשתף מתכון שהכנתי?"** (the dashed-outlined last row above), and its
Sapir-locked WhatsApp prefill from "…יש לי רעיון למתכון עם המוצרים שלכם:" to
"היי! הגעתי מהעמוד שלכם במהמקור — הכנתי משהו מהמוצרים שלכם ואשמח לשתף את המתכון:".
Chip behaviour is unchanged — rendered **last**, **always visible** (never capped
by the "עוד שאלות" expander), shown only when a WhatsApp contact channel exists.
`WhatsAppQuestionChips.jsx` was not touched (label + prefill both flow from
`whatsapp.question_chips.*` in `he.json` / `en.json`).
