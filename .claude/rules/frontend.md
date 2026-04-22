# Frontend rules

Next.js + Tailwind + Framer + Leaflet patterns. RTL-specific guidance
lives in its own file — see [.claude/rules/rtl.md](./rtl.md).

---

## Stack

Next.js 14 (App Router) + Tailwind + Framer Motion + Leaflet. JavaScript
(not TypeScript); JSDoc for typed params where it matters.

---

## Cloudinary

All image URLs go through `lib/cloudinary.js`. The helper injects
`f_auto,q_auto` automatically — never hardcode transform params in
component code. If a component needs a custom transform, extend the
helper, don't bypass it.

---

## Zod validation before every map API call (Rule 19)

Import schema from `lib/schemas.js`. Call `safeParse()` before any
`api.get` / `api.post` or Leaflet mutation. On failure:

```js
showToast(error.issues[0].message, "info");
return;
```

Never pass `NaN`, `null`, `0`, or values `> 50` to the API or to map
functions.

---

## RTL

All RTL rules, logical properties, and exceptions:
[.claude/rules/rtl.md](./rtl.md).

---

## Map z-index tokens

Quick reference (full context in [.claude/rules/rtl.md](./rtl.md)):

```
tiles:0 → markers:400 → tooltips:500 → bottom-sheet:600 →
legend:800 → controls/zoom/search:1000 → chat:9999 → cookie:9998
```

Do not use arbitrary z-index values on `/map`.

---

## After UI changes

- Update [docs/MANUAL_TESTING.md](../../docs/MANUAL_TESTING.md) with any
  new features. Format:
  `[ ] Test — איך לבדוק — תוצאה מצופה`.
- Open the Vercel preview on **mobile** before approving any PR that
  changes visible UI (Regression rule 4).
