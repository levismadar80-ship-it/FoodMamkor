# ADR-031: Outbound contact is unobservable — copy constraint + CI lexicon gate

**Status:** Accepted
**Date:** 2026-07-28
**Deciders:** Sapir Levi
**Source:** MEH-1652 · three failed copy iterations on the same string (MEH-1546 → MEH-1600 → MEH-1649) · rule landed in `docs/BRAND.md` §7 ("דיבור בשם בית העסק")

## Context

The primary contact CTA is a **client-side `wa.me` deep link**. `getPrimaryContactHref()` (`frontend/lib/contact-method.js:38-47`) builds `https://wa.me/<digits>?text=…` and the browser hands it to WhatsApp. The message travels from the customer's own phone to the business. It never touches our servers, so there is no send record, no delivery receipt, and no read state anywhere in our system.

This is not a gap waiting to be closed. It is the direct consequence of a standing DNA decision — **no internal chat** — which is what put an outbound deep link there instead of a message store. Nothing downstream changes it:

- `auto_reply_watchdog` (`backend/app/services/auto_reply_watchdog.py`) observes only **Mehamakor's own** WhatsApp number, not a business's, and it is off by default (`watchdog_enabled: bool = False`, `backend/app/config.py:123`).
- `POST /producers/{id}/whatsapp-click` (`backend/app/routers/producers.py:341`) records that a customer **tapped the button**. That is the outer edge of what we can observe. It says nothing about what happened after.

The derived constraint: **any claim about a sent message's fate is unverifiable by construction.** "It will wait for the business", "you'll get an answer when orders reopen", "they usually reply within X hours" — each asserts a fact about a system we have no channel into.

The `orders_closed` state carried exactly such a line and was rewritten three times (MEH-1546 → MEH-1600 → MEH-1649). Every iteration treated it as a wording problem. Each one produced a differently-worded claim that was equally unverifiable, which is why the third rewrite failed the same way as the first.

## Decision

Copy on consumer surfaces describes **what the site knows**, never **what the business will do**. The site may state facts it holds — order windows, delivery days, and silence — and may attribute a first-person claim to the owner who wrote it. It may not make the business the subject of a future-tense verb.

The rule text is `docs/BRAND.md` §7 → "דיבור בשם בית העסק". This ADR is its structural basis: the constraint follows from the channel being unobservable, not from a preference about tone.

Enforcement is a **lexicon check in CI** — MEH-1652 half B. **It is not implemented.** This ADR covers it in advance so that landing the gate needs no second decision record; half B is an implementation task against a decision already made here. Until it ships, the rule is review-enforced only, with the failure rate of the three iterations above as the honest prior on how well that works.

## Consequences

**Positive:**

- Ends the rewrite loop by moving the question from "is this phrasing better?" to "is the site the subject?" — a test with an answer.
- A future channel change (owner-authored auto-reply, an internal inbox) re-opens the constraint on its own terms rather than silently invalidating a copy rule with no stated basis.
- Pre-authorizes half B, so the CI gate lands as implementation rather than as a fresh argument.

**Negative:**

- The `orders_closed` state loses its reassurance line and says less than before. That may cost contact clicks.
- Half B is decided but absent, so the only thing standing between the rule and a regression is review — the exact mechanism that already failed three times.
- Some true-but-unprovable statements are now banned along with the false ones. The rule is deliberately over-broad, because distinguishing them requires the observability we do not have.

**Mitigations:**

- The click cost is **measurable, not hypothetical**: `POST /producers/{id}/whatsapp-click` already records taps per producer, so the `orders_closed` click rate can be compared before and after.
- Half B is tracked as MEH-1652 half B. `.github/workflows/**` is CC-deny (MEH-671), so the gate is Sapir's to apply.

## Alternatives considered

- **A fourth, softer rewrite** — rejected. Three attempts (MEH-1546, MEH-1600, MEH-1649) each produced a better-sounding sentence that made the same unverifiable claim. A fourth changes the wording, not the truth conditions.
- **"Notify me when it reopens"** — rejected **for now, not permanently**. It would replace the claim with a real mechanism. It needs a fifth `alert_type`: `_ALERT_COL` (`backend/app/routers/alerts.py:162-169`) holds four (`new_event`, `new_product`, `delivery_area`, `new_recipe`), and alerts sit behind login + favorites, so it also needs a no-account path. Post-launch.
- **Keeping the line and adding a disclaimer** — rejected. A hedge on an unverifiable claim is still the claim, and it spends words on our uncertainty instead of the customer's question.
- **Review-only enforcement, no CI gate** — rejected as the terminal state. It is the status quo through half A and it is what the three failed iterations were operating under.
