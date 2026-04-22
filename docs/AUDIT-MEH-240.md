# Silent-Failure Audit — MEH-240

**Date:** 2026-04-22  
**Auditor:** Claude (session claude-sonnet-4-6)  
**Branch:** feature/meh-240-logging-overhaul  
**Scope:** `backend/app/` — all Python files, excluding test files  

---

## Method

Two grep passes:

```bash
# Pass 1 — conditional silent skips
grep -rn "if not.*:$|if.*is None:$|except.*:\s*$|return$|return None$" backend/app/

# Pass 2 — bare excepts + external HTTP
grep -rPn "except Exception:\s*pass$|except Exception:\s*return$" backend/app/
grep -rn "requests\.\(post\|get\|put\|delete\)" backend/app/
```

Each hit was read in context (±5 lines) to determine whether a log call
existed on the same code path.

---

## Gaps Found — 15 total

### Severity: WARNING
*Bare `except Exception` blocks that swallow real errors — degraded state
not visible in Railway logs. Use `logger.warning(..., exc_info=True)` so
the traceback is captured.*

| # | File | Line | Pattern | Impact |
|---|------|------|---------|--------|
| 8 | `services/experience_moderation.py` | 139–140 | `except Exception: return None` | Claude JSON parse failure silent — could indicate malformed API response |
| 9 | `services/home_product_moderation.py` | 140–141 | `except Exception: return None` | Same as #8 for home-product moderation |
| 10 | `routers/producers.py` | 308–309 | `except Exception: pass` | Geo-search enrichment failure completely silent |
| 11 | `app/auth.py` | 54–57 | `except Exception: db.rollback()` | `last_active_at` DB write fails silently — auth activity tracking broken with no trace |
| 13 | `routers/search.py` | 201 | `except Exception: result = []` | Trending-cache DB query fails → empty result returned with no indication something broke |

### Severity: DEBUG (env var / config missing — expected degraded mode)
*Normal in dev environments without all env vars set. Use `logger.debug`
with `reason=` kwarg so ops can confirm intentional degradation vs. bug.*

| # | File | Line | Pattern | Impact |
|---|------|------|---------|--------|
| 1 | `services/experience_notifications.py` | 27–28 | `if not settings.admin_email: return` | Admin never notified of new experiences pending review. **MEH-163 absorption.** |
| 2 | `services/push.py` | 26–27 | `if not VAPID keys: return` | Push notifications silently off when `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY` missing |
| 3 | `services/rating_dispatcher.py` | 86–87 | `if not Twilio creds: return` | SMS rating dispatch silently disabled when Twilio env vars missing |
| 5 | `services/bio_generator.py` | 25–26 | `if not anthropic_api_key: return None` | Bio generation silently returns `None`; call site gets empty string with no trace |
| 6 | `services/experience_moderation.py` | 56–57 | `if not anthropic_api_key: return None` | Experience moderation AI bypassed silently → fail-open with no record |
| 7 | `services/home_product_moderation.py` | 42–43 | `if not anthropic_api_key: return None` | Same as #6 for home-product moderation |

### Severity: DEBUG (state / metrics — considered normal operation)

| # | File | Line | Pattern | Impact |
|---|------|------|---------|--------|
| 4 | `services/rating_dispatcher.py` | 90–91 | `if not buyer or not buyer.phone: return` | Buyer has no phone (or click has no buyer) — SMS skipped silently |
| 12 | `app/main.py` | 366 | `except Exception: pass` | Request-timing metrics `record_request()` failure silently dropped |
| 14 | `routers/producers.py` | 20–21 | `except Exception: products_count = 0` | Lazy-load of `products` relation fails → defaults to 0 with no trace |
| 15 | `routers/producers.py` | 24–25 | `except Exception: delivery_count = 0` | Lazy-load of `delivery_areas` relation fails → defaults to 0 with no trace |

---

## Paths already logged (not in scope)

These conditional branches were examined and confirmed to have existing
log calls — no action needed:

| File | Lines | Existing log |
|------|-------|-------------|
| `services/email.py` | 27–31 | `logger.debug("[EMAIL] RESEND_API_KEY not set …")` |
| `routers/marketing.py` | 155–157 | `logger.info("[CONTACT EMAIL] No recipient configured …")` |
| `services/push.py` | 38–39 | `log.warning("push notification failed …")` |
| `services/analytics.py` | 122–127 | `logger.warning("[ANALYTICS] track_producer_view failed …")` |
| `services/experience_moderation.py` | 62–64 | `logger.warning("anthropic client init failed …")` |
| `services/home_product_moderation.py` | 70–72 | `logger.warning("anthropic client init failed …")` |
| `routers/auth.py` (Apple) | 437–439 | `logger.warning("[APPLE AUTH] Verification failed …")` |
| `routers/auth.py` (Google) | 456–458 | `logger.warning("[GOOGLE AUTH] Verification failed …")` |
| `services/bio_generator.py` | 36–38, 81–83, 126–128 | `logger.warning` / `logger.debug` on all exception paths |
| `services/experience_moderation.py` | 201–202 | `logger.exception("[experience-moderation] Claude call failed …")` |
| `services/home_product_moderation.py` | 196–197 | `logger.exception("[moderation] Claude call failed …")` |

---

## External HTTP calls

One call: `routers/auth.py:419` — `requests.get(apple_keys_url)` (Apple JWKS).  
**Not a gap.** The entire Apple verification block is wrapped in
`except Exception as e: logger.warning("[APPLE AUTH] Verification failed …")`.
Network failures are caught and logged. ✓

---

## MEH-163 disposition

MEH-163 ("silent skip when ADMIN_EMAIL is empty in `_notify_admin_new_producer`")
is absorbed by gap **#1** (`experience_notifications.py:27-28`).  
Close MEH-163 as duplicate of MEH-240 after this PR merges.
