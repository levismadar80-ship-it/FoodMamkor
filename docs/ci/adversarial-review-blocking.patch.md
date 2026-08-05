# Adversarial review — findings → exit code · YAML patch for `claude-review.yml` (MEH-1668)

> **🔴 NOT APPLIED. This file is a patch document, not a change.**
> `.github/workflows/**` is CC-deny (`.claude/settings.json`, MEH-671). CC writes
> the diff here; **Sapir applies it by hand.** Same pattern as
> [`e2e-gate.patch.md`](./e2e-gate.patch.md) and
> [`adversarial-review.patch.md`](./adversarial-review.patch.md).

**Target file:** `.github/workflows/claude-review.yml`
**Depends on:** [`adversarial-review.patch.md`](./adversarial-review.patch.md) (MEH-1654) — Patch A is independent, **Patch B must not be applied before this one**.

---

## 1 · The gap this closes

MEH-1654 §5 established it and MEH-1668 confirmed it against the live file:
`claude-review.yml` has exactly **one** step under `steps:` (`:58`), the
`anthropics/claude-code-action@v1` invocation. **Nothing reads the review and
returns an exit code.** The reviewer posts a comment; the job succeeds because
the action succeeded.

**A six-finding review and a clean review produce the same green check.**

So MEH-1654's Patch B, as written, buys a gate on *"did the reviewer run"* — real
value, it closes the MEH-506 silent-no-op class — and **not** on *"is the diff
clean"*. This patch supplies the missing half. Applying Patch B without it
installs a required check that cannot fail on a defect.

---

## 2 · Was the output contract already machine-parseable?

**Mostly — with one clause that made a fail-closed gate impossible, now deleted.**
Reporting this explicitly because MEH-1668 asked and told us not to assume.

**Already parseable, before this ticket:**

* three fixed headings — `### Must Fix`, `### Should Consider`, `### Minor` — in a
  mandated order
* a literal `None.` sentinel for an empty section, so "no findings" is a positive
  token rather than an absence to infer
* per-item grammar: `<file:line> — <finding> — <fix>`, numbered in the first two
  sections and bulleted in the third

**Two things had to be fixed, both now landed in `docs/CLAUDE-REVIEW.md`:**

1. **The relax clause is deleted.** The contract used to end with *"After
   calibration flips to blocking, we may relax to 'post only when findings
   exist.'"* Under that clause silence is ambiguous — clean review, crashed
   action, budget cap, or a skipped posting tool call all look identical — and a
   fail-closed gate becomes unbuildable. Silence must never read as clean.
2. **An author + shape rule was added.** Nothing previously said *which* comment
   is the review. `### Must Fix` alone is not an identifier: a human quoting the
   format in discussion matches it. The contract now requires **both** the
   posting identity **and** all three headings, each once, in order — `AND`, not
   `||`, and the most recent match wins.

Everything below assumes the amended contract. Applying this patch against the
old one would produce a gate that passes on silence.

---

## 3 · The severity threshold

**`### Must Fix` blocks. `### Should Consider` and `### Minor` do not.**

The line is drawn there because it is the only one already carrying meaning in
this repo, rather than a new taxonomy invented to have three tiers. The contract
has used these three sections since MEH-487, and `docs/CLAUDE-REVIEW.md` focus
area 6 already fixes their semantics — *"New API endpoint or React component
without a matching test = **WARN** (not BLOCK)"* — a WARN that lands in
`Should Consider`. The reviewer has been sorting findings against a
block/no-block distinction all along; this patch reads the sort it already
performs.

Blocking on `Should Consider` would also invert what MEH-1654 established as the
reviewer's NON-GOAL. That section is where suggestions and preferences land, and
a gate on preferences is a gate on taste — with the reviewer holding a
documented **−7.5%** bias on completeness-shaped judgements. `Must Fix` is
scoped to defects, which is the one question this reviewer is measured good at.

**Consequence to accept honestly:** a reviewer that mis-sorts a real defect into
`Should Consider` passes the gate. This patch does not fix that, and no parser
can — it is a property of the reviewer, not of the parsing. It is the reason
MEH-569's effectiveness audit matters more than this gate does.

---

## 4 · The patch

Append **one step** to the `review` job, after the existing
`anthropics/claude-code-action@v1` step (which currently ends the file). No new
job, no new dependency, no new secret — `GITHUB_TOKEN` reads PR comments under
the `pull-requests: write` scope the job already declares (`:35`).

