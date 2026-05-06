Run adversarial review specialized for silent-except / swallowed-exception patterns.

Use this variant when the diff touches `backend/app/services/`,
`backend/app/routers/`, background tasks, or any `try:`/`except:` block in code
that owns a side effect (email send, DB commit, external API call).

The base `/adversarial-review` FINDER doesn't reliably catch the MEH-325 class:
`_send_verify_email` swallowed an exception and `logger.info("[EMAIL] Sent ...")`
ran anyway — the log claimed success while Resend never received the email. The
fail-open contract for email/AI/moderation is documented (CLAUDE.md → AI fail-open;
ADR-002 → email fail-open if `RESEND_API_KEY` is unset), but it is *not* a license
for silent failure on the success path. The corrected shape lives at
`backend/app/services/email.py:50-53` — `logger.info("Sent")` is inside the `try:`
*after* `resend.Emails.send()`, never inside the `except:`.

---

## FINDER — silent-except patterns

1. **Log claims success inside except block** — `except ...: logger.info("Sent")`
   or `"Saved"`, `"Created"`, `"OK"`. Canonical: MEH-325. The log message must
   not assert an outcome the failure path cannot deliver.
2. **Bare `except:` or `except Exception:` without `# noqa: BLE001` justification** —
   any swallowing block must carry an inline comment naming the documented
   fail-open path (AI moderation, email, chat) or be re-raised.
3. **Except block returns `None`/`False` and caller doesn't check** — grep
   the function's call sites for `result is None` / `if not result`. If no
   caller branches on the return, the failure is invisible.
4. **Async function call without `await`** — `_send_verify_email(...)` where
   the symbol is `async def`, missed `await` makes the coroutine a no-op
   (RuntimeWarning at most, no exception, no email).
5. **Failure logged at WARNING only, no traceback** — `logger.warning("Failed: %s", e)`
   without `exc_info=True` and no follow-up `logger.error`. Loses stack at the
   only place that knows it. WARNING-only fallback is the MEH-325 detection-gap
   shape.
6. **Handler returns 200 OK on swallowed exception** — FastAPI route whose
   `try:` covers the entire body and `except:` returns `{"detail": "..."}` with
   default status 200. Caller can't distinguish success from failure.

---

## ADVERSARY — rejection criteria

- Does the `except` carry `# noqa: BLE001 — fail-open by design` (or equivalent)
  AND match a documented contract (CLAUDE.md AI fail-open, ADR-002 email
  fail-open, LOCKED_DECISIONS.md)? Reject — sanctioned.
- Does the caller explicitly check the return value? Reject pattern #3.
- Is the failure logged at `logger.error(..., exc_info=True)` (or `logger.exception`)
  with a traceback? Reject pattern #5.
- Is the "log success" line *outside* the `except:` and *after* the side-effect
  call (the email.py:50-53 shape)? Reject pattern #1.
- Is the function intentionally fire-and-forget via `BackgroundTasks` and the
  caller doesn't need a result? Reject pattern #6 if the route's success
  semantics are "request accepted", not "side effect completed".

---

## REFEREE — verdict tiering

- **BLOCK** — Pattern #1 (log claims success in except — MEH-325 class), #4
  (missing `await` on async side effect), #6 (handler 200 OK on swallowed
  exception in non-fire-and-forget paths).
- **WARN** — Pattern #2 (bare/Exception except missing justification comment),
  #5 (WARNING-only fallback, no traceback). Promote to BLOCK if the surface
  owns a security-sensitive side effect (auth token, password hash, payment).
- **INFO** — Documented fail-open match (CLAUDE.md / ADR-002). Cite the
  contract; no action.

Output: numbered list of real BLOCKs first, then WARNs, then INFO refs. Each
entry: `<file>:<line> — <pattern #> — <one-line evidence>`.
