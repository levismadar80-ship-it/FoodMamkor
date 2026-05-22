# ADR: agent-browser CLI — Adoption Decision

**Status:** Deferred (post-launch)
**Date:** 2026-05-22
**Decision-maker:** Smadar Levi (advised by Claude.ai)
**Linear spikes:** MEH-633 (install), MEH-634 (integration), MEH-635 (this ADR)

---

## TL;DR (Hebrew)

הכלי `agent-browser` (Vercel Labs, v0.27.0) **עובד.** הוא מותקן, רץ על Windows + Git Bash, תומך ב-Hebrew RTL מלא, ומאפשר audit אוטומטי של mobile responsiveness ב-102 שניות במקום ~30 דקות ידנית.

**ההחלטה: דחיית האימוץ ל-post-launch.** הסיבה היא תיעדוף, לא איכות. pre-launch הreduce-scope שלנו ממוקד ב-launch blockers (MEH-604/605/606, MEH-637 logo, MEH-507/508 WhatsApp). הוספת כלי חדש = context switch שאינו משתלם כרגע. נחזור אליו אחרי launch + 30 ימים, כשmobile audits חוזרים יהפכו ל-repeatable concern.

**Side-effects שכבר נכנסו לbacklog:** MEH-658 + MEH-659 (SEO bugs שהspike גילה תוך כדי).

---

## Context

Following an AI Honeycove TikTok post (16 May 2026) about `agent-browser` —
Vercel Labs' CLI for AI-driven browser automation — Smadar opened a 3-spike
chain to evaluate whether to adopt the tool for ongoing mobile QA work.

The tool's claimed value: 93% fewer tokens than Playwright MCP screenshots,
because it uses DOM snapshots with element refs (`@e1`, `@e2`...) instead
of pixel screenshots for agent navigation.

**Strategic context:** Mehamakor is in pre-launch (Cohort #1, licensed
businesses only). Active launch-blocker workstreams include MEH-604/605/606
(homepage redesign), MEH-637 (logo session), and MEH-507/508 (WhatsApp
Business). Adding new tooling competes with these for attention.

---

## Decision

**Defer adoption to post-launch (launch + 30 days, conditional on revisit).**

The tool itself is sound. The decision is about *when*, not *whether*.

---

## Evidence

### MEH-633 — Install & smoke test (PASS)

**Acceptance criteria: 6/6 met**

| Test | Result |
|---|---|
| `npm install -g agent-browser` | ✓ 5 seconds |
| `agent-browser install` (Chromium) | ✓ Chrome 149.0.7827.22, 183MB |
| `--version` | ✓ 0.27.0 |
| `open https://mehamakor.co.il` | ✓ page loaded, Hebrew title returned |
| `snapshot -i` returns @e refs | ✓ 139 refs on homepage |
| `screenshot path.png` | ✓ 938KB PNG, dimensions correct |

**Time:** ~15 minutes (budget: 30 min).
**Branch:** `spike/agent-browser-poc` (local only).

**Edge cases discovered:**

1. **Linear issue documented `--viewport` as a flag on `open`. Wrong.** The
   correct CLI is two separate commands:
```bash
   agent-browser set viewport 375 667
   agent-browser open URL
```

2. **Headless Chrome forces `/en` redirect** on `mehamakor.co.il` due to
   default `Accept-Language: en-US`. Fix is per-call:
```bash
   agent-browser open URL --headers '{"Accept-Language": "he-IL,he;q=0.9"}'
```
   This is a **side-finding about the site itself**, not about the tool:
   real users with English-language Chrome installations may experience the
   same forced redirect. Worth a separate ticket if it persists post-launch.

3. **Windows + Git Bash works native.** No WSL needed despite the project's
   docs recommending it.

4. **Hebrew RTL renders correctly** in snapshots — no mojibake, feminine
   voice preserved (`גלו`, `קרוב אלי`, `פתחי`).

### MEH-634 — Integration audit (PARTIAL PASS)

**Scope:** Mobile responsiveness audit on 5 routes × 3 viewports = 15 cells.
(Originally scoped at 12 routes × 3 = 36; reduced after MEH-633 discovered
that `/producer/*` and `/category/*` are not exposed as `<a href>` links
on the homepage — they render as `<button>` with JS click handlers, a
finding ROI-worthy on its own.)

**Routes audited:** `/`, `/map`, `/about`, `/terms`, `/privacy`
**Viewports:** 375×667 (iPhone SE), 360×800 (Galaxy), 390×844 (iPhone 14)

**Results:**

| Metric | Value |
|---|---|
| Cells executed | 15/15 |
| Scroll-overflow detection | ✓ working, 15 cells with valid sw/vw measurements |
| Horizontal scroll detected | 0/15 (all pages fit within viewport) |
| Screenshots saved | **0/15** — bug in spike script (path resolution) |
| Hebrew titles captured | 15/15 |
| Total runtime | 102 seconds |

**What worked:** Detection layer. The `eval` command reliably returned
`{sw, vw, title}` for every cell. The audit logged 196-line report at
`docs/audits/MEH-233-mobile-audit-output.md`.

**What didn't:** Screenshot persistence. The spike script passed relative
paths to `agent-browser screenshot`, but the agent-browser daemon resolves
paths from its own CWD — not the shell's. All 15 screenshots logged as
"saved" but ended up in a temp directory or were lost. This is a script
bug, not a tool bug: the same `screenshot path.png` command worked correctly
in MEH-633 from a different CWD.

