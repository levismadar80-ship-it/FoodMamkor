# P7/8 — A11y + RTL/i18n: WCAG 2.2 AA · logical properties · עברית נקבה

> Pass 7 of the **MEH-1721** audit epic. **Read-only** — this report maps
> accessibility and RTL/i18n findings. It fixes nothing. Per the ticket's
> over-engineering guard, a finding is **a violation + its SC + a location**.

---

## 1 · Snapshot

| | |
|---|---|
| **Audited tree** | `origin/staging` @ `1ddce8c0` (P6 merge) |
| **Locales** | `he` (default, `dir="rtl"`) · `en` (`dir="ltr"`), `localePrefix: "as-needed"` |
| **Message keys** | he **3,659** · en **3,642** |
| RTL physical-property violations (unsuppressed) | **14** |
| `aria-label` on a non-native element with no `role`| **12** |
| Brand contrast pairs failing AA | **0 of 5** |
| Masculine-form Hebrew strings | **3** |

**`/en` is a real, reachable route** — `app/[locale]/layout.js:189` sets
`const dir = locale === "he" ? "rtl" : "ltr"`, `i18n/routing` declares
`locales: ["he", "en"]`, and `messages/en.json` carries 3,642 populated keys.
That fact is load-bearing for §2: a hardcoded `text-right` is invisible under
`he` and wrong under `en`.

---

## 2 · Findings summary

| ID | Sev | Finding | WCAG SC | Fix | Tier |
|---|---|---|---|---|---|
| F-1 | 🟡 Med | 8 hardcoded `text-right` / `text-left` — correct in `he`, **wrong in `en`** | 1.3.2 · 1.4.8 | S | 🟢 |
| F-2 | 🟡 Low | 12 `aria-label` on a non-native element with no `role` — prohibited ARIA | 4.1.2 | S | 🟢 |
| F-3 | 🟡 Low | 31 `he` keys absent from `en` (and 14 the other way) | 3.1.2 | M | 🟢 |
| F-4 | ⚪ Info | 3 masculine-form Hebrew strings (1 user-facing, 2 admin) | — | S | 🟢 |
| F-5 | ⚪ Info | 4 legitimate physical-property uses missing their `rtl-ok` marker | — | S | 🟢 |

**0 critical, 0 high.** Contrast passes AA on every brand pair (§5), the RTL
allowlist mechanism works, and the `יצרן` concern from MEH-232 is **fully
resolved** (§6) — measured, not assumed.

---

## 3 · RTL — logical properties

Scanned `frontend/**/*.{js,jsx,ts,tsx,css}` for physical directional classes,
replicating `.claude/hooks/check-rtl.sh`'s own logic: 12 allowlisted paths
skipped, `rtl-ok` suppression applied over a ±1-line window.

| | |
|---|---|
| Allowlisted files skipped | 12 |
| Hits suppressed by an `rtl-ok` marker | 6 |
| **Unsuppressed hits** | **14** |

All 14, classified — the ticket asks for each to be marked violation **or**
permitted exception:

### F-1 🟡 Med — 8 hardcoded text alignments that break under `/en`

| File:line | Class | |
|---|---|---|
| `components/CategoryRequestModal.jsx:62, 76, 89` | `text-right` ×3 | modal + 2 inputs |
| `components/ReportInfoModal.jsx:76, 96, 114` | `text-right` ×3 | modal + 2 inputs |
| `components/RecipeForm.jsx:37` | `text-right` | shared input class |
| `app/[locale]/group-buys/[id]/GroupBuyDetailClient.jsx:338` | `text-right` | |

Under `he` these are **invisible** — `dir="rtl"` already right-aligns text, so
`text-right` is a redundant no-op and nothing looks wrong. Under **`/en`** the
container is `dir="ltr"`, the rest of the form left-aligns, and these fields
force their text to the right edge while their labels sit left. That is a
genuine reading-order defect (**SC 1.3.2 Meaningful Sequence**), not a style
nit, and it is exactly what `text-start` exists for.

