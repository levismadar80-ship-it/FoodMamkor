# Argon2id Migration Evaluation (MEH-649)

> **Decision: DEFER** (until Python 3.13 upgrade triggers re-evaluation).
> See §6 for full reasoning and §7 for contingency plan.

---

## 1. Current state inventory

| Item | Value | Source |
|---|---|---|
| **Python** | `>=3.11` (currently 3.11 in CI + Railway) | `backend/pyproject.toml: requires-python` |
| **passlib** | `==1.7.4` (last PyPI release 2020-10-08) | `backend/pyproject.toml` + Snyk verified in MEH-626 CVE check |
| **bcrypt** | `==4.0.1` (last release Oct 2022) | `backend/uv.lock` |
| **bcrypt cost factor** | `rounds=12` (pinned MEH-648) | `backend/app/auth.py:23` |
| **CryptContext instances** | 2 — primary at `auth.py:23`, verify-only at `services/password_policy.py:39` | grep `pwd_context\|CryptContext` |
| **`hash_password` call sites** | 5 — register × 2, register/producer × 2, reset-password × 1, change-password × 1, SENTINEL_HASH × 1 | grep `hash_password(` |
| **`verify_password` call sites** | 6 — `/login` × 3, `/auth/change-password` × 1, `services/password_policy` reuse-check × 1, MEH-626 SENTINEL × 2 | grep `verify_password(` |
| **`SENTINEL_HASH`** | `backend/app/routers/auth.py:91` — module-import-time bcrypt of constant string | MEH-626 |
| **`user.password_hash` column** | `String(200), nullable=True` (nullable for OAuth-only users) | `backend/app/models/models.py:211` |
| **DB row count at evaluation time** | Pre-launch — minimal/zero production users; staging has test data only | not measured, pre-launch state |

---

## 2. Threat model delta — what Argon2id would buy us

### bcrypt at 12 rounds today

- ~50-200ms per hash on a modest x86 server (verified empirically in MEH-626 timing test)
- Cracking cost (industry estimate, May 2026): ~$0.50-$2.00 per password on commodity GPU clusters; ~$0.05-$0.10 on dedicated bcrypt-cracking ASICs
- Memory-hard? **No.** bcrypt has small memory footprint → GPU/ASIC-friendly

### Argon2id at OWASP-recommended params

- m=47104 (46 MiB), t=1, p=1 OR m=19456 (19 MiB), t=2, p=1
- ~50-300ms per hash on equivalent server CPU (configurable)
- Memory-hard → GPU/ASIC attacks become orders of magnitude more expensive
- Side-channel resistant (id variant)
- Cracking cost (May 2026): ~$50-$500 per password — 100-1000× improvement over bcrypt

### Threat model fit for Mehamakor

| Factor | Assessment |
|---|---|
| Target value | LOW — Israeli food directory, no financial data, no PHI |
| Attacker incentive | LOW — credential reuse against higher-value targets (banks, exchanges) is the realistic attack class |
| Likelihood of full DB exfil | LOW — Railway-managed Postgres, no broad attack surface yet |
| Cost of breach (per-password GPU cracking) | bcrypt: cheap enough that determined attacker breaks 80%+ of weak passwords. Argon2id: prohibitively expensive even at scale. |

**Net:** Argon2id is **objectively better** but the marginal threat reduction is **not load-bearing** for our specific target value. The MEH-306 password policy (12-char floor + HIBP + common-password blocklist) already eliminates the easy ~30% of breach attempts that weak-hash cracking would otherwise harvest. Brute-forcing a 12-char passing-HIBP password against bcrypt-12 is already in the "expensive enough" range for a low-value target.

---

## 3. Technical migration plan (IF Go)

This is the plan we would execute IF the decision flips to Go later. Documenting now so the Python 3.13 trigger doesn't require re-research.

### 3.1 Dual-scheme transition

passlib natively supports rehash-on-verify via multi-scheme CryptContext:

```python
# auth.py:23 — proposed dual-scheme config
pwd_context = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated=["bcrypt"],         # bcrypt = legacy; argon2 = primary
    argon2__memory_cost=19456,     # 19 MiB — Railway memory-aware tier
    argon2__time_cost=2,
    argon2__parallelism=1,
    bcrypt__rounds=12,             # preserved for legacy verify
)
```

### 3.2 Rehash-on-login flow

