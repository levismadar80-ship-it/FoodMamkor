# MEH-1779 — guardrail permission changes (Sapir-only)

**Status:** items 1–3 staged here, unapplied. Item 4 (the principle sentence) shipped
in `.claude/rules/workflow.md` rule 32.

## Why this doc exists instead of a diff

MEH-1779's four decisions were closed and ready. Three of them cannot be executed by
CC, for the reason the ticket itself established:

> סדר ההערכה הוא **deny → ask → allow**, ו-**פלט hook לא גובר על deny rule תואם**.

The ticket applied that finding to `frontend/eslint.config.mjs`. It does not apply
there — see correction A — but it **does** apply to the two files the work has to be
written into:

| Target | Deny entries in `.claude/settings.json` |
|---|---|
| `.claude/settings.json` | `Edit(.claude/settings.json)` · `Write(...)` · `MultiEdit(...)` |
| `.claude/hooks/protect-lint-config.sh` | `Edit(.claude/hooks/**)` · `Write(.claude/hooks/**)` · `MultiEdit(.claude/hooks/**)` |

**Verified empirically on 31/07**, not inferred — both `Edit` calls returned:

```
File is in a directory that is denied by your permission settings.
```

A guardrail that denies the file it is configured in cannot be changed by the agent it
governs, *including to make itself stricter*. That is the correct posture, and it means
the guardrail layer is Sapir-only in both directions.

### This was already known, and the hand-off route has a bad record

`scripts/checks/write-deny-parity-guard.sh:19-22` records the same constraint from
**MEH-1500 Phase B**, in almost the same words — *"Phase B's fix is a
`.claude/settings.json` edit, which CC cannot make (that file denies itself —
correctly)"* — and adds the part that matters here:

> Without it the fix is another A2 hand-off, and **A2 has failed 0-for-2 (MEH-1720)**.

So this doc is the third document of its kind, and the two before it were not applied.
MEH-1500's answer was not a better-written doc: it was a **guard that stays red until
the manual step happens**, discovered automatically by `scripts/checks/run-all.sh` so it
needs no workflow edit.

**This now exists — `scripts/checks/permissions-patch-guard.sh`**, armed at Sapir's
instruction after the doc was first written. It covers all three items (not just 2 and 3
as originally proposed, because item 1 is the one with a blocked ticket behind it),
runs under the required *Repo guards* job via `run-all.sh`, and is **warn-only until
2026-08-07**, flipping to blocking on its own — the `builder-model-guard.sh` pattern,
where the script checks the date so nobody has to remember.

It is **outcome-based where it can be**: checks 1 and 3 do not grep the hooks, they run
them with synthetic payloads and read the exit code, each with a **negative control**
that fails if the hook has been globally weakened. Check 2 is textual, because a script
cannot invoke the permission layer to observe a deny — that is the weakest of the three
and the guard says so in its own output.

Run `bash scripts/checks/permissions-patch-guard.sh --self-test` first; it feeds the
classifier applied / unapplied / **over-permissive** fixtures and asserts how it sorts
them. The over-permissive case is the point: an allowlist that has stopped rejecting
satisfies every positive assertion, and is the state a text-matching guard waves through.

**Verifying you are done:** apply the three sections below, then

```bash
bash scripts/checks/permissions-patch-guard.sh   # expect: OK — items 1-3 are applied
```

⚠️ **`write-deny-parity-guard` will fail item 2 if you add only `Edit(...)`.** It
requires a `Write()` and `MultiEdit()` counterpart for every `Edit()` deny entry — which
is why all three verbs are listed below. It prints the missing ones paste-ready.

---

## Correction A — there is nothing to remove from `deny`

Decision 1 says *"הסרת הנתיב מכל רשימת deny (אחרת ה-hook לעולם לא ייקרא)"*.

**`frontend/eslint.config.mjs` is not in any deny entry.** Checked against the live file:

```bash
jq -r '.permissions.deny[] | select(test("eslint"; "i"))' .claude/settings.json
# → no output
```

Its only blocker is `protect-lint-config.sh` `PROTECTED_FULL:21`. So step 1 of the
ticket's execution list is a no-op, and the hook edit alone is sufficient. The
reasoning behind the step was still right — it just described a deny entry that does
not exist.

---

## 1. `protect-lint-config.sh` — `ask` instead of block, for the ESLint config only

Everything else in `PROTECTED_FULL` must keep blocking. Add an ask-tier above it:

```bash
# ---- Ask-mode paths (MEH-1779 decision 1) ----
# CC may PROPOSE an edit here; Sapir approves interactively. Never auto-applied.
# NOT in PROTECTED_FULL — the two lists are checked in order, ask first.
ASK_PATHS=(
  "frontend/eslint.config.mjs"
)
```

and, in the main dispatch loop (currently `:224-237`), test `ASK_PATHS` **before**
`PROTECTED_FULL`, emitting an ask decision and exiting 0:

```bash
for askable in "${ASK_PATHS[@]}"; do
  if [[ "$fp" == *"$askable" ]]; then
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"MEH-1779: CC may propose ESLint config changes; Sapir approves. Constraints may be ADDED, never removed or weakened — verify the diff does not disable a rule."}}'
    exit 0
  fi
done
```