`CategoryRequestModal.jsx:62` is the sharpest case — the container carries
**both** `dir="rtl"` and `text-right`, hard-pinning the modal to RTL regardless
of locale.

**Fix S** (`text-right` → `text-start`). 🟢 GREEN — presentation only.

### F-5 ⚪ Info — 4 correct uses that the hook will still flag

`app/[locale]/register/producer/RegisterProducerClient.jsx:815-816, 887-888`

These carry an inline explanation — *"text-right kept: `dir="ltr"` numeric
license — physical right = start side in the RTL form"* — which is a
**correct** application of the rule: the input is `dir="ltr"` for a numeric
licence number, so physical `right` genuinely is the visual start. The code is
right; it just lacks the `rtl-ok` marker `.claude/rules/rtl.md` prescribes for
exactly this case, so `check-rtl.sh` flags it on every edit.

**Fix S** (add `// rtl-ok` on the adjacent line). Not a violation — recorded so
a future sweep doesn't "correct" working code.

### Checked and cleared

`app/[locale]/error.js:60` — `text-left` on a `<pre>` rendering a stack trace.
Stack traces are LTR content; left-aligning them is correct.
`components/StoryCardCanvas.jsx:310` — `<pre>` with `whitespace-pre-wrap`,
same class of LTR-content block.

Both would benefit from an `rtl-ok` marker for the same reason as F-5.

---

## 4 · ARIA

### F-2 🟡 Low — 12 `aria-label` on non-native elements with no `role`

Of **222** JSX opening tags carrying `aria-label`, **12** sit on a plain
`<span>` or `<div>` with no `role`:

| File:line | Element |
|---|---|
| `app/[locale]/admin/layout.js:140` | `<span>` |
| `app/[locale]/admin/reviews/page.jsx:162` | `<span>` |
| `app/[locale]/admin/producers/AdminProducersTable.jsx:85, 96, 106, 128, 138, 320` | `<span>` ×6 |
| `app/[locale]/events/EventsClient.jsx:506` | `<div aria-busy>` |
| `app/[locale]/events/[id]/EventDetailClient.jsx:49` | `<div aria-busy>` |
| `app/[locale]/about/AboutClient.jsx:144` | `<div>` |
| `components/TrustBadge.jsx:47` | `<span>` |

`aria-label` on an element with no role is **prohibited ARIA** (axe
`aria-prohibited-attr`, serious): assistive tech drops the label silently, so
the element ends up unlabelled rather than mislabelled — the failure is
invisible in a visual check. **SC 4.1.2 Name, Role, Value.**

**The repo already has the fix pattern and a written rationale.**
`components/ReviewsSection.jsx:37-42` records MEH-1556 solving precisely this:

> *"MEH-1556: `role="img"` makes the aria-label legal here. Without a role,
> aria-label on a plain div is prohibited ARIA (axe `aria-prohibited-attr`,
> serious) and assistive tech drops the label silently — leaving the row
> unlabelled, since every star span below is aria-hidden."*

`components/ImageWithFallback.jsx:39-41` shows the same fix applied
(`role="img"` beside the `aria-label`). Most of the 12 are the identical shape:
a decorative icon in a `<span>` whose `aria-label` is the only accessible name.

**MEH-1227's count is confirmed unchanged at 12.** That inventory has neither
grown nor been worked since it was filed — the number is the same today, from an
independent scan. **Fix S** each. 🟢 GREEN.

---

## 5 · Contrast — passes AA on every brand pair

Computed from the WCAG 2.x relative-luminance formula (exact arithmetic, not a
screenshot estimate):

| Pair | Ratio | AA normal (4.5) | AA large (3.0) |
|---|---|---|---|
| `#2e6853` primary on `#F5F0E8` cream | **5.75:1** | ✅ | ✅ |
| `#2e6853` primary on `#FFFFFF` | **6.52:1** | ✅ | ✅ |
| `#FFFFFF` on `#2e6853` primary | **6.52:1** | ✅ | ✅ |
| `#6B6B6B` fg-muted on `#FFFFFF` | **5.33:1** | ✅ | ✅ |
| `#6B6B6B` fg-muted on `#F5F0E8` cream | **4.70:1** | ✅ | ✅ |

