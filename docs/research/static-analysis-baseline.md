# Static Analysis Baseline — MEH-562

_Generated: 2026-05-14. All counts are from the `feature/meh-562-static-analysis-layer-2` branch._

## 1. Summary

| Tool | Scope | Count |
|---|---|---|
| mypy strict | `app/auth.py` only (schemas/ scoped out — see §STOP-a) | **12 errors in 3 files** |
| Knip | `frontend/` | **2 unused deps + 24 dead exports + 7 unused files** |
| TS strict | `e2e/*.ts` + `playwright.config.ts` | **24 errors in 1 file** |

### STOP condition (a) — schemas/ scoped out

mypy on `app/auth.py` + `app/schemas/` combined returned **57 errors** (> 50 threshold in MEH-562 spec §STOP-a).
Scope reduced to `app/auth.py` only. `app/schemas/` deferred to follow-up ticket.

The 45 schemas/ errors are documented below in §3 for reference.

---

## 2. mypy on `app/auth.py`

_Run: `uv run mypy app/auth.py --strict` from `backend/`_

**12 errors across 3 files** (auth.py itself + transitive dependencies database.py and models.py).

### Error categories

| Category | Count | Example |
|---|---|---|
| `type-arg` — Missing type arguments for generic `dict` | 5 | `app/auth.py:76: Missing type arguments for generic type "dict"` |
| `assignment` — Incompatible types in assignment | 1 | `app/auth.py:124: Incompatible types in assignment (expression has type "datetime", variable has type "Column[datetime]")` |
| `no-untyped-def` — Function missing return type | 1 | `app/database.py:26: Function is missing a return type annotation` |
| `var-annotated` — Need type annotation for variable | 5 | `app/models/models.py:66: Need type annotation for "images"` |

### Top 10 error lines

```
app/database.py:26: error: Function is missing a return type annotation  [no-untyped-def]
app/models/models.py:66: error: Need type annotation for "images"  [var-annotated]
app/models/models.py:114: error: Need type annotation for "delivery_cities"  [var-annotated]
app/models/models.py:123: error: Need type annotation for "kashrut_badges"  [var-annotated]
app/models/models.py:127: error: Need type annotation for "custom_questions"  [var-annotated]
app/models/models.py:542: error: Need type annotation for "images"  [var-annotated]
app/auth.py:76: error: Missing type arguments for generic type "dict"  [type-arg]
app/auth.py:124: error: Incompatible types in assignment (expression has type "datetime", variable has type "Column[datetime]")  [assignment]
app/auth.py:136: error: Missing type arguments for generic type "dict"  [type-arg]
app/auth.py:149: error: Missing type arguments for generic type "dict"  [type-arg]
app/auth.py:170: error: Missing type arguments for generic type "dict"  [type-arg]
app/auth.py:180: error: Missing type arguments for generic type "dict"  [type-arg]
```

**Skeptic Mode — concrete examples:**

- `type-arg` at `app/auth.py:76` — `dict` return type lacks `dict[str, Any]` annotation. Mypy flags this because unparameterized `dict` could contain anything, masking type mismatches downstream.
- `assignment` at `app/auth.py:124` — a `datetime` value is assigned to a `Column[datetime]` field; mypy strict catches the SQLAlchemy column wrapper/value confusion that could cause subtle bugs when the column is used as a value.
- `var-annotated` at `app/models/models.py:66` — `images` JSON column needs `Mapped[list[str]]` annotation so type-checkers can infer payload shapes.

---

## 3. mypy on `app/schemas/` (reference — scoped out per STOP-a)

_Run: `uv run mypy app/schemas/ --strict` from `backend/`_

**45 errors in 3 files** — primarily `no-untyped-def` (missing type annotations on Pydantic validator methods).

Dominant pattern: Pydantic `field_validator` methods without return type annotations.

Example: `app/schemas/schemas.py:75: error: Function is missing a type annotation  [no-untyped-def]`

Full fix requires annotating ~40 validator functions in `schemas.py`. Deferred — the scope inflation (57 errors combined) triggers the STOP-a guardrail.

---

## 4. Knip findings

_Run: `npm run knip` from `frontend/`_

