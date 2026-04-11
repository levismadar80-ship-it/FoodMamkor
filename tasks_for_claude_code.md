# Tasks for Claude Code — Mehamekor
> Send this file to Claude Code with: "Read CLAUDE.md, then execute all tasks in this file one by one. Open a separate PR for each task."

---

## 🔴 Bug Fixes (urgent)

### 1. Fix RTL in registration form
- Text in form fields appears LTR instead of RTL on mobile
- Fix all input fields in `/register` and `/register/producer` with `dir="rtl"` and `text-right`

### 2. Replace "דשבורד" → "ניהול העסק"
- Search entire project for the word "דשבורד" in all UI-facing strings (header, footer, sidebar, nav)
- Replace with "ניהול העסק" everywhere users can see it
- Do NOT rename variables, routes, or component names — only visible text strings

### 3. Fix city name truncation on map
- On `/map` — the city search field truncates long city names
- Fix the input width so full city names are visible
- Also check the autocomplete dropdown width

### 4. Fix category card placeholder image (Dairy)
- "חלב וגבינות" category shows plain green placeholder instead of a real image
- Use this Unsplash URL: `https://images.unsplash.com/photo-1486297678162-eb2a19b0a432?w=600&fit=crop&auto=format`

### 5. Fix "טיפוח וסבונים" category image
- Current image has a brand watermark (Act+Acre) — replace it
- Use this Unsplash URL: `https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=600&fit=crop&auto=format`

### 16. Fix parallax on iOS Safari
- `background-attachment: fixed` does not work on iOS Safari — the background becomes static and the effect breaks entirely
- Add a CSS fallback using `@supports not (background-attachment: fixed)` that sets `background-attachment: scroll`
- Affects: Hero section, SectionDivider component, ParallaxQuote component
- Test on both Chrome iOS and Safari iOS after fix

### 17. Normalize WhatsApp phone links
- In ProducerCard and `/producer/:id`, the WhatsApp `wa.me` link breaks if phone starts with `0` instead of `+972`
- Add a helper function `normalizePhone(phone)` in `lib/utils.js`:
  - Strip all spaces, dashes, parentheses
  - If starts with `0`, replace with `972`
  - If starts with `+`, strip the `+`
  - Example: `"052-123-4567"` → `"https://wa.me/972521234567"`
- Apply this function everywhere a WhatsApp link is generated

### 18. Form submit loading state
- On all forms (login, register, register/producer, contact form on /about, newsletter footer):
  - Disable the submit button immediately on click
  - Show a small spinner inside the button (replace button text with spinner + "שולחת...")
  - Re-enable the button and restore original text if the server returns an error
- This prevents duplicate submissions on slow connections

---

## 🟠 UX Improvements

### 6. Forgot password link on login page
- Add link below password field: text = "שכחתי סיסמא ←"
- Check if `POST /auth/forgot-password` endpoint exists in the backend
- If yes: implement full flow (modal → enter email → send reset link → success message)
- If no: show toast message "נשלח לך מייל לאיפוס סיסמא בקרוב" and add TODO comment

### 7. Show/hide password toggle (eye icon)
- Add Phosphor `Eye` / `EyeSlash` icon inside password fields on both `/login` and `/register`
- Toggle between `type="password"` and `type="text"` on click

### 8. Inline form validation
- Show errors on `onBlur` (not while typing)
- Rules:
  - Email: must contain `@` and valid domain → error: "האימייל לא תקין"
  - Password: min 8 chars → error: "סיסמא חייבת להכיל לפחות 8 תווים"
  - Password (register): add strength indicator (חלשה / בינונית / חזקה)
  - Full name: not empty → error: "שם מלא הוא שדה חובה"
  - Phone (optional): Israeli format 05X-XXXXXXX → error: "מספר טלפון לא תקין"
- UI: red border + small red text below field on error, green checkmark when valid
- Disable submit button if any required field has an error
- Colors: use `text-red-500` for errors, `#2e6853` for valid checkmark

### 9. Producer cards — 2-column grid on mobile
- On mobile (< 768px), show producer cards in a 2-column grid instead of 1 column
- Reduce card image height from 200px to 140px on mobile
- Ensure text (name, city, price) doesn't overflow — truncate with ellipsis if needed
- Apply to both the homepage producer grid and the `/map` sidebar grid

### 10. Better empty state for /neighbor
- When no home products exist for the selected city, show a friendly empty state
- Include: large emoji 🏡, heading "אין מוצרים באזור הזה עדיין 🌱", subtext "היי את הראשונה לפרסם מוצר בית!", CTA button "פרסמי מוצר +"

---

## 🟡 New Features

### 11. "Near me" geolocation on homepage
- On the homepage hero section, add a "קרוב אלי" button near the search bar
- On click: request browser geolocation → if approved, scroll to producer grid and filter by nearest producers using existing Haversine distance endpoint with radius_km=15
- If geolocation denied: show toast "אפשרי גישה למיקום בהגדרות הדפדפן"
- Use Phosphor `Crosshair` icon

### 12. Advanced search filters
- Add filter chips below the search bar on homepage and `/map`:
  - ✡️ כשר
  - 🌿 אורגני
  - 🚚 משלוח
  - ✅ מאומת בלבד
- Filters are toggleable chips (multi-select)
- Wire to existing backend query params: `verified=true`, `delivery_city=`, category filters
- On mobile: horizontal scrollable chips row

### 13. Recently viewed businesses
- Store last 5 viewed producer IDs in `localStorage` (key: `recently_viewed`)
- Show a "ביקרת לאחרונה" horizontal scroll section on the homepage, above the main grid
- Only show this section if the user has at least 1 recently viewed producer
- Each card: small ProducerCard variant (image + name + city only)

### 14. Share button on producer page
- On `/producer/:id`, add a share button in the sticky contact sidebar
- Options: WhatsApp share link, Copy link to clipboard
- Use Phosphor `ShareNetwork` icon
- On copy: show toast "הקישור הועתק ✓"
- WhatsApp share text: "גיליתי את [שם העסק] במהמקור — [URL]"

### 15. Language toggle (Hebrew / English)
- Add a language toggle button in the header (desktop + mobile menu)
- Toggle options: עב / EN
- On toggle: add/remove a CSS class `lang-en` on `<body>` — do NOT modify `lang` or `dir` on `<html>` directly, as this can break Next.js RTL layout globally
- Store preference in `localStorage` (key: `lang`)
- Add basic English translations for: nav items, hero text, CTA buttons, footer links
- Note: full i18n is a future task — this is a foundation layer only

---

## 📋 Instructions for Claude Code
- Open a separate PR per task (or group 2-3 small related tasks)
- All UI text follows CLAUDE.md micro-copy rules (female gender, no "יצרן")
- Do NOT rename variables, API routes, or DB column names — only visible UI strings
- Update CLAUDE.md after completing all tasks