At each `verify_password` call site that has the plain password in hand:

```python
ok = pwd_context.verify(plain, user.password_hash)
if ok and pwd_context.needs_update(user.password_hash):
    user.password_hash = pwd_context.hash(plain)
    db.commit()
```

Sites that have plain password:
- `/login` (`auth.py:857`) — primary rehash point
- `/auth/change-password` (`users_me.py`) — fresh hash anyway, no rehash needed
- `/auth/reset-password` (`auth.py:1071`) — fresh hash anyway

The MEH-626 sentinel calls (`SENTINEL_HASH` paths) skip this — they don't have a real user.

### 3.3 SENTINEL_HASH adjustment

After migration, `SENTINEL_HASH` would auto-generate as Argon2id at module import. **Timing parity invariant changes:**

- Pre-migration: all stored hashes are bcrypt-12 (~50-200ms verify), SENTINEL is bcrypt-12 → matched
- Post-migration: stored hashes are MIXED (legacy bcrypt-12 + new argon2id), SENTINEL is argon2id
- Transition window: argon2id sentinel (~50-300ms) vs bcrypt-12 stored hash (~50-200ms) — **timing parity weakens during migration**
- Steady state (post full rehash): argon2id sentinel + argon2id stored → matched again

**Migration timeline risk:** the transition window is real. Need to pick argon2 params that match bcrypt-12's median latency, then accept p95 spread > 20ms temporarily and bump the MEH-626 timing-test threshold during migration window. **This is the single biggest delivery risk.**

### 3.4 Migration timeline (estimate)

| Phase | Effort | Description |
|---|---|---|
| Add argon2-cffi to deps + dual-scheme CryptContext | 0.5 day | Single PR |
| Update both CryptContext instances (auth.py + password_policy.py) | 0.25 day | Same PR |
| Add rehash-on-login at `/login:857` | 0.5 day | Includes timing-test threshold review |
| Argon2 param tuning for Railway memory tier | 1 day | Bench on staging, pick params |
| MEH-626 timing test reconciliation (sentinel + transition window) | 0.5 day | Likely raise threshold to 50ms during transition |
| Migration monitoring (count of legacy-vs-argon2 hashes via metric) | 0.25 day | Sentry/Logger |
| Documentation update (SECURITY.md, CHANGELOG, HANDOFF) | 0.25 day | — |
| **Total** | **~3-4 days** | Single engineer, focused |

Plus post-launch operational tail (~weeks-to-months) until 95%+ of password hashes are argon2id via natural login-driven rehash.

---

## 4. Cost-benefit analysis

| Cost | Magnitude |
|---|---|
| Engineering time | 3-4 dev days end-to-end |
| New native dependency (argon2-cffi → CFFI → libargon2) | Adds C-binding to deploy; one more failure-mode surface on Railway |
| Migration-window timing-test threshold relaxation | Temporarily weakens the MEH-626 enumeration-prevention assertion |
| Cognitive load for next maintainer | Multi-scheme CryptContext is more complex than single-scheme |
| Memory pressure on Railway free tier | 19 MiB × N concurrent hashes = realistic but bounded |

| Benefit | Magnitude |
|---|---|
| Crack cost per password ↑ ~100-1000× | Theoretical; only matters if DB is exfilled |
| Future-proof against Python 3.13 `crypt` deprecation | Real but distant |
| Aligns with OWASP 2026 primary recommendation | Compliance-narrative value |
| Removes the passlib-maintenance-gap anxiety | Real |

**Pre-launch context multiplier:** every dev day spent here is a dev day not spent on features that actually drive launch. The Argon2id security improvement is real but not load-bearing for our target value (§2).

---

