# MEH-2886 — Phase 0: is the request's DB connection released before BackgroundTasks run?

As of 2026-11-10, on `feature/meh-2886-db-release-chunk-1` (off `origin/staging`). This is a read-only inventory plus one new test file; no app code was changed.
Input: [2026-11-quota-inventory.md](./2026-11-quota-inventory.md) §2.2 item 3.
Words used below: **measured** means read from a run in this session. **Static** means read from the code only.

---

## 0. Summary

- **56** route handlers in `backend/app/routers/` declare a `BackgroundTasks` parameter. **55** of them queue at least one task. The 56th, `auth.py:1034` `POST /auth/register/producer/oauth`, declares the parameter and never uses it.
- **54** of the 55 were **measured** while their tasks ran: every task-queuing request in the full test suite, 866 requests in total (method in §3).
  - **42** routes held **1** connection on every branch the suite exercised.
  - **3** routes held 1 connection on one branch and 0 on another.
  - **9** routes held 0.
  - So **45 of 54** routes keep a connection checked out through their email, WhatsApp or IndexNow task on at least one path.
- **1** route was not measured with a task queued: `admin_extra.py:218` `DELETE /admin/users/{user_id}`. By static reading it is probably 0, because it ends in the same `delete_user_and_data` as `DELETE /auth/me`, which measured 0.
- **6** task sites pass the request's own `db` session into the task: `fire_alerts` ×5 and `delivery_waitlist.notify_cities` ×1 (§2.3). Those tasks need a connection while they run, so every fix has to handle them.
- **Recommendation (§4):** mechanism **(e)**. `get_db` queues `db.close` as the **first** background task of every request. That is a one-file change. It covers all 229 `Depends(get_db)` sites and the auth dependencies, it cannot break response serialization, and tasks that use `db` still work. Second choice: **(a)** applied globally, not per route.
- **The failing test** is in `tests/test_meh2886_db_release.py`: 3 tests are red on the current code and 2 controls are green (§5).

---

## 1. Framework facts (FastAPI 0.162.0, Starlette 1.3.1, SQLAlchemy 2.0.55)

Versions: `backend/pyproject.toml:6` (`fastapi==0.162.0`) and `:10` (`sqlalchemy==2.0.55`). The installed venv has `fastapi-0.162.0`, `starlette-1.3.1` and `sqlalchemy-2.0.55` dist-info. Paths below are under `backend/.venv/lib/python3.13/site-packages/`.

| # | Fact | Source |
|---|---|---|
| F1 | A request runs inside two `AsyncExitStack`s: `function_stack` closes right after `response = await f(request)`, and `request_stack` closes after `await response(scope, receive, send)`. | `fastapi/routing.py:148-155` |
| F2 | `f(request)` includes **response_model serialization**. `serialize_response` runs inside the handler, before it returns the `Response`. | `fastapi/routing.py:767` |
| F3 | Starlette runs `self.background()` inside `Response.__call__`, after the body is sent. So BackgroundTasks run **inside** `request_stack` and **after** `function_stack` has closed. | `starlette/responses.py:169-170` |
| F4 | A yield dependency goes on `function_stack` only if its `Depends(..., scope="function")`. Otherwise it goes on `request_stack`. `get_db` (`backend/app/database.py:114-119`) is used as `Depends(get_db)` everywhere, so it is request-scoped and its `db.close()` runs **after every task**. | `fastapi/dependencies/utils.py:720-722` |
| F5 | `scope` belongs to each `Depends(...)` call, not to the function, and it is part of the dependency **cache key**. If `Depends(get_db, scope="function")` and `Depends(get_db)` are both in one request's tree, FastAPI opens **two sessions**. | `fastapi/dependencies/models.py:82-96,229-234`; measured in §4 (a) |
| F6 | A request-scoped yield dependency that depends on a function-scoped one raises `DependencyScopeError` at route registration. `get_db` is the only yield dependency in `backend/app` (grep for `yield` finds only `services/chat_db_tools.py:134`, which is a plain context manager, not a dependency). | `fastapi/dependencies/utils.py:335-345` |
| F7 | `dependency_overrides` keep the scope of the original `Depends`. | `fastapi/dependencies/utils.py:689-695` |
| F8 | `SessionLocal` is `sessionmaker(autocommit=False, autoflush=False)` with the default `expire_on_commit=True` (`database.py:107`). After `commit()` the session holds no connection. Any later query, `refresh`, or read of an expired attribute (including during F2 serialization) starts a new transaction and checks a connection out. That connection is held until close, commit or rollback. | SQLAlchemy 2.0 autobegin |
| F9 | FastAPI's own `BackgroundTasks.__call__` (`fastapi/background.py:64-67`) overrides Starlette's and wraps each task in `fastapi.telemetry._operation` (an OpenTelemetry span when a provider is configured). | source |

