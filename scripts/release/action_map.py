#!/usr/bin/env python3
"""
Module:   scripts/release/action_map.py
Purpose:  Generate docs/release/action-map.md — every action an actor can take
          (API route, business tool, page, state transition) crossed with the
          test that covers it, as `file:line` evidence or `GAP`. Package B of
          the anchor-release plan (MEH-2892 §B, card MEH-2894).
Touches:  READS the app's own route table (imports `app.main:app`, never
          connects to a database), frontend/lib/business-features.js,
          frontend/app/[locale]/**/page.*, docs/audits/2026-11-implicit-state-
          machines.md, tests/**/*.py, frontend/__tests__/**, and the Playwright
          specs the CI config runs. WRITES only docs/release/action-map.md, and
          only with --write.
Does NOT: run any test, measure runtime coverage, or claim a test PASSES. A
          cell says "a test exercises this" — by a static match, documented
          below — never "this works". Does not touch the DB.
Related:  tests/test_action_map_complete.py (the only guard: rows exist),
          MEH-2892 §B (the spec — anchor-plan.md on PR #4284).

CLI
  python scripts/release/action_map.py            print the summary
  python scripts/release/action_map.py --write    regenerate the report
  Needs PYTHONPATH=backend:. and the env the app imports with (ENV, SECRET_KEY).

A REPORT, NOT A GATE (Sapir 10/11, option ג). The doc is regenerated with
--write when someone wants a fresh picture; nothing compares its cells or its
`file:line` citations with the code, and no check pins a line number. The ONE
guard is tests/test_action_map_complete.py: every backend route (method + path
+ handler) and every business tool (id) has a row. It runs where pytest runs.

THE MATCHER — what counts as evidence (and its limits)
  pytest   every `<x>client<y>.<method>(path, ...)` / `c.<method>(...)` /
           `TestClient(...).<method>(...)` / `client.request("M", path)` call in
           tests/**/*.py, found with `ast`. The path is the first argument: a
           string, an f-string, a `+` concatenation, a name bound to one of
           those in the module / class (`self.URL`) / enclosing function, or a
           call to a same-file `def f(...): return "<path>"` helper. Every
           `{...}` it cannot resolve becomes a placeholder segment. Rows of a
           `(method, path, ...)` table that a test parametrizes or loops over
           (`getattr(client, method)(path)`) count too, judged by the source of
           the test(s) that consume the table. The path is
           then resolved the way FastAPI resolves it: routes in registration
           order, first one whose path regex AND method match. So `/producers/me`
           resolves to the `me` route, not `/producers/{producer_id}`.
           A cell cites the first such call (files sorted, then line order),
           preferring one whose window asserts a 2xx. A call that is only ever
           asserted refused (401/403) is a negative test, not a positive one: a
           route reached only that way is `weak` ("only refused calls").
  negative a gated route's negative cell needs a matching call whose window —
           the call itself plus up to NEG_WINDOW lines after it, cut at the next
           client call — has a line asserting 401 or 403.
  weak     no call matched, but a test names the route: a string literal that
           resolves to the route's path (e.g. a parametrize table driving
           `client.request(method, path)`), or the endpoint function's name in a
           test file that also references its router module. Marked `weak`.
  e2e-mock a Playwright `page.route("<glob>", ...)` whose glob matches the route
           path. Those responses are MOCKED — the backend never ran — so it is
           INFORMATION in its own column and never counts as coverage, never
           enters the verdict or the score. A `${…}` in a template glob is
           resolved from a literal `for (const x of ["a", "b"])` list when
           there is one; otherwise it matches exactly one path segment.
  pages    `<x>.goto(path)` in the specs `playwright.config.ts` actually runs
           (its `testMatch`), resolved against the page tree the way Next.js
           does: static segments beat dynamic ones. A Vitest file under
           frontend/__tests__ that imports the page module also counts.
  tools    a tool row is covered when any of its codeRef files is: a router
           file → its routes' coverage; any other file → a test that IMPORTS it
           (pytest `app.services.x`, Vitest `@/…` or a relative specifier;
           `vi.mock` is a mock, not a test, and is ignored). A test that only
           names the file (e.g. reads it as text) is `weak`. A router file
           counts as covered only when every route in it is (it is shared by
           many tools), else `weak` with the count. The tool's
           dashboard page counts through the page cell.
  Not seen: a URL built by a helper in another file or with more than one
  `return`, a client call made inside a helper (counted for the helper's own
  line, and for §B.3 rows one hop up), schemathesis fuzzing, and E2E flows that
  hit a real backend without `page.route` (counted as page coverage only). A GAP is
  therefore "no static evidence", which is what the anchor needs to know.

RISK SCORE (deterministic, used for "Top gaps by risk")
  The terms and weights are the table RISK_LEGEND below, rendered verbatim
  into the report's «Risk score» section; base_score() + route_score() apply
  exactly those terms, and each route's «Why» names the ones that applied, so
  any score can be recomputed by hand. Privilege changes (/role, /block,
  /admin/users/… mutations) carry the highest single weight (+8, Sapir 10/11).
  The object-id term (+2) covers /me/…/{id} too, except /users/me/favorites|
  saved/… (public targets). E2E mocks never enter the score.
"""

