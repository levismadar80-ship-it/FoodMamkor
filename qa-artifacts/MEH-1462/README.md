# MEH-1462 — "יש לי רעיון למתכון" WhatsApp question chip

`recipe-idea-chip-375.webp` — mobile 375px, RTL. Harness of the
`WhatsAppQuestionChips` row (the CC sandbox can't SSR-populate `/producer/[id]`,
so this renders the row's structure + design tokens; final mobile QA is Sapir's
on the Vercel preview).

The dashed-outlined **"יש לי רעיון למתכון"** row is the new chip: rendered **last**
in the row, **always visible** (never capped by the "עוד שאלות" expander), shown
only when a WhatsApp contact channel exists. Clicking it opens WhatsApp with the
Sapir-locked prefill "היי! הגעתי מהעמוד שלכם במהמקור — יש לי רעיון למתכון עם
המוצרים שלכם:" — no in-page disclosure.