So the audit's claim in §2.2 item 3 holds, and the mechanism is F1 + F3 + F4.

---

## 2. Inventory — routes that use BackgroundTasks

Reading the "held" column:
- "held" is the **measured** number of connections checked out by the request at the moment its first background task started, minus the number checked out when the route began. `n` is the number of requests the suite produced for that route with at least one task queued.
- `1` means this route keeps one pooled connection checked out through its tasks (email, WhatsApp, IndexNow, push). The "why" column is **static** and says what re-opens the transaction after the last commit.
- "db→task" means the task receives the request's `db` session (§2.3).

### 2.1 Holds a connection (on every measured branch) — 42

| file:line | route | tasks queued (direct or via helper) | held (n) | why (static) |
|---|---|---|---|---|
| `admin.py:593` | POST /admin/producers | IndexNow | 1 (20) | `db.refresh(producer)` + `_attach_has_owner(db, …)` after commit |
| `admin.py:911` | PUT /admin/producers/{id} | IndexNow | 1 (54) | `db.refresh` + `_attach_has_owner` after commit |
| `admin.py:1045` | POST /admin/producers/{id}/toggle-status | IndexNow, group-buy cancel mail | 1 (12) | `producer.status` read after commit (expired) |
| `admin.py:1206` | POST /admin/producers/{id}/approve | IndexNow | 1 (28) | queries after the last write |
| `admin.py:1432` | POST /admin/producers/{id}/reject | IndexNow, group-buy cancel mail | 1 (2) | `db.query(User)` after commit, then a **synchronous** `_send_notification_email` while the connection is held |
| `admin_experiences.py:73` | POST /admin/experiences/{id}/approve | IndexNow | 1 (3) | `db.refresh(ex)`, `ex.host` lazy load |
| `admin_experiences.py:108` | …/request-changes | IndexNow | 1 (1) | same |
| `admin_experiences.py:147` | …/reject | IndexNow | 1 (1) | same |
| `admin_kashrut.py:73` | POST /admin/kashrut/{id}/approve | `notify_kashrut_approved` | 1 (2) | `db.query(User)` after commit |
| `admin_kashrut.py:141` | POST /admin/kashrut/{id}/reject | `notify_kashrut_rejected` | 1 (2) | two queries after commit |
| `admin_recipes.py:119` | POST /admin/recipes/{id}/approve | `fire_alerts` (**db→task**), `notify_recipe_approved`, IndexNow | 1 (13) | `db.refresh`, `db.query(Producer)` after commit |
| `admin_recipes.py:205` | …/request-changes | `notify_recipe_changes_requested`, IndexNow | 1 (5) | `_owner_email(db…)`, `_ping_recipe` query, `_load_or_404` after commit |
| `admin_recipes.py:242` | …/reject | `notify_recipe_rejected`, IndexNow | 1 (3) | same |
| `auth.py:261` | POST /auth/register | verify + welcome mail; duplicate-attempt mail | 1 (42) | new email: `db.refresh(user)` after commit (`:326-327`). Existing email: read query, no commit at all (`:297`) |
| `auth.py:409` | POST /auth/register/producer | `notify_producer_registered`, `score_producer`, verify/welcome/duplicate mail | 1 (122) | `db.refresh(user)` after the last commit (`:846-847`); query-only on the duplicate branch |
| `auth.py:921` | POST /auth/google | welcome mail | 1 (4) | `user.*` read after commit (expired) |
| `auth.py:1297` | POST /auth/apple | welcome mail | 1 (4) | `db.refresh`, `_record_oauth_terms` after commit |
| `auth.py:1393` | POST /auth/forgot-password | reset mail | 1 (11) | `user.id`, `user.email` read after commit (`:1405-1412`) |
| `category_requests.py:25` | POST /category-requests | `notify_admin_new_category_request` | 1 (13) | `db.refresh(row)` + `db.query(Producer.name)` after commit |
| `events.py:259` | POST /events | `fire_alerts` (**db→task**), IndexNow | 1 (25) | `db.refresh(event)`, `db.query(Event)` after commit |
| `events.py:339` | PUT /events/{id} | IndexNow | 1 (9) | `db.refresh`, `db.query(Event)` after commit |
| `experiences.py:532` | PUT /experiences/{id} | IndexNow | 1 (13) | `db.refresh`, `db.query(Experience)` after commit |
| `group_buys.py:235` | POST /group-buys/{id}/commit | funded notifications | 1 (8) | `db.refresh(commit)`, `gb.status` after commit |
| `group_buys.py:350` | POST /group-buys | `fire_alerts` (**db→task**), IndexNow | 1 (20) | `db.refresh(gb)` after commit |
| `group_buys.py:490` | PATCH /group-buys/{id}/status | cancel mail, IndexNow | 1 (18) | `gb.status` read after commit |
| `group_buys.py:569` | PATCH /admin/group-buys/{id}/status | cancel mail, IndexNow | 1 (3) | same |
| `producer_claim.py:184` | POST /producer-claim | `notify_producer_registered`, `score_producer`, welcome mail | 1 (3) | `producer.status` read after commit |
| `producer_me.py:556` | PUT /producers/me | `fire_alerts` (**db→task**), `notify_cities` (**db→task**), review-ready, sensitive-edit, IndexNow | 1 (128) | `db.refresh(producer)`, `_pending_and_approvable(db…)` after commit |
| `producer_me.py:2036` | POST /producers/me/products | `fire_alerts` (**db→task**) | 1 (9) | `db.refresh(product)`, `db.query(Producer)` after commit |
| `producer_me.py:2464` | POST /producers/me/locations | location-signal ping | 1 (58) | `db.refresh(loc)`, `_maybe_fire_location_signal` queries |
| `producer_me.py:2526` | PUT /producers/me/locations/{id} | same | 1 (7) | same |
| `producer_me.py:2595` | DELETE /producers/me/locations/{id} | same | 1 (3) | `_maybe_fire_location_signal` queries after commit |
| `producer_recipes.py:114` | POST /producers/me/recipes | `notify_admin_new_recipe` | 1 (15) | `db.refresh`, two queries after commit |
| `producer_recipes.py:250` | PATCH /producers/me/recipes/{id} | `notify_admin_new_recipe`, IndexNow | 1 (6) | same |
| `registrations.py:149` | POST /events/{id}/registrations | visitor + owner mail | 1 (8) | `db.get(Producer, …)` after commit (`:171`) |
| `registrations.py:215` | POST /experiences/{id}/registrations | visitor + owner mail | 1 (5) | same shape |
| `registrations.py:368` | POST /registrations/{token}/cancel | owner cancellation mail | 1 (1) | reads after commit |
| `rescue.py:555` | POST /rescue/offers/{id}/cancel | business cancel mails | 1 (7) | `db.refresh(offer)`; response_model on an ORM object |
| `rescue.py:798` | POST /rescue/orders | reservation mail | 1 (49) | `db.refresh(order)` after commit |
| `rescue.py:990` | POST /rescue/orders/{id}/cancel | cancel mail | 1 (9) | `db.refresh(order)` after commit |
| `reviews.py:376` | POST /producers/{id}/reviews | `notify_owner_new_review` | 1 (7) | `_queue_new_review_mail` queries + `db.query(ProducerReview)` after the last commit |
| `reviews.py:608` | PUT /reviews/{id}/reply | `notify_reviewer_reply` | 1 (5) | two queries after commit |