⚠️ **Unverified detail — please check before applying.** The file currently emits the
legacy `{"decision":"block","reason":"…"}` shape (`emit_block`, `:55-61`). I have not
confirmed which JSON schema this Claude Code build honours for an *ask* decision; the
`hookSpecificOutput.permissionDecision` form above is the current documented one, but
the legacy and current forms have coexisted. Confirm against
`code.claude.com/docs` — which, once item 3 lands, CC will be able to read directly.
Getting this wrong most likely fails **open** (unrecognised JSON, exit 0 = allow), which
is the wrong direction for a guard, so it is worth one manual test:

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"frontend/eslint.config.mjs","old_string":"x","new_string":"y"}}' \
  | bash .claude/hooks/protect-lint-config.sh; echo "exit=$?"
# expect: the ask JSON above, exit=0 — and an interactive prompt in a real session
```

Also confirm a **non**-ask path still blocks, so the new branch has not swallowed the
old behaviour:

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"frontend/next.config.js","old_string":"x","new_string":"y"}}' \
  | bash .claude/hooks/protect-lint-config.sh; echo "exit=$?"   # expect exit=2
```

This is the change that unblocks **MEH-1767**.

## 2. `.github/workflows/**` — deny rule

Append to `permissions.deny` in `.claude/settings.json`:

```json
"Edit(.github/workflows/**)",
"Write(.github/workflows/**)",
"MultiEdit(.github/workflows/**)"
```

The primary control is the **credential scope** (removing `workflow` / `workflows:write`
from the token CC pushes with) — that one is manual in GitHub and is not something a
repo file can express. The deny rule above is defence in depth, not the mechanism.

**The cost, stated plainly:** this is real and it is not hypothetical. Two workflow
edits landed *today* that this rule would have blocked — `e2e.yml`'s
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` line (MEH-1778) and the identical line in
`vrt-update.yml` (PR #2446), the second of which existed only because the first had
been made and its sibling missed. Under this rule both become Sapir-only round-trips.
The ticket judged that the right trade because workflow files execute arbitrary code
with the repo's secrets. Recording it here so the first time it bites, the cost reads
as chosen rather than as a surprise.

## 3. WebFetch allowlist — six domains, two caveats

**Caveat 1 — one of the six is already allowed.** `vercel.com` is in both lists today
(`settings.json` `permissions.allow`, `check-webfetch-allowlist.sh:50`), so
`vercel.com/docs` needs no change. Five hosts are actually new.

**Caveat 2 — the mechanism matches hosts, not paths.** `check-webfetch-allowlist.sh`
parses the host out of the URL (`:32-37`) and matches it in a `case` (`:44-52`); a path
is never consulted. So `cloudinary.com/documentation` is only expressible as **all of
`cloudinary.com`**, and `vercel.com/docs` as all of `vercel.com`. Both are broader than
the ticket's wording implies. Narrowing to paths would need a different mechanism —
worth knowing, not worth building now.

**Both files must change — they are two separate lists and neither reads the other.**

`.claude/settings.json` → `permissions.allow`:

```json
"WebFetch(domain:developers.google.com)",
"WebFetch(domain:code.claude.com)",
"WebFetch(domain:docs.claude.com)",
"WebFetch(domain:cloudinary.com)",
"WebFetch(domain:w3.org)",
"WebFetch(domain:developer.mozilla.org)"
```

`.claude/hooks/check-webfetch-allowlist.sh` → the `case` block at `:44-52` (this is the
authoritative one; the hook is fail-closed and runs regardless of the settings entry):

```bash
  developers.google.com) exit 0 ;;
  claude.com|*.claude.com) exit 0 ;;
  cloudinary.com|*.cloudinary.com) exit 0 ;;
  w3.org|*.w3.org) exit 0 ;;
  developer.mozilla.org) exit 0 ;;
```

Update the human-readable allowlist echoed on denial (`:55`) and the header comment
(`:5-9`) to match, or the error message will lie to the next reader.

`code.claude.com` and `docs.claude.com` are **`claude.com`, not `anthropic.com`** — the
existing `anthropic.com` entry does not cover them, which is exactly why the MEH-1776
diagnosis ran on snippets instead of Google's own documentation.

### Verify after applying

```bash
for h in developers.google.com docs.claude.com cloudinary.com w3.org developer.mozilla.org; do
  printf '{"tool_input":{"url":"https://%s/x"}}' "$h" \
    | bash .claude/hooks/check-webfetch-allowlist.sh >/dev/null 2>&1 && echo "OK   $h" || echo "FAIL $h"
done
# and the negative control — the list must stay closed:
printf '{"tool_input":{"url":"https://evil.example/x"}}' \
  | bash .claude/hooks/check-webfetch-allowlist.sh >/dev/null 2>&1 && echo "LEAK" || echo "OK   blocked"
```

The negative control is the one that matters: an allowlist that stops rejecting is
indistinguishable from a working one until it is tested against something it should
refuse.

---

## Out of scope (unchanged from the ticket)

- Credential scope change — Sapir, manually in GitHub.
- The outcome-based ratchet CI job — v2, separate ticket. Note it will need a home
  outside `.github/workflows/**` once item 2 lands, or it becomes Sapir-only to
  maintain; `scripts/checks/run-all.sh` picks up guards on its own and is the
  established route (`builder-model-guard.sh`, `changelog-branch-guard.sh`).