### Unused dependencies (2)

| Package | Declaration |
|---|---|
| `@swc/helpers` | `package.json` |
| `server-only` | `package.json` |

**Skeptic Mode:** `@swc/helpers` is listed as a direct dependency but Knip found no import of it in any entry/project file — it is likely a transitive dep that was pinned manually and is now unnecessary. `server-only` has no import in any component.

### Unused files (7)

| File |
|---|
| `components/ProducerReviews.jsx` |
| `components/ui/Tooltip.jsx` |
| `lib/api-client.js` |
| `lib/categories.js` |
| `lib/env.server.js` |
| `lib/useFadeIn.js` |
| `worker/index.js` |

### Dead exports (24)

| Export | Type | File:line |
|---|---|---|
| `MeatIcon` | function | `components/CategoryIcons.jsx:36` |
| `VegIcon` | function | `components/CategoryIcons.jsx:48` |
| `DairyIcon` | function | `components/CategoryIcons.jsx:60` |
| `BreadIcon` | function | `components/CategoryIcons.jsx:73` |
| `OilIcon` | function | `components/CategoryIcons.jsx:86` |
| `SoapIcon` | function | `components/CategoryIcons.jsx:98` |
| `FULL` | constant | `components/MapBottomSheet.jsx:97` |
| `SkeletonCard` | function | `components/Skeleton.jsx:8` |
| `SkeletonLine` | function | `components/Skeleton.jsx:18` |
| `BADGE_CONFIG` | constant | `lib/badges.js:24` |
| `CATEGORY_QUESTIONS` | constant | `lib/categoryQuestions.js:7` |
| `DEFAULT_QUESTIONS` | constant | `lib/categoryQuestions.js:85` |
| `showErrorToast` | function | `lib/errors.js:81` |
| `msUntilNext` | function | `lib/friday-mode.js:29` |
| `HOLIDAYS` | constant | `lib/holidays.js:7` |
| `OLD_TO_NEW` | constant | `lib/i18n-key-map.js:6` |
| `CATEGORY_STYLES` | constant | `lib/map-categories.js:28` |
| `DEFAULT_CATEGORY_STYLE` | constant | `lib/map-categories.js:37` |
| `PASSWORD_FAILURE_MESSAGES` | constant | `lib/passwordMessages.js:18` |
| `PRODUCER_STATUS_LABELS` | constant | `lib/producer-status.js:8` |
| `PRODUCER_STATUS_COLORS` | constant | `lib/producer-status.js:18` |
| `getVapidPublicKey` | function | `lib/push.js:15` |
| `ProducerSchema` | constant | `lib/schemas.js:7` |
| `normalizeIsraeliPhone` | function | `lib/validators.js:22` |

**Skeptic Mode — concrete example:**

- `ProducerSchema` at `lib/schemas.js:7` — exported but Knip found no import of this symbol in any entry file. This is the Zod schema that should be used for validation (per rule 19). Its non-use suggests some API calls may bypass Zod validation.
- `showErrorToast` at `lib/errors.js:81` — exported error helper not imported anywhere. Error handling may be using inline patterns instead of the shared helper.

### Unlisted dependencies (1)

| Package | File |
|---|
| `globals` | `eslint.config.mjs:2` |

### Unresolved imports (1)

| Import | File |
|---|
| `../app/producer/dashboard/page.js` | `__tests__/ProducerStatusBanners.test.jsx:72` |

---

## 5. TS strict errors

_Run: `npx tsc --project tsconfig.e2e.json --noEmit` from `frontend/`_

**24 errors in 1 file: `e2e/rtl.spec.ts`**

All 24 errors are on lines 4–10 of the file, which is the JSDoc comment block.

**Root cause:** The JSDoc comment contains `left-*/right-*` (documenting RTL intentional exceptions). The character sequence `*/` inside the comment is a valid comment-terminator in TypeScript's parser. TypeScript 6 strict mode parses the remaining text after `*/` as code, causing cascading parse errors.

