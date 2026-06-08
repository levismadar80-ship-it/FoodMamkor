# MEH-688 — he.json emoji LOCK v2: current-state inventory + sweep determination

**Date:** 2026-06-06 · **Status:** Discovery complete — **autonomous sweep BLOCKED** (see §4)
**Branch:** `feature/meh-688-hejson-emoji-lock` · **Tier:** 🔴 RED (he.json = central component)
**Method:** `rg '\p{Extended_Pictographic}'` over the *current* `frontend/messages/he.json`
(post-MEH-657), classified against MEH-657's locked category boundary.

---

## TL;DR

MEH-688 was filed **2026-05-24** on evidence captured *before* its parent rule was
executed. The parent, **MEH-657 (LOCK v2)**, has since **shipped** (Done 2026-06-06,
PR #818): it swept Categories **A+B+D4+E** (94 instances) and **deliberately deferred
the rest to dedicated tickets**. Every emoji still present in `he.json` today maps to a
**deferred / gated** category. **There is no un-gated, unambiguous, lossless strip left
to perform autonomously.** This doc is the up-to-date Discovery artifact (advances
MEH-688 Phase 1); the Phase 4 sweep cannot run tonight without Sapir's per-emoji
classification and the deferred tickets landing. **No change is made to `he.json` in
this PR**, and it does **not** close MEH-688.

> The MEH-688 line numbers (399, 640, 938, …) are **stale** — they reference the
> pre-MEH-657 file. After MEH-657 + MEH-684, the B-category markers (🗺️ nav, 📧 verify
> banner, ❤️⭐🏠 login values, ✨ home headings, 📅 events) are gone — `rg -c '🗺️|📧|✨'
> → 0` — confirming PR #818 is in current `staging`.

---

## 1. Method & counts

```
rg -c '\p{Extended_Pictographic}' frontend/messages/he.json   → 65 (lines)
rg -c '\p{Extended_Pictographic}' frontend/messages/en.json   → 65 (lines)   # 1:1 mirror
```

ripgrep's Rust regex supports `\p{Extended_Pictographic}` (validated). Note: arrows
(← → ↑ ↓) are **not** Extended_Pictographic and are **not** matched — consistent with
MEH-688's worry being broader than the property actually catches.

---

## 2. MEH-657 locked category boundary (the rule being "enforced")

MEH-657 (narrowed) processed **A + B + D4 + E** and **explicitly deferred** the
remainder. This is the authoritative boundary — not "UI surfaces = 0 emojis" read
maximally:

| Cat | What | MEH-657 decision | Ticket |
|---|---|---|---|
| A — decorative | strip + whitespace | ✅ done (48) | MEH-657 |
| B — semantic | → Phosphor inline JSX | ✅ done (18) | MEH-657 |
| **C — category/diet tags** | hand-drawn glyphs | **DEFER — keep emoji until replacement** | **MEH-683** (post-MEH-666) |
| **D1 — WhatsApp/outbound plaintext** | keep | **KEEP per LOCK v2 outbound exception** | — (no MEH) |
| **D2 — toast strings** | keep until refactor | **DEFER** | **MEH-685** |
| D3 — ICU plural | strip | ✅ done | MEH-684 (PR #925) |
| D4 — guide markdown ✅/❌ | rewrite to כן:/לא: | ✅ done (26) | MEH-657 |
| E — brand guidance copy | rewrite | ✅ done (2) | MEH-657 |

MEH-657 **Decision #7** additionally flagged the A/C-boundary emojis
(🎉 🤖 💪 🌟 ✋) as **"Sapir spot-check required"** — i.e. even some "decorative"
calls are human-gated.

---

## 3. Current-state classified inventory (all 65 lines)

### 3a. Category C — food/diet category & badge tags → **MEH-683** (KEEP, hand-drawn pending)
| he.json line | key | emoji |
|---|---|---|
| 408–413 | `tag_unprocessed/pasture/organic/sourdough/extra_virgin/fresh_real` | 🌿 🥩 🧀 🍞 🫒 🌱 |
| 414–415 | `tag_verified`, `tag_local` | ✅ 📍 |
| 954–955 | `organic`, `kosher` | 🌿 ✡️ |
| 3509–3511 | `diet_gluten_free/vegan/lactose_free` | 🌾 🥦 🥛 |

✡️ kosher is additionally a **compliance signal** (MEH-688 Category C "DEBATE").

### 3b. Category D1 — outbound WhatsApp / share / referral / Instagram → **KEEP** (LOCK v2 outbound exception)
| line | key | emoji |
|---|---|---|
| 308 | `share_msg` | 🌿 |
| 626 | `referral_msg` | 🌿 |
| 795 | `share_text` (group-buy) | 🌿 |
| 1467 | `warm_body` (WhatsApp invite) | 🌿 |
| 1471 | `short_body` (WhatsApp invite) | 💚 |
| 2516 | `wa_message_with_meta` | 🌿 |
| 2564 | `caption_prefix` (Instagram) | 🌿 |

### 3c. Category D2 — toasts / confirmations → **MEH-685** (KEEP until API refactor)
| line | key | emoji |
|---|---|---|
| 774 / 788 / 807 | group-buy `fulfilled` / `committed_confirm` / `fulfilled` | ✅ |
| 1925 | `just_submitted` | ✅ … 🌿 |
| 2103 | `success_toast` | 🌿 |
| 2159 | cookie banner `message` | 🍪 |
| 2393 | `notify_success` | 🎉 (A/C-boundary per Decision #7) |
| 2571 / 3184 | `copied` | ✅ |

### 3d. Functional indicators → **ADR-021 candidate** (Sapir-gated, MEH-688 Category C "DEBATE")
| line | key | emoji | why gated |
|---|---|---|---|
| 850–852 | `available_today/busy_week/on_vacation` | 🟢 🟠 ⏸ | availability dots — non-color encoding (WCAG-positive; stripping may *reduce* a11y) |
| 1288–1290 | `avail_today/avail_full/avail_vacation` | 🟢 🟠 ⏸ | same (dashboard) |
| 3235–3237 | `available_today/full_this_week/on_vacation` | 🟢 🟠 ⏸ | same |
| 617 / 618 | `slow_response` / `vacation` | ⏳ 🌙 | status badges |
| 2212 / 3198 | `near_expiry` / rejected `title` | ⚠️ | warning/error indicators |

### 3e. Semantic action/field labels → **Phosphor-B class** (component work, NOT a value-only strip)
| line | key | emoji | Phosphor-ish |
|---|---|---|---|
| 1122 / 1123 | `export` / `import_excel` | 📤 📥 | Export/Import |
| 1179 | `story_card` | 📸 | Camera |
| 1269 | `has_physical_location` | 🏪 | Storefront |
| 1270 / 1275 | `offers_delivery` / `has_delivery` | 🚚 | Truck |
| 1276 | `pickup_points` | 📦 | Package |
| 1325 | `unblock` | 🚫 | Prohibit |
| 1531 | `suspend` | ⏸️ | Pause |
| 1541 | `remove` | ❌ | X |
| 2441–2443 | `section_producers/categories/cities` | 🏪 🏷️ 📍 | search headers |
| 2502 | `trigger` (report) | 🚩 | Flag |
| 3183 | `label` (my link) | 🔗 | Link |
| 655–656 | producer-card `delivery_only` / `available_today` | 🚚 🛒 | the original MEH-688 symptom |

### 3f. Badge/award glyphs → A/C-boundary (MEH-657 Decision #7 → Sapir spot-check)
| line | key | emoji |
|---|---|---|
| 1176 / 1258 / 3308 | `ambassador_active` / `recommended` / `label_perfect` | ⭐ |
| 2239 / 2243 / 2247 | trust `label`s (verified / community-leader / ambassador) | ✅ ⭐ 🏅 |

---

## 4. Determination — why the sweep is BLOCKED for autonomous execution

Every remaining emoji falls into a category that is **either deferred to a dedicated
ticket, kept by an explicit LOCK v2 exception, or gated on a human/ADR decision**:

1. **No pure Category-A decorative strip remains.** MEH-657 already removed those 48.
   A line-by-line pass (§3) finds nothing that is simultaneously (a) not C/D1/D2,
   (b) not a functional indicator, (c) not a semantic Phosphor-B icon, and
   (d) not A/C-boundary-flagged.
2. **A unilateral "delete" would contradict the locked MEH-657 methodology**, which
   *replaces* semantic emoji with Phosphor icons (component work) rather than stripping
   the value. Stripping 🚚/📦/🏪/🔗 etc. from values would diverge from the parent rule.
3. **Functional indicators (🟢🟠⏸, ✡️, ⚠️) are ADR-021 territory.** MEH-688's own
   description marks these "DEBATE needed"; stripping availability dots can *reduce*
   accessibility (non-color encoding). This needs Sapir + possible ADR.
4. **Deferred categories have owners** — C→MEH-683, D2→MEH-685, D1=KEEP. Touching them
   here would duplicate/clash with those tickets (conflict-guard violation).
5. **Closing MEH-688 now would repeat the MEH-692 bug class** — the epic's real work
   (Discovery ✅ here, but ADR + Sapir strategy lock + sweep) is not done. Hence this
   PR is **`Refs MEH-688`, not the auto-close keyword.**

This matches MEH-688's *own* phased plan (Phase 1 Discovery → Phase 2 ADR →
Phase 3 Sapir-locked strategy → Phase 4 sweep). Tonight delivers **Phase 1**.

---

## 5. Unblock path (for Sapir, morning)

1. **Decide the functional-indicator boundary** (🟢🟠⏸ availability, ✡️ kosher, ⚠️
   warnings): keep as non-color a11y encoding, or replace with text/Phosphor? → If
   non-trivial, draft **ADR-021** ("LOCK v2 boundary — functional indicators vs
   decorative emoji").
2. **Spot-check the A/C-boundary / badge glyphs** (⭐ 🏅 🎉 on lines 1176/1258/2239/
   2243/2247/2393/3308): delete vs Phosphor.
3. **Confirm the semantic labels (§3e) route to Phosphor-B** (component edits), not a
   value strip — and whether that's in MEH-688 or a sibling.
4. Then a scoped sweep PR (or chunk-by-chunk RED) can execute the locked table.
   C/D1/D2 stay owned by MEH-683 / KEEP / MEH-685.

---

## Definition of Done — status

- [x] Phase 1 Discovery: every current `he.json` emoji classified against MEH-657's boundary
- [x] Confirmed MEH-657 (A+B+D4+E) + MEH-684 (D3) already shipped to staging
- [x] Determination documented: no autonomous lossless sweep is available
- [ ] Phase 2 ADR-021 (Sapir) — **pending**
- [ ] Phase 3 strategy lock (Sapir) — **pending**
- [ ] Phase 4 sweep — **pending the above**

Refs MEH-688 (Phase 1 Discovery only — Phase 2–4 require Sapir decisions; this PR makes
no change to he.json and does not close the epic).