**No finding.** The tightest pair is fg-muted on cream at 4.70:1 — passing, but
with only 0.20 of headroom over the 4.5 threshold. Worth knowing before anyone
lightens either token: a small nudge to `#6B6B6B` or a slightly darker cream
would drop it below AA.

This covers the token pairs the ticket names. It is **not** a full-page contrast
sweep — see §8.

---

## 6 · i18n

### F-3 🟡 Low — 45 keys exist in only one locale

`he` has 3,659 keys, `en` has 3,642. Flattened and diffed:

- **31 keys in `he`, missing from `en`** — the largest cluster is
  `admin.whatsapp_failures.*` (12 keys: column headers, empty state, load error,
  status labels, subtitle), i.e. an entire admin screen with no English strings.
- **14 keys in `en`, missing from `he`** — including `home.founder_quote.text`
  and `.attribution`, and four `home.marquee.tag_*` entries.

The `en`-only direction is the more surprising one: those are **homepage**
strings present in English and absent in the default locale. Whether they render
a fallback, a raw key, or nothing depends on the next-intl config and was not
traced here.

**SC 3.1.2 Language of Parts** is the nearest fit, though the real risk is
plainer: a missing key renders as a key. **Fix M** (translation work, not code).
🟢 GREEN.

### F-4 ⚪ Info — 3 masculine-form strings

Word-bounded search over `messages/he.json` (Hebrew letter-class boundaries, so
`בחר` does not match inside `בחרי` or `נבחר`):

| Key | String | |
|---|---|---|
| `auth.register.producer.fields.referral_source.placeholder` | `בחר אפשרות` | **user-facing** — producer registration |
| `admin.producers.table.actions.story_card_title` | `צור כרטיס אינסטגרם` | admin-only |
| `admin.producers.form.submit_create` | `צור עסק` | admin-only |

Only the first is on a user-facing surface; the site's convention is feminine
address (`בחרי`). **Fix S.** 🟢 GREEN.

### `יצרן` — resolved, and worth stating as a clean result

A raw grep finds **18** occurrences of `יצרן`, which reads alarming against
MEH-232's "יצרן/יצרנית שנותרו" concern. Classifying all 18: **every one** is the
regulatory term — `מספר רישיון יצרן` ("manufacturer licence number") or
`רישיון יצרן ממשרד הבריאות`. That is the Ministry of Health's own name for the
licence, not a way of addressing the user.

**Zero occurrences address the user as `יצרן`.** MEH-232's concern is fully
closed on this axis; the remaining 18 are a legal term and must not be
"corrected".

Likewise `בחר` appears 3× but only **1** is an imperative — the other two are
`שבית העסק בחר` ("which the business chose"), past tense, grammatically correct.

---

## 7 · Measurement notes — the detectors needed six corrections

Recorded because it is now the pattern across P4–P7, and because every raw
number in this pass was wrong before it was right.

**The aria scan went 101 → 24 → 15 → 14 → 12**, through four distinct defects in
my own detector:

1. **Off-by-one window** — a 4-line lookback indexed from a 1-based line number
   missed `<select>` sitting exactly 4 lines above its `aria-label`.
2. **Window too small** — `SearchClient.jsx`'s `<input>` is 8 lines above its
   attribute; `EventsClient.jsx`'s `<button role="tab">` similar.
3. **Comments counted as code** — 7 hits were prose *about* `aria-label`
   (including the MEH-1556 rationale block, which explains the correct fix).
4. **Backward-only `role` search** — `ImageWithFallback.jsx` declares
   `aria-label` on line 40 and `role="img"` on line **41**. Scanning only
   upward marked a correctly-fixed component as a violation.
5. **`<` matched JS comparisons** — `page < totalPages` and `d < dateKey(today)`
   parsed as JSX tags `<totalPages>` and `<dateKey>`.