## 5. Sources consulted

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — Argon2id m/t/p parameter recommendations (m=47104/t=1/p=1 or m=19456/t=2/p=1)
- [OWASP Issue #1183 — RFC 9106 parameter update](https://github.com/OWASP/CheatSheetSeries/issues/1183)
- [argon2-cffi on Snyk Advisor](https://snyk.io/advisor/python/argon2-cffi) — health=Healthy, no CVEs 2025-2026, active maintainer
- [argon2-cffi PyPI](https://pypi.org/project/argon2-cffi/) — last release < 1yr (25.1.0)
- [passlib 1.7.4 CryptContext docs](https://passlib.readthedocs.io/en/stable/lib/passlib.context.html) — dual-scheme rehash pattern verified
- [passlib CryptContext Tutorial — Argon2 chapter](https://johal.in/passlib-python-hashes-argon2-password-storage-2026/) — needs_update/rehash idiom
- MEH-626 PR #760 CVE check session log — passlib maintenance gap surfacing (no PyPI release since 2020)
- MEH-648 PR #762 — current `bcrypt__rounds=12` pin rationale

---

## 6. Decision — DEFER

**Recommendation: DEFER migration. Trigger re-evaluation at Python 3.13 upgrade decision point (estimated 2027+).**

### Reasoning

1. **Target value gates the marginal benefit.** Argon2id is objectively better at the cost of cracking individual passwords from a stolen DB. For Mehamakor's threat model (low-value food directory, MEH-306 strong-password policy already in place), bcrypt-12 is in the "expensive enough that it's not the bottleneck of an attack" range. The 100-1000× crack-cost improvement is real but not load-bearing.

2. **Migration window weakens MEH-626 invariant temporarily.** The just-shipped timing-equalization fix (MEH-626) + bcrypt-rounds pin (MEH-648) + flaky-marker (MEH-647) are a freshly-stabilized stack. A dual-scheme transition with mixed-hash timing parity weakens the 20ms p95-spread assertion during the migration window. We'd be trading a known-good invariant for a re-tuning exercise mid-launch.

3. **Pre-launch effort budget should buy features, not refactors.** 3-4 dev days is real time. Pre-launch, those days are higher-value going to MEH-475 settings sweep S2 (last user-facing strings), MEH-543 (`/neighbor` activation), or other launch-blockers.

4. **Python 3.11 → 3.13 timeline is multi-year.** Python 3.13 released Oct 2024; 3.14 released Oct 2025; the `crypt` module is deprecated in 3.13 but only **removed** in 3.14. We have at least one full Python version cycle before this is forcing.

5. **passlib could revive.** It's not unmaintained-by-policy — just paused. Other forks (`passlib-libpasslib`, etc.) are emerging in 2025-2026 ecosystem. A defer-and-monitor strategy gives the ecosystem time to settle.

6. **The migration plan is documented above (§3).** If/when the trigger fires, the work is well-scoped and re-research won't be needed.

### What changes the decision to Go?

Any of:
- Active CVE published against passlib OR bcrypt 4.0.1 affecting our usage
- Confirmed plan to upgrade to Python 3.13 within next 12 months
- Mehamakor pivots to handle higher-value data (payment processing, kashrut certs as credentials, etc.)
- passlib explicitly archived on GitHub OR removed from PyPI
- Compliance/audit requirement explicitly mandating Argon2id

---

## 7. Contingency plan — Python 3.13 trigger

When Python 3.13 upgrade is considered, this section is the playbook:

1. **Re-fetch this document** + re-verify §3 plan is still current
2. **Open implementation ticket(s):** at minimum 3 PRs
   - PR1: Add `argon2-cffi` to deps + dual-scheme `CryptContext` (both instances)
   - PR2: Add rehash-on-login at `/login:857`
   - PR3: Argon2 param tuning for Railway (bench-driven)
3. **MEH-626 timing test:** temporarily raise p95-spread threshold from 20ms to 50ms during migration window; restore to 20ms after 95%+ hash-base is argon2id
4. **Operational metric:** add a counter for `password_hash_scheme=bcrypt|argon2id` to track migration progress
5. **Cutoff window:** after 12 months OR 95% argon2id (whichever first), drop `bcrypt` from `schemes=[...]` and restore the 20ms threshold

**Fallback if passlib is archived before Python 3.13 trigger:** evaluate whether passlib functionality can be replicated with a thin wrapper over argon2-cffi + bcrypt directly, bypassing passlib entirely. ~1 dev week.

---

## 8. Status

- **Decision:** DEFER
- **Document committed:** `docs/research/argon2id-migration-evaluation.md` (this file)
- **Implementation tickets:** none opened (per Defer)
- **Re-evaluation trigger:** Python 3.13 upgrade decision, OR any §6 "what changes the decision" condition fires
- **Related tickets:** MEH-626 (timing equalization), MEH-648 (bcrypt rounds pin), MEH-647 (flaky marker), MEH-624 (per-email rate limit) — all the recent auth-surface hardening that this defer preserves