### 2.2 Branch-dependent — 3

| file:line | route | held=1 branch (measured) | held=0 branch (measured) |
|---|---|---|---|
| `business_suggestions.py:93` | POST /business-suggestions | duplicate suggestion: `existing.name` / `.city` read after `db.commit()` (`:172-178`), 6 of 31 | new suggestion: primitives captured before commit (`:198`), 25 of 31 |
| `marketing.py:124` | POST /newsletter | address already subscribed: `add_task` at `:134`, then a read query and a return with no commit | new address: commit is the last DB step |
| `producer_me.py:1756` | POST /producers/me/request-review | pending producer: `producer.name` / `.city` read with no commit (`:1872`), 7 of 13 | resubmission: primitives captured before `db.commit()` (`:1842-1859`), 6 of 13 |

### 2.3 Releases before its tasks run (held 0) — 9, plus 1 static

`admin.py:1080` DELETE /admin/producers/{id} (16) · `auth.py:1516` DELETE /auth/me (1) · `events.py:408` DELETE /events/{id} (3) · `experiences.py:632` DELETE /experiences/{id} (1) · `marketing.py:207` POST /newsletter/unsubscribe (5) · `producer_me.py:1885` POST /producers/me/submit-for-review (6) · `producer_recipes.py:342` DELETE /producers/me/recipes/{id} (1) · `producers.py:697` POST /producers/{id}/delivery-waitlist (25) · `producers.py:793` POST /delivery-waitlist/host-confirm (2).
Static only: `admin_extra.py:218` DELETE /admin/users/{id}. It calls the same `delete_user_and_data` as DELETE /auth/me, which ends in a commit (`services/user_deletion.py:108`, plus the internal commits of `_recompute_producer_rating`), and then returns a constant. This was not measured.