from __future__ import annotations
import os
import sys

# The parts sit next to this file and are imported by bare name; this file
# is also loaded by path (tests/test_action_map_complete.py), so put its
# folder on the path first.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# MEH-3542: the rest of this program lives in the parts below, moved
# verbatim and dependencies-first; every name is re-exported here.
from _action_map_p01 import (  # noqa: E402, F401 — re-exported
    ACTOR_RANK,
    APP_DIR,
    AUDIT_PATH,
    AUTH_PATH_RE,
    CLOCK_RE,
    Call,
    DOC_PATH,
    DRIFT_TOLERANCE,
    ERR_ASSERT_RE,
    FEATURES_PATH,
    FOLLOWUP_WINDOW,
    GAP,
    HELPER_HOPS,
    HTTP_METHODS,
    INTERNAL_NON_API_ROUTES,
    INTERNAL_ROUTES,
    LOCK_RE,
    MONEY_PATH_RE,
    MUTATIONS,
    NEG_ASSERT_RE,
    NEG_WINDOW,
    NOTIFY_MODULE_RE,
    PAGES_ROOT,
    PARAM_PRODUCT_CAP,
    PLACEHOLDER,
    PLAYWRIGHT_CONFIG,
    POS_ASSERT_RE,
    PRIVILEGE_PATH_RE,
    PRIVILEGE_WEIGHT,
    PUBLIC_TARGET_RE,
    Path,
    PytestIndex,
    RISK_LEGEND,
    ROOT,
    ROUTERS_DIR,
    Route,
    SCAN_EXCLUDE,
    SERVICES_DIR,
    STATUS_ANY_RE,
    TESTS_DIR,
    THREAD_RE,
    TestFunc,
    VISIBILITY_PATH_RE,
    VITEST_DIR,
    _GETATTR_RE,
    _HELPER_CALL_RE,
    _NODES,
    _REQUEST_RE,
    _SPAN_INDEX,
    _assign_env,
    _bound_names,
    _class_envs,
    _dep_names,
    _drives_requests,
    _eval_str,
    _function_spans,
    _innermost,
    _is_client_receiver,
    _iter_api_routes,
    _nodes,
    _parametrize_rows,
    _status_assert_re,
    _table_rows,
    _tracked,
    _url_helpers,
    ast,
    classify_actor,
    collect_routes,
    dataclass,
    field,
    functools,
    inspect,
    non_api_paths,
    normalise_path,
    notifying_functions,
    path_regex,
    re,
    rel,
    resolve_route,
    subprocess,
    tracked_under,
)
from _action_map_p02 import (  # noqa: E402, F401 — re-exported
    Cell,
    E2EIndex,
    Evidence,
    FEATURE_LINE_RE,
    Page,
    PageRow,
    REDIRECT_LOOKAHEAD,
    REDIRECT_RE,
    RouteRow,
    STATUS_ORDER,
    Tool,
    ToolRow,
    VitestIndex,
    _ASSERT_LINE_RE,
    _TS_STR,
    _body_succeeds,
    _call_succeeds,
    _files_under,
    _followup_succeeds,
    _glob_to_regex,
    _is_refusal,
    _python_module_import,
    _regex_literal_to_regex,
    _strip_ext,
    _strip_locale,
    _ts_consts,
    _ts_str_value,
    _window_succeeds,
    base_score,
    best,
    build_e2e_index,
    build_page_rows,
    build_pytest_index,
    build_route_rows,
    build_vitest_index,
    build_vitest_index_for,
    collect_pages,
    page_route_from_file,
    parse_business_features,
    playwright_spec_files,
    resolve_page,
    route_e2e,
    route_negative,
    route_positive,
    route_score,
    route_weak,
    warnings,
    worst,
)
from _action_map_p03 import (  # noqa: E402, F401 — re-exported
    AUDIT_EXEMPT_SECTIONS,
    ActionMap,
    BUSINESS_MUTATIONS,
    CONT_RE,
    EXTRAS,
    Extra,
    ExtraRow,
    MachineRow,
    ModuleMap,
    REF_RE,
    ROUTE_MENTION_RE,
    SECTION_RE,
    _DELETE_WORDS,
    _clean,
    _count,
    _counts_line,
    _method_disagreement,
    _name_weak,
    _refs,
    _resolve_group,
    _site_tables,
    audit_entries,
    build_extra_rows,
    build_machine_rows,
    build_tool_rows,
    generate,
    load_app,
    os,
    parse_audit_sections,
    render_pages,
    site_column,
    top_gaps,
)
from _action_map_p04 import (  # noqa: E402, F401 — re-exported
    argparse,
    main,
    render,
    summary_text,
)


if __name__ == "__main__":
    sys.exit(main())
