# Self-hosted brand typefaces (MEH-2029)

Seven `.woff2` files — the two subsets this site actually renders (latin,
hebrew) for the four brand families. Loaded by [`../fonts.js`](../fonts.js).

## Provenance — these are not re-encoded

Every file here is a **byte-for-byte copy** of a file that `next/font/google`
itself emitted into `.next/static/media` on the last build before this
migration. Nothing was re-downloaded, re-subsetted, or re-compressed, so the
outlines and the head/OS-2 metrics are necessarily identical to what the site
was already serving. That is the whole reason for harvesting them from the
build output rather than fetching them from Google directly: it removes
"did the glyphs change?" from the review entirely.

| File | Family | Subset | Size |
|---|---|---|---|
| `frank-ruhl-libre-hebrew.woff2` | Frank Ruhl Libre | hebrew | 18 KB |
| `frank-ruhl-libre-latin.woff2` | Frank Ruhl Libre | latin | 43 KB |
| `dm-sans-latin.woff2` | DM Sans | latin | 36 KB |
| `heebo-hebrew.woff2` | Heebo | hebrew | 12 KB |
| `heebo-latin.woff2` | Heebo | latin | 29 KB |
| `cormorant-garamond-latin.woff2` | Cormorant Garamond | latin, normal | 37 KB |
| `cormorant-garamond-latin-italic.woff2` | Cormorant Garamond | latin, italic | 38 KB |

**228 KB total, down from 524 KB.** The 13 dropped files (313 KB) were the
`latin-ext`, `cyrillic`, `cyrillic-ext`, `vietnamese` and math/symbol faces —
no surface on this site renders those scripts, and `next/font/google` fetched
them on every build regardless of the `subsets:` option.

All four are **variable** fonts: one file per subset covers the entire wght
axis, which is why the previous build produced 60 `@font-face` rules from only
20 files.

## Licence

All four families are licensed under the **SIL Open Font License 1.1**, which
permits redistribution — including bundling the font files in an application —
provided the licence travels with them and the fonts are not sold on their own.

- Frank Ruhl Libre — © The Frank Ruhl Libre Project Authors
- DM Sans — © The DM Sans Project Authors
- Heebo — © The Heebo Project Authors
- Cormorant Garamond — © The Cormorant Project Authors

Full text: <https://openfontlicense.org/open-font-license-official-text/>

## Replacing or adding a file

1. Add or replace the `.woff2` here.
2. Add its `src` entry in [`../fonts.js`](../fonts.js) — as a **literal**, never
   via a helper. Turbopack serialises those call arguments statically and drops
   anything it cannot evaluate; a dropped `src` fails loudly, a dropped
   `declarations` fails silently.
3. `npx vitest run __tests__/fonts-are-local.test.js` — it checks that every
   declared path exists, that nothing re-introduces `next/font/google`, and that
   the fallback-bearing half of a split family still sorts last in the stacks.
4. Expect VRT to move if the typeface actually changed, and review the PNGs by
   eye before accepting any baseline.