The 0 cases share one pattern: **commit is the last DB step, and every value the task or the response needs was copied into a local variable before the commit.** Examples: `business_suggestions.py:198` and `producers.py:740` (comments "captured before the commit"), and `auth.py:653`.

### 2.4 Tasks that use the request's session — 6 sites

`fire_alerts(db, …)` at `events.py:320`, `group_buys.py:408`, `producer_me.py:865`, `producer_me.py:2056` and `admin_recipes.py:166`; `delivery_waitlist.notify_cities(db, …)` at `producer_me.py:882`.

Today these work only **because** `get_db` closes after the tasks (F4). `fire_alerts` (`routers/alerts.py:287`) queries `FavoriteAlert`, then sends Web Push / WhatsApp per recipient and writes `AlertLog` rows. So during the task it holds a connection across every external send.

Every other task gets plain values. Examples: `group_buys.py:_maybe_notify_funded` (docstring: "a background task must never touch `db`") and `services/producer_risk.py:283-287` (`score_producer` opens its own `SessionLocal`).

### 2.5 Related, outside this inventory

- `routers/google_rating.py:118-131` holds a connection during `httpx.get` to Google (4 s timeout). This happens inside the endpoint, not in a BackgroundTask, so none of the mechanisms below fix it. It needs its own change: commit or close before the HTTP call.
- `admin.py:1432` (reject) sends an email **synchronously** inside the endpoint while holding the connection (§2.1). That is the same class of problem.

---

## 3. How the inventory was measured

The suite is a valid instrument here because `tests/conftest.py:278-280` uses `client = TestClient(app)` on the real app. The real `engine` is `_ObservableQueuePool` on Postgres (`conftest.py:145`), and nothing overrides `get_db` except one test (`test_otp_confirm_concurrency.py:275`).

I used a scratch pytest plugin, which is **not committed**. It patched two things:
1. `fastapi.routing.APIRoute.handle`: records `engine.pool.checkedout()` when the route begins (the base).
2. `fastapi.background.BackgroundTasks.__call__` and Starlette's: records the count again before the first task runs, plus the route and task names.

held = at-task minus base. The subtraction matters: in **709 of 866** requests the test's own `db` fixture session was already holding a connection when the request started (any attribute read after `make_user`'s refresh does that). No delta was negative.

Command: `pytest -n 4 -m "not fuzz" -p bt_probe_plugin tests/`. Result: 4902 passed, 11 failed, 866 task-bearing requests recorded.
- 3 of the 11 failures are the new red tests.
- 7 are `test_meh2231_otp_test_numbers.py`. They fail on this machine with or without the plugin: the unix-socket URL has `host=None`, and the test requires a host in `{localhost, 127.0.0.1, ::1}`.
- 1 is a wall-clock timing test under `-n 4`. It passes when run serially.

Self-test before the run: on the two control routes in the new test file the plugin read 0 and 1, matching the test's own probe. On the three red tests it read 1 each.