```yaml
      # ─────────────────────────────────────────────────────────────────
      # MEH-1668 — findings → exit code. Without this step the job's result
      # is decoupled from the review's content: the action succeeds whenever
      # it runs, so a six-finding review and a clean one are the same green
      # check. Required for MEH-1654's Patch B to gate on anything.
      #
      # FAILS CLOSED. No comment, an unparseable comment, or an API error all
      # exit non-zero. A gate that passes when the reviewer never spoke is the
      # MEH-506 silent-no-op class wearing a gate's name.
      #
      # Identification is author AND shape, per docs/CLAUDE-REVIEW.md
      # ("Which comment is the review"). Newest match wins — re-review after a
      # push is normal and the latest verdict is the operative one.
      # ─────────────────────────────────────────────────────────────────
      - name: Gate on review findings (MEH-1668)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          set -euo pipefail

          # --- fetch, fail-closed on an API error -------------------------
          if ! comments="$(gh api --paginate \
                 "repos/$REPO/issues/$PR_NUMBER/comments" 2>/dev/null)"; then
            echo "::error::Could not read PR comments — cannot determine the review verdict."
            exit 1
          fi

          # --- identify: author AND shape, newest first -------------------
          # jq keeps only bot-authored comments carrying all three headings,
          # then takes the last (the API returns comments oldest-first).
          review="$(printf '%s' "$comments" | jq -r '
            [ .[]
              | select(.user.type == "Bot")
              | select(.body | test("(?m)^### Must Fix\\s*$"))
              | select(.body | test("(?m)^### Should Consider\\s*$"))
              | select(.body | test("(?m)^### Minor\\s*$"))
            ] | last | if . == null then "" else .body end
          ')"

          if [ -z "$review" ]; then
            echo "::error::No adversarial review comment found on this PR."
            echo "::error::Silence is not a clean review — see docs/CLAUDE-REVIEW.md."
            exit 1
          fi

          # --- parse the Must Fix section ---------------------------------
          # Everything between '### Must Fix' and the next '### ' heading.
          must_fix="$(printf '%s' "$review" \
            | sed -n '/^### Must Fix[[:space:]]*$/,/^### /p' \
            | sed '1d;$d')"

          # A section that is neither the literal `None.` sentinel nor a list
          # of findings means the contract drifted. Refuse to answer.
          body="$(printf '%s' "$must_fix" | sed '/^[[:space:]]*$/d')"
          if [ -z "$body" ]; then
            echo "::error::'### Must Fix' is empty — the contract requires the literal 'None.'"
            echo "::error::Refusing to read an empty section as a clean review."
            exit 1
          fi

          if [ "$(printf '%s' "$body" | tr -d '[:space:]')" = "None." ]; then
            echo "Adversarial review: Must Fix = None. Gate passed."
            exit 0
          fi

          echo "::error::Adversarial review reported Must Fix findings:"
          printf '%s\n' "$body"
          exit 1
```

**Why `.user.type == "Bot"` and not a login match.** The posting identity depends
on how the action authenticates and can change without the review changing;
`type` is stable across that. It is deliberately the *broader* of the two — a
different bot posting a comment in the exact three-section shape would be
mis-identified. Narrowing to a specific login is a one-line change once the
identity has been observed on a real run, and **that observation should happen
before this is relied on.** I have not seen the bot's login on a live comment, so
I am not guessing at one here.

---

## 5 · What must be verified before this is trusted

Per `.claude/rules/testing.md` — *"Every new guard test must be shown failing"* —
this patch is **not** evidence until it has been watched discriminating. Three
runs on a real PR, in this order:

| # | Construct | Expected |
| -- | -- | -- |
| 1 | A PR where the reviewer posts `Must Fix: None.` | step **passes** |
| 2 | A PR where the reviewer posts ≥ 1 Must Fix item | step **fails**, and the log names the finding |
| 3 | A PR where the action is prevented from posting (revoke the tool, or cancel it mid-run) | step **fails** with "No adversarial review comment found" |

Run 3 is the one that matters most and the one easiest to skip: it is the only
one that proves fail-closed, and its absence is what made the *original* setup
look healthy for eleven weeks.

**The `jq` identification also needs its own check** — that it selects the
review and rejects a human comment quoting the same three headings. Post such a
comment on the test PR before run 1 and confirm the step still reads the bot's
verdict rather than the human's.

---

## 6 · Order of application

| # | Step | Owner |
| -- | -- | -- |
| 1 | Merge the MEH-1668 docs + guard PR (contract amendments land here) | CC |
| 2 | Apply **Patch A** of `adversarial-review.patch.md` (model swap) | Sapir |
| 3 | Apply **this** patch (findings → exit code) | Sapir |
| 4 | Run the three verification constructs in §5, including run 3 | Sapir |
| 5 | Delete `paths-ignore` (`:27-31`) — see `adversarial-review.patch.md` §5 | Sapir |
| 6 | Apply **Patch B** (`continue-on-error: false`) | Sapir |
| 7 | Add the check to `protect-main` only | Sapir |

**Steps 3 and 4 come before 6.** Flipping to blocking first installs a required
check whose verdict is decoupled from the diff — which reads as a working gate
and is not one, the most expensive of the available failure modes.

---

## 7 · Cross-references

* [`adversarial-review.patch.md`](./adversarial-review.patch.md) — MEH-1654: model swap (Patch A), blocking flip (Patch B), the `paths-ignore` precondition
* [`docs/CLAUDE-REVIEW.md`](../CLAUDE-REVIEW.md) — the output contract this parses; NON-GOALS; the author + shape rule
* `scripts/checks/builder-model-guard.sh` — MEH-1668's other half: builder identity, enforced mechanically instead of declared
* MEH-506 — the silent-no-op class this fails closed against
* MEH-569 — the 30-day effectiveness audit that decides whether the reviewer's sorting is trustworthy enough for any of this to matter
