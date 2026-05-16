# Discovery redesign — synthesis + priority matrix

> **Issue:** MEH-596 (Sub 3/4 of MEH-592 epic — discovery-layer redesign)
> **Date:** 2026-05-15
> **Author:** Claude (Opus 4.7 high), Sapir-voice
> **Inputs:** [`docs/audits/2026-05-homepage-discovery-audit.md`](../audits/2026-05-homepage-discovery-audit.md) (Sub 1) + [`docs/research/2026-05-competitive-discovery-research.md`](../research/2026-05-competitive-discovery-research.md) (Sub 2) + 10 screenshots in [`docs/research/screenshots/2026-05/`](../research/screenshots/2026-05/)
> **Status:** decision document — Sub 4 (Linear cleanup) executes on the Linear actions named here
> **Scope:** observation → synthesis → recommendations. No code. No final mockups (ASCII only). No Linear mutations.

---

## Section 1 — Executive summary

### Bottom line

Mehamakor's homepage works like a directory but the brand says magazine — and the saturation in the Israeli set (5 of 7 competitors use the same *"מהחקלאי לצרכן"* tagline; 0 of 7 have a producer map; 0 of 7 use feminine voice) means **the magazine-with-a-map combination is empirically distinct stake-out ground.** The single highest-leverage change is moving the existing mini-map (MEH-538) above the fold so the "קרוב אלייך" promise is visible in the first 2 seconds, not after 6 sections of scroll.

### Top 3 changes to make before launch (launch-blockers)