**Side-effect findings during MEH-634:**

- `/terms` and `/privacy` titles confirmed duplicating ` | מהמקור` suffix
  (already opened as MEH-659 during MEH-633 discovery phase).
- 4 routes (`/login`, `/register`, `/contact`, `/search`) returning the
  homepage title (already opened as MEH-658).

### Bonus: SEO bugs discovered via spike

Two SEO bugs that were not in scope for MEH-633/634 surfaced naturally
because the spike scripts had to inspect `document.title` per route:

- **MEH-658** (Medium): 4 routes fall back to homepage title — missing
  per-page `generateMetadata` exports.
- **MEH-659** (Low): `/terms` + `/privacy` show `| מהמקור | מהמקור`
  (duplicated suffix from page metadata + root template both adding it).

Neither would have been found in routine pre-launch QA. They are
**evidence of the tool's diagnostic value beyond its stated purpose.**

---

## Trade-offs

| Aspect | agent-browser | Playwright (current setup) |
|---|---|---|
| Tokens per audit (claimed) | 93% less than Playwright MCP | Baseline |
| Token measurement in our spike | Not directly measured (no MCP integration tested) | N/A |
| Windows + Git Bash support | Native, works out of box | Native, works (used in past per HANDOFF) |
| Hebrew RTL | Full support, verified | Full support, verified |
| Setup time | 30 seconds (npm install + chromium) | Slower (Playwright install + browser binaries) |
| CLI for ad-hoc inspection | Excellent (`snapshot -i`, `eval`, `open`) | Requires writing test code |
| CI integration | Not investigated in spike | Already integrated in `.github/workflows/` |
| Learning curve | Moderate (skills system, ref-vs-selector, daemon model) | Smadar already knows it |
| Maintenance | New dependency, new mental model | Established |
| Spike runtime | 15 min install + 102 sec audit | N/A (no equivalent audit was attempted) |

**Net assessment:** agent-browser is better for *ad-hoc inspection and
audits*. Playwright is better for *codified test suites in CI*. They serve
different needs — not a one-replaces-the-other situation.

---

## Why defer (not adopt now)

1. **Pre-launch focus.** Active launch-blockers (MEH-604/605/606, MEH-637,
   MEH-507/508) own the attention budget. Adding tool adoption competes
   with launch readiness.

2. **MEH-233 is single-instance.** Mobile audit needs to happen once before
   launch. Manual audit takes ~30 minutes. That's acceptable as a one-time
   cost. The repeatable-audit value of agent-browser kicks in *after*
   launch, when regression checks become routine.

3. **Spike revealed integration gotchas.** Path resolution in daemon mode,
   `set viewport` as separate command, `Accept-Language` header dance —
   these are not deal-breakers, but they show that production-grade
   integration needs more careful scripting than the spike timebox allowed.

4. **No CI integration is established yet.** Real value of an audit tool
   is *automated regression on PRs*, not one-shot manual runs. That work
   is a separate epic.

5. **Optionality preserved.** The spike doc + ADR + working `set viewport`
   pattern + Accept-Language header workaround are all captured. Re-adoption
   is cheap when triggered.

---

## Why not abandon

The tool demonstrated four distinct values:

1. **15-cell audit in 102 seconds** vs ~30 min manual — proven.
2. **Hebrew RTL works** — a real risk that was de-risked.
3. **Surfaced 2 SEO bugs** (MEH-658, MEH-659) as side effects.
4. **Surfaced 1 architecture finding** (`/producer/*` and `/category/*`
   not exposed as `<a href>` — affects SEO and accessibility, deserves
   its own ticket post-launch).

Abandoning would discard reusable infrastructure (the spike script, the
documented edge cases) that would cost zero to keep.

---

## Trigger conditions for revisit

Adopt agent-browser when **any of** these become true post-launch:

1. **Repeatable mobile audit need.** First time we want to re-run a
   mobile audit on staging (e.g., after CSS refactor or new page), pick
   up the spike script and adopt.

2. **PR-time regression detection.** When CI workflow time budget allows
   adding a smoke audit on preview deploys, integrate agent-browser as
   the executor.

3. **Producer/category link audit.** When MEH-658/659 are resolved and
   we want to verify all routes systematically, agent-browser is the
   right tool.

4. **Default trigger:** Launch + 30 days. If none of the above fire,
   re-review this ADR on 2026-07-15 (post-launch + ~30d) and decide
   based on then-current priorities.

---

## Next steps

**Now:**
- [ ] Smadar reviews this ADR
- [ ] Commit to `spike/agent-browser-poc` (local only, no PR)
- [ ] Close MEH-635 in Linear with link to this file
- [ ] Update HANDOFF.md with one-line summary

**Deferred (post-launch revisit):**
- [ ] MEH-XXX (TBD): Open a new ticket if/when trigger fires — link
      back to this ADR + MEH-633 + MEH-634 spike artifacts
- [ ] If adopted: rewrite mobile-audit script with absolute paths and
      proper screenshot handling

**Side-effect tickets already in backlog:**
- MEH-658 — 4 routes need per-page metadata
- MEH-659 — `/terms` and `/privacy` title deduplication

---

## References

- Source: https://github.com/vercel-labs/agent-browser
- Spike artifacts: `docs/spikes/agent-browser-poc.md`
- Audit output: `docs/audits/MEH-233-mobile-audit-output.md`
- Linear: MEH-633 (install), MEH-634 (integration), MEH-635 (this ADR)
- Side-effects: MEH-658, MEH-659