**Limits.**
- A route's "0" covers only the branches the suite exercises.
- A "1" says a connection was held, not which session held it. A second `SessionLocal()` would count the same as `get_db`'s.
- `admin_extra.py:218` was never measured with a task queued.

---

## 4. Candidate mechanisms

The experiments in this section were run in scratch scripts against local Postgres. They are not committed.

### (a) `Depends(get_db, scope="function")`

- **Effect:** `db.close()` runs when `function_stack` exits (F1). That is after serialization (F2) and before `await response(...)`, so before the tasks run.
- **Serialization (DetachedInstanceError):** **safe.**
  - Measured: a route returning an ORM object after `commit()` (all attributes expired) with `response_model` serialized fine, and its task read 0.
  - Measured: with `scope="function"` on just `register` and `forgot_password`, in a scratch copy of the repo, all 5 tests in the new file passed.
- **Per-route use is a trap (F5).** Measured: a route with `Depends(get_db, scope="function")` that also uses a dependency built on plain `Depends(get_db)` opened **2 sessions**, and its task read **1**. Almost every authenticated route goes through `get_current_user` / `require_admin` (`backend/app/auth.py:352-356,474`), which use plain `Depends(get_db)`. So (a) only works if **every** `Depends(get_db)` in the request tree changes: **229 occurrences in 38 files**. In practice that means a `DbSession = Annotated[Session, Depends(get_db, scope="function")]` alias plus a sweep. A partial sweep doubles pool demand on the routes it touches.
- **Tasks that use `db` (§2.4) leak.** Measured: after the function-scoped close, a task that used the session re-opened a connection, and nothing closed it. After the request `checkedout()` read **1**, and it returned to 0 only on `gc.collect()`. All 6 sites would have to open their own `SessionLocal` **before** the switch.
- **Tests:** the `test_otp_confirm_concurrency.py:275` override inherits the scope (F7). Its barrier semantics need re-checking. `DependencyScopeError` (F6) cannot fire today, but would for any future request-scoped yield dependency that takes `db`.

### (b) An explicit `db.close()` before returning, in the affected routes

- **Serialization: unsafe.** Measured: `commit(); close(); return orm_obj` with a `response_model` produced **HTTP 500 `ResponseValidationError`**. Expired attributes cannot load on a detached instance, and pydantic reports it as a validation error, not as DetachedInstanceError. Each route would need `refresh` before close, or would have to build its response before close.
- It touches 45+ routes branch by branch, including helpers that query after commit (`_ping_recipe`, `_queue_new_review_mail`, `_maybe_fire_location_signal`, `_attach_has_owner`).
- Tasks that use `db` (§2.4) leak exactly as in (a).
- New routes regress silently, unless a guard test like the one in §5 is applied to every route.

### (c) A helper that commits, copies values, closes, then queues tasks

- This is (b) in one function. It has the same serialization hazard: the helper cannot know which lazy attributes the response or the later code will read. The same per-route adoption cost and the same leak for tasks that use `db`.
- It only helps routes whose last steps are "commit, then tasks". In most of §2.1 there are reads after the commit (refresh, then response).

### (d) A response-level hook

- **(d1) A custom `APIRoute` `route_class`** whose handler wrapper closes `request.state.db` after the inner handler returns. This gives the same timing as (a), globally, without the sweep. But it needs `get_db` to stash the session, `route_class=` on ~50 `APIRouter`s, and a FastAPI internal (`get_route_handler`) to stay stable. In effect it re-implements F1 by hand.
- **(d2) Middleware:** does not work. Tasks run inside `Response.__call__` (F3), which is inside any middleware's `call_next`, so middleware cannot act between the body being sent and the tasks starting.

### (e) `get_db` queues `db.close` as the FIRST background task (found during this audit)

```python
def get_db(background_tasks: BackgroundTasks):
    db = SessionLocal()
    background_tasks.add_task(db.close)   # runs before any endpoint task
    try:
        yield db
    finally:
        db.close()
```

**Why it is first:** dependencies are resolved before the endpoint body runs, and every dependency and the endpoint share one `BackgroundTasks` instance (`fastapi/routing.py:383,752`). So this task always precedes anything the endpoint or its helpers add.

