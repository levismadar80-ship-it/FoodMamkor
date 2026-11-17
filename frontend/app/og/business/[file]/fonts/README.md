# Fonts for the link-preview card (MEH-3329)

Satori (next/og) reads TTF/OTF/WOFF, not the `.woff2` files in `app/fonts/`, so
the card carries its own two TTFs:

| File | Family | Source |
|---|---|---|
| `FrankRuhlLibre-Bold.ttf` | Frank Ruhl Libre 700 | Google Fonts CSS2 API, TTF delivery, 16/11/2026 |
| `Heebo-Regular.ttf` | Heebo 400 | same |

Both are SIL Open Font License 1.1, the same families the site renders.
