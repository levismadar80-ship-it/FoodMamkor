# MEH-1511 — rule 23 amendment: automated self-QA substitutes for the human mobile-QA gate

**Staged for Sapir. CC cannot apply this** — the write to
`.claude/rules/workflow.md` is refused by the Claude Code **auto-mode
classifier**, not by repo policy.

**As of 2026-08-12.** Line numbers drift — match on content, not position.

---

## The block, reproduced — which is the result this card asked for

MEH-1511's own ruling of 09/08 said the 08/08 block *"was the harness's
auto-mode classifier, not repo policy — `.claude/rules/**` is not in
`permissions.deny`. Retry in a fresh session. If it recurs, STOP and raise a
one-line question for interactive approval; do not route around it."*

**It recurred.** Attempted 2026-08-12 in a fresh session, on a branch cut from
`origin/staging`, via `Edit` on `.claude/rules/workflow.md`:

```
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: Blocked by classifier.
```

Two things follow, and they point in opposite directions:

1. **The card's diagnosis is confirmed.** `.claude/settings.json`
   `permissions.deny` contains `settings.json` and `hooks/**` — **not**
   `.claude/rules/**`. The repo permits this edit. The harness does not.
2. **The remedy is unchanged and is Sapir's.** Stop condition (d) — *"if a
   permission classifier blocks the write, STOP and surface it; do not route the
   same change through a different tool"* — was honoured. No `Write`, no bash
   heredoc, no python. This document is not a workaround: staging a patch for a
   human to apply is the same sanctioned pattern this repo already uses for
   `.github/workflows/**` (`docs/ci/e2e-gate.patch.md`,
   `docs/ci/meh-1868-knip-ratchet.patch.md`), and it changes no rule by itself.

**Unblock, any one of:** standalone CC (Git Bash → `claude`) · an interactive
approval session · an auto-mode exception for `.claude/rules/**`.

---

## Where it goes

`.claude/rules/workflow.md`, **appended to rule 23**, after the line:

```
    Anti-pattern: `/goal` ends with "PR merged" + any human-confirmation
    condition. The conditions race, merge wins, QA is bypassed.
```

and before `24. **Scope-creep prevention for copy changes (MEH-579 lesson).**`

**Rule 23 is amended, not replaced.** Everything currently in it stays, including
the MEH-571 → MEH-579 citation — that incident is *why* the carve-outs exist, so
deleting it would remove the reasoning that justifies the exceptions.

---