**Measured in a scratch app:**
- One shared session (the route plus a `get_current_user`-style sub-dependency). Response serialization after `commit()`: 200. Task probe: **0**.
- An endpoint that raises: 500, and the pool ends at 0 (the `finally` runs).
- A task that uses `db`: it reads 0 when it starts and 1 while it queries. After the request the pool is **0**, because the request-scoped `finally: db.close()` still runs after all tasks and cleans up whatever a task re-opened. **The §2.4 sites keep working unchanged.**

| Aspect | Assessment |
|---|---|
| Scope of change | 1 file (`database.py`), every route and every auth dependency. |
| Serialization risk | None. The close runs after F2 and after the body is sent. |
| Tasks that use `db` | Work, and are cleaned up by the existing `finally`. They still hold a connection during their **own** run (fire_alerts across its sends). That is a separate, smaller follow-up: open a short `SessionLocal` per query batch. |
| Tests | Unaffected. The one override replaces `get_db` wholesale. |
| Cost (not measured) | Every request that uses `get_db`, including plain GETs, now has ≥1 background task: one threadpool hop after the response, for a sync `db.close`. Under F9 that is also one `_operation` span per request **if** an OpenTelemetry tracer provider is configured. Whether Sentry's SDK installs one here is **unverified**, and it matters for the spans quota (quota inventory §1.3). |
| Edge case | A route that returns its own `Response(background=…)` keeps that object, and FastAPI does not attach the solved tasks (`routing.py:751-752`). The close task would then not run early, and `finally` still closes. `grep "background="` over `backend/app`: none today. |
| Edge case | A dependency resolved **before** `get_db` that adds a task would run ahead of the close. None exists (no dependency calls `add_task`). |

### Recommendation

**(e) for chunk 2**, with:

1. The guard tests in `tests/test_meh2886_db_release.py`, plus one route from §2.4 (for example `PUT /producers/me` with a delivery-area change), asserting the pool reads 0 after the request.
2. A measurement of the per-request cost: the GET-route latency in `tests/test_api.py` before and after, and a check of whether a tracer provider is active under Sentry.

Fall back to **(a) global** (alias plus a sweep of all 229 sites, with the 6 §2.4 sites moved to their own sessions first) if (e)'s per-request task is rejected. Do **not** apply (a) to individual routes (F5). Do not use (b) or (c) as the primary mechanism (serialization 500s, per-route drift).

**Fixed by no mechanism above:** `google_rating.py:118-131` (HTTP call inside the endpoint), `admin.py:1432`'s synchronous email, and the `register` / `register_producer` `async def` handlers running sync queries on the event loop (quota inventory §2.2 item 5).

---

## 5. The failing test

File: `tests/test_meh2886_db_release.py`.

**Probe:** a background-task stand-in records `engine.pool.checkedout()` while it runs. Each test closes its seed session and asserts the pool reads 0 *before* the request, so the reading belongs to the request alone.

| Test | Shape | Current code |
|---|---|---|
| `test_control_probe_reads_zero_when_request_never_touched_db` | Throwaway app, real `get_db`, never queries | **pass**, reads 0 |
| `test_control_probe_reads_nonzero_when_task_runs_inside_open_txn` | Throwaway app, real `get_db`, `SELECT 1`, then a task | **pass**, reads 1 |
| `test_register_new_email_releases_connection_before_background_tasks` | `commit()`, then `refresh()` (`auth.py:326-331`) | **FAIL**, reads 1 |
| `test_register_existing_email_releases_connection_before_background_tasks` | Query only, no commit (`auth.py:297` → `:355`) | **FAIL**, reads 1 |
| `test_forgot_password_releases_connection_before_background_tasks` | `commit()`, then expired-attribute reads (`auth.py:1405-1412`) | **FAIL**, reads 1 |

**Discrimination check:** in a scratch copy of the repo, changing only those two routes to `Depends(get_db, scope="function")` turned all five green. The controls stay green either way.

**How it lands without turning CI red:** the three real-route tests carry `pytest.mark.xfail(strict=True)` in chunk 1, so CI shows `3 xfailed`. A strict xfail that passes fails the suite, so the fix in chunk 2 cannot land without deleting the marker. Measured on the chunk-1 branch: `2 passed, 3 xfailed`.