Only after extracting complete opening tags — and checking `role` across the
whole tag, comments stripped — did the count settle at 12, which independently
reproduces MEH-1227's figure.

**The Hebrew counts were substring matches.** A naive grep reported
`בחר` 12 · `שלח` 18 · `צור` 8 · `יצרן` 18, implying dozens of masculine-form
strings. Those match inside `בחרי`, `נבחר`, `לשלוח`, `יצרנית`. Word-bounded, the
real total is **3**.

**One metric is withdrawn rather than reported.** A scan for `<div>`/`<span>`
with `onClick` but no `role`+`tabIndex` (SC 2.1.1 Keyboard) returned 21. Spot-
checking showed the line numbers pointing at plain JavaScript — a `useEffect`
closing brace, a `setError(...)` call — because the brace-depth scan for the
tag's closing `>` ran past the tag and swallowed an `onClick` from far below.
**No keyboard-accessibility number appears in this report**; it is listed in §8
as not measured. Same discipline as P6's withdrawn endpoint metric.

---

## 8 · Not measured

- **Keyboard accessibility** (SC 2.1.1) — the only probe built for it was
  unreliable (§7). Interactive-`div` coverage, focus traps and tab order are
  **unmeasured**.
- **No axe / Lighthouse run.** Every §4 finding is a static read. An automated
  a11y pass needs a served build plus a reachable backend — the same sandbox
  limitation as P4.
- **WCAG 2.2's new criteria are only partly addressed.** **2.5.8 Target Size**
  and **2.4.11 Focus Not Obscured** were **not** systematically checked;
  `min-h-[44px]` appears on controls in spot-reads but no sweep was run.
- **Full-page contrast.** §5 covers the brand token pairs the ticket names, not
  every rendered combination (badges, disabled states, overlays, map chips).
- **Screen-reader behaviour.** Nothing here was verified with NVDA/VoiceOver;
  F-2's "silently dropped" consequence is the documented axe rule, not an
  observation.
- **Whether the 45 orphan i18n keys render a fallback or a raw key** — the
  next-intl fallback config was not traced.
- **`alt` text quality.** Presence was not swept; §4 covers `aria-label` only.

---

## 9 · Appendix — commands and raw results

```
RTL sweep (replicating check-rtl.sh)
  allowlisted files skipped        12
  rtl-ok suppressed hits            6
  unsuppressed                     14
     text-right (F-1)               8   CategoryRequestModal:62,76,89
                                        ReportInfoModal:76,96,114
                                        RecipeForm:37 · GroupBuyDetailClient:338
     documented dir="ltr" (F-5)     4   RegisterProducerClient:815,816,887,888
     LTR content <pre>              2   error.js:60 · StoryCardCanvas:310

locale wiring
  app/[locale]/layout.js:189   const dir = locale === "he" ? "rtl" : "ltr"
  i18n/routing                 locales ["he","en"] · defaultLocale he · as-needed

i18n parity
  he 3,659 keys · en 3,642 keys
  in he, missing from en   31   (12 = admin.whatsapp_failures.*)
  in en, missing from he   14   (incl. home.founder_quote.*, home.marquee.tag_*)

aria
  opening tags carrying aria-label            222
  non-native element, no role                  12   ← MEH-1227 count unchanged
  (detector corrections before this settled:  101 → 24 → 15 → 14 → 12)

contrast (WCAG relative luminance, computed)
  #2e6853/#F5F0E8 5.75  #2e6853/#FFFFFF 6.52  #FFFFFF/#2e6853 6.52
  #6B6B6B/#FFFFFF 5.33  #6B6B6B/#F5F0E8 4.70          → 0 of 5 fail AA

Hebrew, word-bounded
  יצרן   18  → 18/18 are "רישיון יצרן" (regulatory term), 0 user-address
  בחר     3  → 1 imperative ("בחר אפשרות"), 2 past-tense (correct)
  צור     2  → both admin-only imperatives
  לחץ · שלח · הזן · המשך      0 imperatives

keyboard (SC 2.1.1)  — probe unreliable, metric WITHDRAWN (§7)
```