## The text to insert (verbatim, 4-space indented to match the list)

    ### Amendment 2026-08-12 (MEH-1511) — an automated evidence bundle may substitute for the human mobile-QA pass

    **Everything above stays.** The MEH-571/579 incident is why the carve-outs
    below exist, and the race it describes is real: a mechanical auto-close will
    always beat a human confirmation step, so a `/goal` string must never make
    them compete. What changes is *who supplies the QA evidence*, not whether
    the QA happens.

    **Sapir's ruling, 08/08/2026, restated 10/08:** *"רק קלוד קוד בודק, אני לא
    עושה QA."* The 08/08 wording extends this to **all UI, including central
    components** — she reviews the evidence, not the phone.

    **The gates that remain hers are permissions, not quality:** workflow YAML,
    branch protection, Alembic apply, `staging → main`, and copy/brand rulings
    (rule 22). Do not read this amendment as touching any of those.

    #### The substitution checklist — ALL of it, or the original gate stands

    A frontend PR may proceed to merge without a human preview pass only when
    every line holds:

    - `npm run build` green · vitest green · `pytest tests/test_api.py` green
    - the matching `/adversarial-review-*` variant (MEH-428) ran, with **zero**
      REFEREE BLOCK verdicts outstanding
    - Playwright screenshots at **375 and 1440**, committed under
      `qa-artifacts/MEH-XXXX/`, compressed per the 2 MB cap (MEH-1156), and
      posted to the PR and the Linear card. **These are Chromium-only. They are
      layout and geometry evidence, NOT engine evidence** — see carve-out (e).
    - VRT diff clean, or explicitly re-baselined **in the same PR** with each
      changed PNG opened and reviewed by eye (CLAUDE.md — a regenerated baseline
      is a candidate, not truth)
    - `bash .claude/skills/mehamakor-dod/check.sh` exits 0 **in the PR's CI
      context**, where dependencies are installed.

    > **On that last line, because it is the one most easily fudged.** A
    > non-zero exit *in the CC sandbox* caused solely by missing `node_modules`
    > or the backend venv is **environmental** and does not block. A genuine
    > violation the script reports is **not** environmental — it is fixed or
    > ticketed before this amendment can be relied on, never waved through. If
    > you cannot tell which you are looking at, it is not environmental.

    #### Carve-outs that still require a human pass

    (a) any file listed in `.claude/central-components.json`
    (b) any **new** user-facing Hebrew string — **rule 22 remains fully in
        force** and is not weakened anywhere by this amendment
    (c) auth, payment, or checkout surfaces
    (d) any PR carrying a merge-block marker (ADR-016 / MEH-1155) — already void
        regardless of tier, and per rule 30 the marker is never CC's to clear
    (e) **Safari / real-device (MEH-1788).** Any change touching client storage
        (localStorage / sessionStorage / cookies), hydration or SSR/CSR
        boundaries, sticky positioning or safe-area insets, date
        parsing/formatting, or touch/scroll behaviour requires a human pass on a
        **real iOS device**.

    > **Why (e) is not negotiable on the evidence available.** There is **no
    > WebKit engine anywhere in the pipeline** — zero webkit projects in every
    > Playwright config, and the webkit binary is unobtainable in the CC sandbox
    > (proxy 403 on the download host). A green Chromium bundle therefore
    > carries *no information* about these classes. Precedent: MEH-1769 was
    > observed on real iOS Safari, and **10/10 green Chromium runs plus a
    > raw-localStorage probe failed to reproduce it** (MEH-1783). This carve-out
    > is **reviewed, not deleted**, when MEH-1788 lands engine coverage — and
    > even then Playwright webkit ≠ iOS Safari (no ITP, no PWA storage
    > partitioning, no real safe-area, momentum or input-zoom behaviour), so the
    > platform-specific subset stays human. Vocabulary to reuse: the 27
    > DEVICE-ONLY rows in `docs/qa/manual-testing-matrix.md`.

    #### The compensating control, and the condition on the whole amendment

    This trades **prevention** (a human eye before merge) for
    **detect-and-revert** (post-merge health). That trade is only legitimate
    while the detection side is alive: post-merge verification via the Vercel and
    Sentry MCPs, `.claude/commands/batch.md` §9.

    **If either MCP is disconnected, this amendment does not apply and the
    original human-preview gate above stands unchanged.** Check, don't assume —
    a substitution justified by a control nobody verified is the same shape as a
    green with two possible causes.

    _Source: MEH-1511. Ruling 08/08/2026, restated 10/08 ("רק קלוד קוד בודק").
    Carve-out (e) from MEH-1788 / MEH-1783 / MEH-1769. Original rule and its
    MEH-571 → MEH-579 rationale preserved above, unamended._

---

## The second half of the card, NOT drafted here

The card also asks, as a derived task: *"כל ניסוח ב-`.claude/rules/` וב-CLAUDE.md
שמייחד QA ידני או eye-pass לספיר — להעביר ל-CC."* That is a sweep across every
rule file plus CLAUDE.md, and **every one of those writes hits the same
classifier**. Drafting a patch doc for each without knowing whether the unblock
will even happen is speculative volume, so it is deliberately not done here.

Whoever applies this should run the sweep in the same unblocked session:

```bash
grep -rniE "ספיר.*(QA|בדיק|eye)|Smadar (confirms|opens|runs) " .claude/rules/ CLAUDE.md
```

and move the **doing** of each check to CC while leaving the **requirement**
intact. The distinction that governs the whole sweep: a gate that exists because
of *permissions Sapir physically holds* (workflow YAML, branch protection,
Alembic, `staging → main`, brand rulings) stays hers; a gate that exists because
*someone has to look* moves to CC.

## ADR-016 sync — also unapplied

`docs/decisions/ADR-016-risk-tier-nomenclature.md` must not contradict the
amended rule once it lands. `docs/decisions/**` is writable by CC, but syncing it
**first** would leave the ADR describing a rule that does not yet exist — an
inversion of the drift this repo already pays for. Apply the rule text, then the
ADR, in that order and ideally the same PR.

## What this does NOT touch

- **`.github/workflows/**`** — no behaviour change to any YAML. Out of scope and
  CC-deny regardless (MEH-671).
- **Rule 22** — untouched and explicitly reaffirmed by carve-out (b).
- **Merge authority.** This amendment governs the **QA evidence gate**, not who
  may merge. HIGH-RISK and central-component work still lands as a PR for Sapir;
  what changes is that she reviews the evidence bundle rather than a phone.