1. **Move `<HomepageMiniMap>` above the fold** — currently at `page.js:113` (section #7); move to between `<HomeHero>` and `<FridayDeliveryStrip>` (section #2). Performance trade-off (LCP) addressed in Section 5. Cite: [Sub 1 §1.1.4](../audits/2026-05-homepage-discovery-audit.md#11-homepage----localepagejs), [Sub 1 §1.2.1](../audits/2026-05-homepage-discovery-audit.md#12-map--frontendapplocalemappagejs--mapclientjsx), [Sub 2 Pattern 2](../research/2026-05-competitive-discovery-research.md#pattern-2--map-or-location-search-as-primary-discovery), [Sub 2 §4.8 #1](../research/2026-05-competitive-discovery-research.md#48--israeli-pain-points-unaddressed-by-competitors--mehamakor-opportunity).
2. **Rewrite the final-CTA "דירקטורי" line** — magazine thesis cannot survive its own conversion pitch calling itself a directory. Replace `"הצטרפו לדירקטורי הראשון בישראל"` with a community/magazine-tier alternative ([Section 5.2](#52--hebrew-copy-directions-3)). Cite: [Sub 1 §3.2 C1](../audits/2026-05-homepage-discovery-audit.md#32-whats-contradictory-between-current-site-and-the-magazine-not-marketplace-thesis-3-examples), [Sub 2 Anti-pattern 1](../research/2026-05-competitive-discovery-research.md#anti-pattern-1--generic-מהחקלאי--fresh-from-the-farm-hero-with-no-differentiator).
3. **Rewrite the categories subhead** — `"ישר מבית העסק — בלי מתווכים"` is the saturated category-cliché (5/7 Israeli competitors say the same thing). farmdirect.co.il's *"ללא פערי תיווך"* is the sharper version of the same idea. Pick something only mehamakor can say ([Section 5.2](#52--hebrew-copy-directions-3)). Cite: [Sub 1 §3.2 C4](../audits/2026-05-homepage-discovery-audit.md#32-whats-contradictory-between-current-site-and-the-magazine-not-marketplace-thesis-3-examples), [Sub 2 Anti-pattern 1](../research/2026-05-competitive-discovery-research.md#anti-pattern-1--generic-מהחקלאי--fresh-from-the-farm-hero-with-no-differentiator).

### Top 2 changes to defer post-launch (with rationale)

1. **Producer stories carousel** (Sub 1 H2) — high-leverage but requires producer-side content collection (stories don't exist in the DB at the depth needed). Pre-launch we have ~12 producers; post-launch as the network grows, the carousel earns its placement. Defer to Q3 2026.
2. **Trust ladder / process page** (Sub 1 H3) — *"תהליך הקבלה למהמקור"* (MEH-534 in backlog). High-trust signal but content-heavy and not a launch blocker — the verified badge does enough work pre-launch. Defer to Q3 2026.

### Confidence level

**Medium-high.** Strong on Israeli-specific findings (Sub 2 had direct evidence from 7 sites' page titles + 5 manual screenshots from Sub 2's top-5). Weaker on map-as-primary timing — Sub 2's `[unverified-from-snippets]` tag covers exact map placement on CrowdFarming, GrownBy, LRQDO; the 5 screenshots from PR #678 confirm them but the synthesis depends on the principle (*spatial discovery is the cleanest entry point for a directory*) more than per-site execution detail. The 3 sapir-decisions locked in Phase 0 ("hybrid counters", "hybrid map", "defer H1 to Sub 4") narrow the recommendation surface — confidence is high on the recommendations given those decisions.

---

## Section 2 — Findings

14 findings total: **4 🔴 Critical** (target: 3-5), **8 🟡 Important**, **2 🟢 Polish**.

Every finding cites Sub 1 or Sub 2 by line/section. The "thesis-alignment" column answers *"Does fixing this serve 'magazine, not marketplace'?"* (yes / no / depends).

### 🔴 Critical (4)

#### F1 — Map is section #7 in homepage scroll order, should be above the fold
- **Evidence:** Sub 1 §1.1 render-order table (map at `page.js:113`); Sub 1 §1.2.1 ("the page exists but is not announced from the homepage with appropriate weight"); Sub 1 §1.1.4 (map appears unannounced between holiday banner and category grid).
- **Sub 2 corroboration:** Pattern 2 (map-or-location-search as primary discovery — LRQDO hive-locator hero, Airbnb split-view, Farmish map+keyword); §4.8 #1 (*no Israeli competitor in the study has a producer map* — this is the single biggest discovery-layer differentiator).
- **Thesis-alignment:** YES — spatial discovery is the magazine's "where are these producers" answer; today's placement buries it.
- **Launch-blocker?** YES.

#### F2 — Final CTA names itself "דירקטורי" — defects from the magazine thesis
- **Evidence:** Sub 1 §3.2 C1 (verbatim: *"הצטרפו לדירקטורי הראשון בישראל לאוכל אמיתי"* from `home.cta.body`); Sub 1 §3.3 Q7 (warm-community peers don't use "directory" language).
- **Sub 2 corroboration:** §4.8 #3 (no Israeli site has a magazine layer — `gan-hasade.com`'s *"חווה לחקלאות בת קיימא"* is the only values-first tagline in the study); Anti-pattern 1 (saturated category formulas).
- **Thesis-alignment:** YES — most direct contradiction in the study.
- **Launch-blocker?** YES.

#### F3 — Categories subhead is the saturated *"מהחקלאי"* formula
- **Evidence:** Sub 1 §3.2 C4 (verbatim: *"ישר מבית העסק — בלי מתווכים"*).
- **Sub 2 corroboration:** Anti-pattern 1 (5 of 7 Israeli sites use *"מהחקלאי לצרכן"* / *"ישר מהחקלאי"* / *"מהשדה לבית"* permutations in their `<title>` element — formula is saturated); Pattern 4 (farmdirect.co.il's *"ללא פערי תיווך"* is the sharper anti-middleman framing — but it's a single farm, not a directory, so the lane is open).
- **Thesis-alignment:** YES — magazines describe, marketplaces guarantee. The current copy guarantees.
- **Launch-blocker?** YES.

#### F4 — Stats counter pattern is marketplace-tier; copy needs magazine reframe
- **Evidence:** Sub 1 §3.2 C2 (counter strip pattern borrowed from Wolt/Tigerhe family); Sub 1 §1.1.2 (slot disappears between states — CLS risk).
- **Sub 2 corroboration:** Pattern 1 (hard-number trust strip works as social proof — *"quantities resist hand-wave skepticism"*); cited examples (CrowdFarming 300 farmers, Farm to People 150+ farms, LRQDO 1.5M members) — but those are marketplaces that *lead* with metrics. Magazines (Kinfolk, Cereal, per Sub 1 H1 hypothesis) don't.
- **Sapir-decision Q1:** keep the counter (early-launch trust signal is valuable), reframe the copy from marketplace-tier ("נמצאו 12 בתי עסק") to magazine-tier ("גליון מאי — 12 בתי עסק"). Trade-off in Section 4.
- **Thesis-alignment:** depends — pattern stays, voice changes.
- **Launch-blocker?** NO — copy fast-follow within first week post-launch is acceptable.

### 🟡 Important (8)

#### F5 — "בתי עסק מומלצים" heading vs "דירקטורי" CTA within one scroll
- **Evidence:** Sub 1 §3.2 C3 — same page calls businesses both "curated/recommended" (section 12) and "directory" (section 19).
- **Sub 2 corroboration:** No direct evidence (Sub 2 didn't capture this exact contradiction in peers); judgment call.
- **Thesis-alignment:** YES — internal inconsistency is a magazine-credibility cost.
- **Linear action:** rolled into F2 (CTA reframe) — fixing F2 may resolve F5 incidentally.

#### F6 — HIW step 3 uses conversion language ("בלי הנחות על האיכות")
- **Evidence:** Sub 1 §3.2 C5 — *"אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות"* is differentiation-against-competitors language, not magazine description.
- **Sub 2 corroboration:** PARTIAL — Pattern 4 (anti-middleman framing) is valid for sharp positioning, but "בלי הנחות על האיכות" is generic ("not the cheap one"). farmdirect's "ללא פערי תיווך" works because it names what's removed.
- **Thesis-alignment:** YES.
- **Linear action:** NEW MEH — HIW copy reframe (separate from F2/F3).

#### F7 — Founder amplification missing on homepage
- **Evidence:** Sub 1 §3.1 H4 (founder credibility lives on /about only after MEH-527; absent on the homepage that converts).
- **Sub 2 corroboration:** §4.4 (Israeli competitors use family-generations storytelling — noyhasade's *"דור שלישי"*, hasade.co.il's *"דור שלישי של חקלאות ישראלית"*, sadeyarok's Kobi+Dana family origin — *but always in male voice*. Feminist framing is structurally absent in the Israeli set).
- **Thesis-alignment:** YES strong — feminine voice is mehamakor's protected differentiator (CLAUDE.md rule).
- **Linear action:** NEW MEH — homepage founder strip (single line + thumbnail, between sections 6 and 7).

#### F8 — Producer stories carousel as homepage primary editorial
- **Evidence:** Sub 1 §3.1 H2; MEH-542 already in backlog.
- **Sub 2 corroboration:** Pattern 3 (producer-as-protagonist — CrowdFarming WTF blog, Etsy "tell your story" SEO advice, noyhasade founder); §4.8 #3 (no Israeli site has an editorial layer beyond product photos).
- **Thesis-alignment:** YES — strongest editorial pattern.
- **Launch-blocker?** NO — defer to Q3 2026 per Sapir Section 1 (producer content collection needed).
- **Linear action:** UPDATE MEH-542 priority + add Sub 2 evidence to description.

#### F9 — Trust ladder / process page transparency
- **Evidence:** Sub 1 §3.1 H3 + MEH-534 (process page in backlog).
- **Sub 2 corroboration:** §4.8 #3 (no Israeli competitor publishes entry criteria); OFN's *"see how much the producer was paid"* is the gold standard; CrowdFarming's "80% to farmer" claim.
- **Thesis-alignment:** YES — magazines earn trust through stated standards; "✅ מאומת" badge is a claim, the criteria are evidence.
- **Launch-blocker?** NO — defer to Q3 2026 per Sapir Section 1.
- **Linear action:** UPDATE MEH-534 priority + add Sub 2 evidence to description.

#### F10 — Stats counter has no skeleton — CLS risk between loading + render
- **Evidence:** Sub 1 §1.1.2 (`page.js:69-90` has no placeholder; section is either rendered or not).
- **Sub 2 corroboration:** None — performance finding, not a peer-pattern finding.
- **Thesis-alignment:** YES (any layout shift on the homepage breaks the "feels like a magazine" promise — magazines don't jump).
- **Linear action:** NEW MEH — add skeleton placeholder to stats counter slot (bundled with F4 reframe).

#### F11 — `/register/producer` Step 2 subhead lies ("3 שדות בלבד" — actually 6)
- **Evidence:** Sub 1 §1.5.1 — *"Actual Step 2 fields visible to a license-bearing-category producer: producer_name, description, phone, categories (multi-select), license number, legal-consent checkbox. That's 6 surfaces, not 3."* The subhead was correct before MEH-532 (description) and MEH-530 (license) shipped — drift, not error.
- **Sub 2 corroboration:** Out of Sub 2's scope (no peer onboarding flows audited).
- **Thesis-alignment:** depends — honesty serves the magazine ethos; the lie is a small one but mehamakor's brand resists it.
- **Linear action:** NEW MEH (small) — update Step 2 subhead text. Fast follow.

#### F12 — Filter persistence missing across `/map` ↔ `/producers` ↔ homepage
- **Evidence:** Sub 1 §1.2.3 — each surface owns its own chip state, no cross-surface sync.
- **Sub 2 corroboration:** None directly (Sub 2 didn't audit filter-state behavior on competitors).
- **Thesis-alignment:** depends — affects power users more than first-time visitors; magazine readers tend not to filter, but mehamakor's discovery flows expect it.
- **Linear action:** NEW MEH — cross-surface filter state via `?chips=` URL param or shared store.

### 🟢 Polish (2)

#### F13 — `MiniMap` name collision (per-producer + homepage)
- **Evidence:** Sub 1 §1.3.1 — `MiniMap.jsx` (per-producer) and `HomepageMiniMap.jsx` (homepage) coexist; `grep "MiniMap"` returns both.
- **Thesis-alignment:** N/A — documentation friction, not user-facing.
- **Linear action:** post-launch — rename `MiniMap.jsx` → `ProducerLocationMap.jsx`.

#### F14 — Two pagination models on `/producers`
- **Evidence:** Sub 1 §1.4.1 — SSR `?page=N` for unfiltered crawls + client infinite-scroll append for filtered.
- **Thesis-alignment:** N/A — implementation detail.
- **Linear action:** post-launch — pick one (probably SSR-only, kill infinite scroll).

---

## Section 3 — Priority matrix

Sorted by recommended-action order. Impact + Effort on 1-5 scale (5 = highest). **Launch-blocker count: 3** (within the spec's ≤5 ceiling).

| # | Finding | Impact | Effort | Launch-blocker | Recommended action |
|---|---|---|---|---|---|
| F1 | Map placement above the fold | **5** | **2** | ✅ YES | **now** — Sub 4 → NEW MEH (positioning fix + performance plan) |
| F2 | CTA "דירקטורי" reframe | **5** | **1** | ✅ YES | **now** — Sub 4 → NEW MEH (copy-only PR) |
| F3 | Categories subhead reframe | **4** | **1** | ✅ YES | **now** — Sub 4 → NEW MEH (copy-only PR; can bundle with F2) |
| F4 | Stats counter copy reframe | **4** | **1** | NO | **fast-follow week 1** — Sub 4 → NEW MEH (copy-only; bundle with F10 skeleton) |
| F10 | Stats counter skeleton (CLS fix) | **3** | **2** | NO | **fast-follow week 1** — bundle with F4 |
| F11 | `/register/producer` Step 2 subhead lie | **2** | **1** | NO | **fast-follow week 1** — Sub 4 → NEW MEH (1-line text change) |
| F6 | HIW step 3 reframe | **3** | **1** | NO | **fast-follow week 2** — Sub 4 → NEW MEH |
| F5 | "מומלצים" vs "directory" inconsistency | **3** | **2** | NO | **rolled into F2** — verify after F2 ships |
| F7 | Founder amplification on homepage | **4** | **3** | NO | **post-launch (Q3 2026)** — Sub 4 → NEW MEH |
| F8 | Producer stories carousel (MEH-542 already exists) | **5** | **5** | NO | **post-launch (Q3 2026)** — Sub 4 → UPDATE MEH-542 |
| F9 | Trust ladder / process page (MEH-534 already exists) | **4** | **5** | NO | **post-launch (Q3 2026)** — Sub 4 → UPDATE MEH-534 |
| F12 | Cross-surface filter persistence | **3** | **3** | NO | **post-launch (Q4 2026)** — Sub 4 → NEW MEH |
| F13 | `MiniMap` name collision | **1** | **1** | NO | **post-launch (Q4 2026)** — Sub 4 → NEW MEH |
| F14 | Two pagination models on `/producers` | **2** | **3** | NO | **post-launch (Q4 2026)** — Sub 4 → NEW MEH |

**Why only 3 launch-blockers?** Forced prioritization per spec. Map placement + CTA terminology + categories subhead are the 3 changes that, if not made before launch, would undermine the brand promise to every first-time visitor. F4 (counter reframe) is critical but copy-only and easy to fast-follow without diluting the launch story. Everything else is real work that's worth doing — but a launch with these 3 fixed and the others backlogged is honest to the magazine thesis. A launch that called itself "directory" would not be.

---

## Section 4 — Recommendations (Critical + Launch-blocker)

Each 🔴 Critical finding gets: recommendation (2-3 sentences) → ASCII mockup direction (link to file in [`mockups/`](./mockups/)) → trade-offs → citation → effort → Linear action.

🟡 Important findings get 1-paragraph recommendations + Linear action.
🟢 Polish findings get 1-sentence recommendations.

### F1 — Map above the fold (Launch-blocker, S effort)

**Recommendation.** Move `<HomepageMiniMap>` from `page.js:113` (between `<HolidayBanner>` and `<HomeCategoryGrid>`) to between `<HomeHero>` and `<FridayDeliveryStrip>` (new section #2). Keep MEH-538's existing component — don't redesign, don't replace with full map. The map's own internal `<header>` (*"כל בית עסק על המפה"* / *"גלי בתי עסק לפי מיקום"*) already does the labeling work. The category grid moves down one slot. LocationBanner + HolidayBanner remain below the map but above categories.

**Mockup:** [`mockups/F1-map-above-fold.txt`](./mockups/F1-map-above-fold.txt)

**Trade-offs.** *Gain:* the *"קרוב אלייך"* promise is visible in 2 seconds. The map IS discovery primary instead of section preview. Visitors immediately see the producer-distribution shape of Israel without scroll. *Lose:* LCP risk (Leaflet bundle ~140KB + ~20 markers' image data) — addressed in [Section 5.1](#51--performance). Hero photo loses some visual breathing room — acceptable because the magazine thesis is about story, not photography density.

**Why not full-map hero (LRQDO/Airbnb pattern)?** Sapir decision Q2 locked: keep mini-map, fix positioning. Purist replacement was considered, rejected — mini-map preserves the magazine hero's editorial quality (subtitle quote + scroll-down chevron) while elevating spatial discovery. Hybrid > purist for the launch context.

**Citation.** Sub 1 §1.1.4, §1.2.1; Sub 2 Pattern 2, §4.8 #1; LRQDO screenshot (`lrqdo-desktop.png`) for the principle.

**Effort.** S — single-file edit (`page.js` section reorder + the same `<HomepageMiniMap>` import). MEH-538's lazy-load logic needs a re-think (Section 5.1).

**Linear action.** NEW MEH — *"Move HomepageMiniMap above the fold + adjust lazy-load strategy."* Description should reference this finding and Section 5.1 perf plan.

---

### F2 — CTA "דירקטורי" reframe (Launch-blocker, S effort)

**Recommendation.** Replace `home.cta.body` in `frontend/messages/he.json`. The current line *"אם את בעלת עסק, חקלאית או מגדלת — הצטרפו לדירקטורי הראשון בישראל לאוכל אמיתי."* defects from the magazine thesis at the most visible CTA on the homepage. Three magazine/community-tier alternatives proposed ([Section 5.2](#52--hebrew-copy-directions-3)).

**Mockup:** [`mockups/F2-cta-reframe.txt`](./mockups/F2-cta-reframe.txt)

**Trade-offs.** *Gain:* CTA aligns with thesis; first-time visitors leave the homepage with the magazine impression intact. *Lose:* The word "דירקטורי" carried an implicit "first/biggest" claim; removing it removes that scale signal. Mitigation: scale signal lives on the stats counter (F4 reframed), not the CTA.

**Citation.** Sub 1 §3.2 C1, §3.3 Q7; Sub 2 §4.8 #3, Anti-pattern 1.

**Effort.** S — single string in `messages/he.json` + the same in `en.json` if i18n is wired (per Sub 1 i18n migration note — only `he.json` if not).

**Linear action.** NEW MEH — *"CTA copy reframe — `home.cta.body` magazine voice."* Can bundle with F3 in a single copy-PR.

---

### F3 — Categories subhead reframe (Launch-blocker, S effort)

**Recommendation.** Replace `categories.subheading` in `messages/he.json`. The current *"ישר מבית העסק — בלי מתווכים"* is the saturated formula (5/7 Israeli competitors). Pick something only mehamakor can say. Three alternatives proposed ([Section 5.2](#52--hebrew-copy-directions-3)).

**Mockup:** [`mockups/F3-categories-subhead.txt`](./mockups/F3-categories-subhead.txt)

**Trade-offs.** *Gain:* the categories grid stops sounding like every other Israeli farm site. *Lose:* the anti-middleman framing (which works — Pattern 4 in Sub 2) leaves the categories subhead. Mitigation: anti-middleman framing can live on the `/about` values strip where it's already partially present (*"שקיפות"* + *"קרבה"* values).

**Citation.** Sub 1 §3.2 C4; Sub 2 Anti-pattern 1 (5/7 saturation), Pattern 4 (farmdirect's `"ללא פערי תיווך"`).

**Effort.** S — single string change; can bundle with F2.

**Linear action.** NEW MEH — *"Categories subhead reframe — `categories.subheading` magazine voice."* Bundle with F2.

---

### F4 — Stats counter copy reframe (🔴 Critical, NOT launch-blocker, S effort)

**Recommendation.** Keep the counter slot (MEH-521 stays — Sapir decision Q1 locked). Reframe the copy from marketplace-tier to magazine-tier voice. Current line: *"{N} בתי עסק מאומתים · {M} קטגוריות · מכל רחבי הארץ"*. Three magazine-tier reframes proposed ([Section 5.2](#52--hebrew-copy-directions-3)) — the strongest uses month/issue framing (*"גליון מאי — {N} בתי עסק"*), which doubles as a discoverable update signal (the counter changes when a new business joins — visitor sees the magazine refreshes monthly).

**Purist option considered, rejected.** A purist read of "magazine, not marketplace" would remove the counter entirely — magazines (Kinfolk, Cereal, Apartamento per Sub 4 deferral) don't lead with metric strips. **Rejected** because: (a) the counter is a valuable trust signal in the early-launch context where producer count is small but real (12 producers now > "we have farms!" abstract claim), (b) the threshold-based fallback (MEH-521) already handles the <5 case gracefully, (c) removal would re-orphan the slot and re-introduce the broken-claim risk MEH-521 was opened to fix.

**Mockup:** [`mockups/F4-counter-reframe.txt`](./mockups/F4-counter-reframe.txt)

**Trade-offs.** *Gain:* counter reads as editorial cadence ("גליון מאי" implies a future "גליון יוני") not as scale theater. *Lose:* numbers feel less like marketing — but mehamakor doesn't want to feel like marketing.

**Citation.** Sub 1 §3.2 C2; Sub 2 Pattern 1 (hard-number works as social proof — keep the pattern, change the voice).

**Effort.** S — `messages/he.json` string changes + bundle with F10 skeleton fix.

**Linear action.** NEW MEH (fast-follow week 1) — *"Stats counter magazine reframe + skeleton."* Bundles F4 + F10.

---

### Recommendations for 🟡 Important findings (1 paragraph each)

**F5 — "מומלצים" vs "directory" inconsistency.** Verify resolution after F2 ships. If the CTA no longer says "דירקטורי" and the producers heading still says "בתי עסק מומלצים", the contradiction collapses — both then sit in the magazine family. If the inconsistency persists, open a follow-up MEH to align the producers heading (`producers.heading`) with the new CTA voice. **Linear action:** verify-after-F2 (no separate MEH unless needed).

**F6 — HIW step 3 reframe.** *"אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות"* leads with two negatives ("בלי X, בלי Y"). A magazine-tier rewrite describes the outcome positively. Candidate: *"האוכל מגיע אלייך טרי כי הוא בא ישר מהשדה — וכל בית עסק כאן עומד מאחורי מה שהיא מגדלת."* **Linear action:** NEW MEH — bundle with F2/F3 if PR window allows, otherwise fast-follow week 2.

**F7 — Founder amplification on homepage.** Add a single-line founder strip between `<HolidayBanner>` (section 6) and `<HomepageMiniMap>` (the new section #2 after F1). One thumbnail of Sapir + one sentence (cite MEH-527's existing /about credibility line). Magazines name their editor; the homepage equivalent is naming the founder where conversion happens, not only where curiosity drives a visit to /about. **Linear action:** NEW MEH — post-launch (Q3 2026) per Sapir Section 1 (priority 4-impact 3-effort means valuable but not blocking).

**F8 — Producer stories carousel (MEH-542 exists).** Update MEH-542's priority from Medium to High and append Sub 2 evidence to its description (Pattern 3 producer-as-protagonist + Sub 2 §4.8 #3 no Israeli editorial layer). Stays post-launch — content depth needs producer interview pass first. **Linear action:** UPDATE MEH-542 with Sub 2 citations + priority bump.

**F9 — Trust ladder / process page (MEH-534 exists).** Update MEH-534's priority from Medium to High and append Sub 2 evidence (§4.8 #3 + OFN transparency framing). Post-launch. **Linear action:** UPDATE MEH-534 with Sub 2 citations + priority bump.

**F10 — Stats counter skeleton.** Add a 1-line skeleton placeholder to the stats counter slot (`page.js:69-90`) so the loading→render transition doesn't shift the rest of the page. Bundle with F4 in the same MEH. **Linear action:** bundled with F4.

**F11 — Step 2 subhead lie.** Change *"3 שדות בלבד"* to a count that matches the actual field count (probably *"כמה שדות בלבד"* — count-free is more durable). 1-line edit. **Linear action:** NEW MEH (small) — fast-follow week 1.

**F12 — Cross-surface filter persistence.** Implement shared filter-chip state via the existing `?chips=` URL param pattern (already used by `/producers` per Sub 1 §1.4) and propagate to `/map` and the homepage. Out of launch scope — power-user feature. **Linear action:** NEW MEH post-launch (Q4 2026).

### Recommendations for 🟢 Polish findings (1 sentence each)

**F13 — `MiniMap` name collision.** Rename `frontend/components/MiniMap.jsx` to `ProducerLocationMap.jsx` post-launch to remove naming confusion with `HomepageMiniMap.jsx`. **Linear action:** NEW MEH post-launch (Q4 2026).

**F14 — Two pagination models on `/producers`.** Pick one (probably SSR `?page=N` for SEO consistency) and remove the client infinite-scroll append path. Post-launch. **Linear action:** NEW MEH post-launch (Q4 2026).

---

## Section 5 — Performance + Hebrew + RTL + "What we won't do"

### 5.1 — Performance

Moving the mini-map above the fold (F1) trades discovery prominence for a measurable LCP risk. The MEH-538 design lazy-loads Leaflet only when the user scrolls within 200px of the map section (`HomepageMiniMap.jsx:rootMargin: "200px"`). Above-the-fold placement makes lazy-load less meaningful — the map is essentially always in viewport on first paint, so the IntersectionObserver fires immediately.

**Recommended budget changes for F1 PR:**

- **Skeleton placeholder** in the new section #2 slot (same dimensions as the rendered map) — prevents CLS while Leaflet bundle loads.
- **Defer Leaflet bundle by ~200ms after FCP** — use `requestIdleCallback` (fall back to `setTimeout(200)` for Safari) instead of immediate lazy-load on intersect. This pushes Leaflet out of the LCP measurement window without making the user wait.
- **Pre-connect to the tile server** in the `<head>` of `app/[locale]/page.js`: `<link rel="preconnect" href="https://tile.openstreetmap.org" />` — saves ~100-200ms on the first tile request.
- **Limit initial marker render to ≤20 producers** in the mini-map (current code already does — `HomepageMiniMap.jsx`); confirm the limit is still 20 after the move.
- **Lighthouse target:** maintain Performance ≥85 on mobile (Sub 1 noted Lighthouse baseline deferred to Smadar — see [`docs/audits/2026-05-lighthouse-baseline.md`](../audits/2026-05-lighthouse-baseline.md) for the capture command).

The other findings (F2-F4) are copy-only and have **zero performance impact**.

### 5.2 — Hebrew copy directions (3)

All three follow CLAUDE.md voice rules: **feminine**, no *"יצרן/ית"* (use *"בית עסק"* / *"בעלת עסק"*), no marketing speak, Sapir voice. Multiple options per finding so Sapir can pick.

#### F2 — CTA reframe (3 options, ranked by Sapir-fit)

**Current:** *"אם את בעלת עסק, חקלאית או מגדלת — הצטרפו לדירקטורי הראשון בישראל לאוכל אמיתי."*

**Option A (recommended) — community-tier:**
> *"אם את בעלת עסק, חקלאית או מגדלת — מקומך כאן. מהמקור הוא הבית של בתי העסק הקטנים בישראל."*

**Option B — magazine-tier:**
> *"אם את בעלת עסק, חקלאית או מגדלת — נשמח לספר את הסיפור שלך. מהמקור הוא מגזין לאוכל אמיתי שמכוון את הקוראות לבתי העסק שמאחוריו."*

**Option C — most direct, least poetic:**
> *"אם את בעלת עסק, חקלאית או מגדלת — בואי. אנחנו מאמינות שכל בית עסק קטן בישראל ראוי לחנות משלו ולסיפור משלו."*

#### F3 — Categories subhead reframe (3 options)

**Current:** *"גלו לפי קטגוריה"* (heading, fine) + *"ישר מבית העסק — בלי מתווכים"* (subhead — the problem).

**Option A (recommended):**
> *"כל קטגוריה — בית עסק אחר, סיפור אחר."*

**Option B:**
> *"מה מחפשת? המתכון מתחיל מהקטגוריה."*

**Option C — values-first (gan-hasade.com-inspired):**
> *"קטגוריות שמספרות איך בית עסק אמיתי נראה בישראל היום."*

#### F4 — Stats counter reframe (3 options)

**Current:** *"{N} בתי עסק מאומתים · {M} קטגוריות · מכל רחבי הארץ"*

**Option A (recommended) — issue framing:**
> *"גליון מאי — {N} בתי עסק · {M} קטגוריות · מכל רחבי הארץ"*

**Option B — narrative framing:**
> *"{N} בתי עסק שהצטרפו עד היום · {M} קטגוריות · מכל רחבי הארץ"*

**Option C — minimal, magazine-cold:**
> *"{N} בתי עסק · {M} קטגוריות · ישראל"*

Option A makes the counter into an editorial-cadence signal: the visitor reads "גליון מאי" and intuits there's a גליון יוני coming. This is cheap to maintain (no actual issue infrastructure needed — the month string updates by date) and earns the counter slot's existence in a way pure scale ("מאומתים") doesn't.

### 5.3 — RTL considerations (3 patterns)

1. **Mini-map above the fold + RTL.** Leaflet uses physical positioning for its zoom controls (top-right by default). After F1's move, those controls should remain top-right in RTL because they're spatial, not directional. Sub 1 §1.2 confirms MEH-538's mini-map already handles this correctly (`HomepageMiniMap.jsx` doesn't override Leaflet defaults). **No change needed** — flag for Smadar's RTL QA.

2. **Founder strip (F7) RTL layout.** When F7 ships post-launch, the founder thumbnail should sit on the **right** in RTL (visual flow: face → name → quote, reading right-to-left). Use logical properties (`ms-`/`me-` per CLAUDE.md hebrew-tailwind-preset rule), not `ml-`/`mr-`. **Rule:** no physical positional classes in the new component.

3. **Counter copy length variance.** Option A *"גליון מאי — {N} בתי עסק · {M} קטגוריות · מכל רחבי הארץ"* is ~12 characters longer than the current copy. On 375px mobile, the strip may wrap to two lines. Acceptable if it wraps cleanly (one logical phrase per line), unacceptable if a single word orphans. **Rule:** keep month name + counter on line 1, categories + "מכל רחבי הארץ" on line 2 if wrap happens.

### 5.4 — Mobile-first vs desktop-parity decisions

mehamakor is mobile-first by traffic and brand — all recommendations above should ship on mobile first and confirm desktop doesn't regress. The mini-map (F1) has the steepest mobile-vs-desktop divergence: on mobile the map is the full width of the viewport (375px); on desktop it's contained inside the homepage column (~1024px). Both behaviors are correct; the move above the fold doesn't change the existing responsive sizing.

### 5.5 — What we won't do (deferred items, explicit)

This list is as important as the action list. Recording it here so the synthesis is honest about scope.

1. **Replace the mini-map with a full interactive map** — Sapir decision Q2 locked. Hybrid > purist.
2. **Remove the stats counter** — Sapir decision Q1 locked. Hybrid > purist; counter stays, copy changes.
3. **Issue/Volume eyebrow device (Sub 1 H1)** — deferred per Sapir decision Q3. Hypothesis not validated by Sub 2 (study didn't cover magazine peers). Sub 4 opens NEW MEH for "Magazine peer research — Kinfolk, Cereal, Apartamento" (1-2 hours WebSearch + screenshots) to validate or reject H1 before implementation.
4. **Refactor `/about` (MEH-135)** — pre-existing backlog item, not in this synthesis scope. The MEH-527 founder credibility content stays untouched.
5. **Logo redesign (MEH-123, MEH-451)** — blocks design sessions for MEH-76 / MEH-122 but not in discovery-redesign scope.
6. **Producer detail page redesign (MEH-76)** — separate work, not in this scope. F1-F4 are homepage-only.
7. **`/map` page changes** — the full map route stays as-is. Only the homepage mini-map moves.
8. **New research** — synthesis uses Sub 1 + Sub 2 only. No re-investigation.
9. **Final visual mockups** — ASCII directions only. Real designs come from Sub 4 → design session output.
10. **Linear mutations from this PR** — Sub 4 territory. This synthesis names Linear actions; it doesn't execute them.

---

## Verification (per spec)

- [x] **5 sections complete** — Executive summary / Findings / Priority matrix / Recommendations / Performance+Hebrew+RTL+won't-do.
- [x] **14 findings total** (target ≥10).
- [x] **4 🔴 Critical** (within 3-5 band).
- [x] **3 launch-blockers** (within ≤5 ceiling): F1 map, F2 CTA, F3 categories subhead.
- [x] **7 ASCII mockup directions** in [`mockups/`](./mockups/) (target ≥5): F1, F2, F3, F4, F7, F8, F9.
- [x] **3 Hebrew copy directions** ready for use (target ≥3): F2 CTA, F3 categories, F4 counter — each with 3 options.
- [x] **All claims cited** — Sub 1 / Sub 2 / external (no orphan assertions).
- [x] **"What we won't do" section** explicit (Section 5.5, 10 items).
- [x] **Sapir voice** — warm, direct, no marketing speak (Section 5.2 options reviewed against CLAUDE.md voice rules).
- [x] **HANDOFF.md updated** with synthesis pointer (separate change, see PR).

---

## How Sub 4 uses this document

Sub 4 (Linear cleanup) executes on the **Linear action** column of Section 3 + the per-finding Linear actions in Section 4. The mapping is:

| Linear action type | Count | Notes |
|---|---|---|
| NEW MEH (launch-blocker) | 3 | F1, F2+F3 bundle, MEH for F2+F3 can be one or two |
| NEW MEH (fast-follow) | 3 | F4+F10 bundle, F11, F6 |
| NEW MEH (post-launch Q3 2026) | 1 | F7 |
| UPDATE existing MEH | 2 | MEH-542 (F8), MEH-534 (F9) |
| NEW MEH (post-launch Q4 2026) | 3 | F12, F13, F14 |
| NEW MEH (deferred — magazine peer research) | 1 | H1 eyebrow validation per Section 5.5 #3 |
| **Total Linear actions** | **13** | |

Sub 4's MEH-597 (or equivalent) should not exceed 13 issues — synthesis is prioritization, not expansion.