| File:line | Error code | Description |
|---|---|---|
| `e2e/rtl.spec.ts:4:45` | TS1109 | Expression expected |
| `e2e/rtl.spec.ts:4:55` | TS1005 | ';' expected |
| `e2e/rtl.spec.ts:5:12` | TS1005 | ';' expected |
| `e2e/rtl.spec.ts:5:18` | TS1109 | Expression expected |
| `e2e/rtl.spec.ts:5:19` | TS1161 | Unterminated regular expression literal |
| `e2e/rtl.spec.ts:7:2` | TS1109 | Expression expected |
| `e2e/rtl.spec.ts:7:16` | TS1005 | ';' expected |
| `e2e/rtl.spec.ts:7:41` | TS1005 | ',' expected |
| `e2e/rtl.spec.ts:7:59` | TS1005 | ',' expected |
| `e2e/rtl.spec.ts:8:2` | TS1109 | Expression expected |
| `e2e/rtl.spec.ts:8:14` | TS1005 | ',' expected |
| `e2e/rtl.spec.ts:8:21` | TS1005 | ';' expected |
| `e2e/rtl.spec.ts:8:25` | TS1434 | Unexpected keyword or identifier |
| `e2e/rtl.spec.ts:8:29` | TS1434 | Unexpected keyword or identifier |
| `e2e/rtl.spec.ts:8:41` | TS1127 | Invalid character |
| `e2e/rtl.spec.ts:8:43` | TS1434 | Unexpected keyword or identifier |
| `e2e/rtl.spec.ts:8:48` | TS1434 | Unexpected keyword or identifier |
| `e2e/rtl.spec.ts:9:2` | TS1109 | Expression expected |
| `e2e/rtl.spec.ts:9:14` | TS1005 | ';' expected |
| `e2e/rtl.spec.ts:9:18` | TS1434 | Unexpected keyword or identifier |
| `e2e/rtl.spec.ts:9:34` | TS1005 | '(' expected |
| `e2e/rtl.spec.ts:9:49` | TS1005 | ')' expected |
| `e2e/rtl.spec.ts:10:2` | TS1003 | Identifier expected |
| `e2e/rtl.spec.ts:10:3` | TS1161 | Unterminated regular expression literal |

**Fix:** Replace `left-*/right-*` in the JSDoc with `left-N/right-N` or escape the `*/` sequence as `*​/` (zero-width space). One-line fix in `e2e/rtl.spec.ts`.

---

## 6. Cleanup roadmap

Recommended order:

### Phase 1 — Quick wins (< 1 hour each)

1. **`e2e/rtl.spec.ts` JSDoc** — Fix the `left-*/right-*` comment (1 line). Eliminates all 24 TS strict errors.
2. **`app/auth.py` `dict` → `dict[str, Any]`** — 5 occurrences (`auth.py:76,136,149,170,180`). Low risk — type annotations only, no logic change.
3. **`app/auth.py:124` assignment** — Investigate `Column[datetime]` vs `datetime` mismatch. May require `.replace()` + `type: ignore` or proper column accessor.

### Phase 2 — Models + database (30 min, HIGH-RISK)

4. **`app/models/models.py` untyped JSON columns** — Add `Mapped[...]` annotations to `images`, `delivery_cities`, `kashrut_badges`, `custom_questions` (5 occurrences). Schema-adjacent — requires `/adversarial-review-types`.
5. **`app/database.py:26`** — Add return type annotation to one function.

### Phase 3 — schemas/ (2–4 hours, separate ticket)

6. **`app/schemas/schemas.py` validators** — ~40 `no-untyped-def` errors on Pydantic validators. Requires adding `cls: type[Any]` + return type to every `field_validator`. Track as follow-up to MEH-562.

### Phase 4 — Frontend dead code (1–2 hours)

7. **Remove or export** `@swc/helpers` / `server-only` if truly unused.
8. **Unused files** — Investigate 7 unused files. `worker/index.js` and `components/ProducerReviews.jsx` are likely planned features; confirm with product before deleting.
9. **Dead exports** — `ProducerSchema` non-use at `lib/schemas.js:7` is highest priority (Rule 19 — Zod before every map API call).

### Phase 5 — Flip to blocking

10. After phases 1–3 resolve all errors: remove `continue-on-error: true` from each CI job.
