"""MEH-2411: verdicts of the staging API-contract probe (scripts/check_api_contract.py).

The probe only runs against staging after a push (deploy.yml, `--probe`), and
its `--self-test` was never wired into any job — so a classifier mistake shows
up as a red probe on every staging push and nowhere earlier. That is exactly
what happened from 28/10: 12 routes "failed" that were all served.

These tests load the REAL script (never a copy) and drive it through the same
path CI does — `run_probe` → `_print_probe` — with the HTTP layer faked, so the
answer is decided by the classifier and nothing else. Bodies in the fakes are
the ones measured on staging 28/10 (`3d1b30e`).
"""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "check_api_contract.py"
_spec = importlib.util.spec_from_file_location("check_api_contract", SCRIPT)
cac = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cac)

STAGING = "https://staging.mehamakor.online"
PRODUCTION = "https://mehamakor.co.il"
# FastAPI/Starlette's own answer for a path no route matches — measured 28/10
# on staging for GET and POST /no-such-route-xyz.
ROUTING_404 = (404, {"detail": "Not Found"})


class _Resp:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body

    def json(self):
        if self._body is None:
            raise ValueError("not JSON")
        return self._body


def _fake_requests(monkeypatch, answer):
    """Install a fake `requests` whose Session answers via answer(method, url).

    Returns the list of (method, url, headers) the probe actually sent.
    """
    sent = []

    class Session:
        def __init__(self):
            self.headers = {}

        def request(self, method, url, **_kw):
            sent.append((method, url, dict(self.headers)))
            status, body = answer(method, url)
            return _Resp(status, body)

    monkeypatch.setitem(sys.modules, "requests", types.SimpleNamespace(Session=Session))
    return sent


def _calls(*pairs):
    return {"frontend_calls": [(m, p, "frontend/x.js", 1) for m, p in pairs]}


# A public GET that answers 200, so no case trips the "zero 2xx" aggregate alarm
# and each test isolates the one row it is about.
CONTROL = ("GET", "/producers")


def _probe_exit(monkeypatch, calls, answer, base=STAGING):
    sent = _fake_requests(monkeypatch, answer)
    rows = cac.run_probe(base, _calls(CONTROL, *calls))
    return cac._print_probe(rows), sent


def test_handler_404_with_its_own_detail_is_a_served_route(monkeypatch):
    # GET /producers/<uuid> on staging → 404 {"detail":"בית עסק לא נמצא"}: the
    # router matched and the HANDLER said the row is absent. The route is served.
    def answer(_m, url):
        return (
            (404, {"detail": "בית עסק לא נמצא"}) if "/producers/0" in url else (200, [])
        )

    code, _ = _probe_exit(monkeypatch, [("GET", "/producers/{_}")], answer)
    assert code == 0


def test_routing_404_is_still_deploy_drift(monkeypatch):
    def answer(_m, url):
        return ROUTING_404 if "/producers/0" in url else (200, [])

    code, _ = _probe_exit(monkeypatch, [("GET", "/producers/{_}")], answer)
    assert code == 1


def test_404_without_a_json_detail_is_still_deploy_drift(monkeypatch):
    # An HTML 404 from the edge, not from the app.
    def answer(_m, url):
        return (404, None) if "/producers/0" in url else (200, [])

    code, _ = _probe_exit(monkeypatch, [("GET", "/producers/{_}")], answer)
    assert code == 1


def test_action_segment_is_probed_with_its_real_literal(monkeypatch):
    # frontend calls `/admin/experiences/${id}/${endpoint}`; the backend serves
    # .../request-changes and .../reject (KNOWN_DYNAMIC_EXPANSIONS). Sending a
    # UUID as the action is a path that does not exist on purpose.
    def answer(_m, url):
        if "/admin/experiences/" in url:
            return (
                (401, {"detail": "נדרשת התחברות"})
                if url.endswith(("/reject", "/request-changes"))
                else ROUTING_404
            )
        return (200, [])

    code, sent = _probe_exit(
        monkeypatch, [("POST", "/admin/experiences/{_}/{_}")], answer
    )
    assert code == 0
    assert any(url.endswith("/reject") for _, url, _ in sent)


def test_bypass_header_goes_to_staging_only(monkeypatch):
    monkeypatch.setenv(cac.BYPASS_ENV, "s3cret")

    def answer(_m, _url):
        return (200, [])

    _, sent_staging = _probe_exit(monkeypatch, [], answer, base=STAGING)
    _, sent_prod = _probe_exit(monkeypatch, [], answer, base=PRODUCTION)
    assert sent_staging[0][2].get("x-vercel-protection-bypass") == "s3cret"
    assert "x-vercel-protection-bypass" not in sent_prod[0][2]


def test_static_audit_reads_only_mounted_routers():
    routes = {(m, p) for m, p, _, _ in cac.extract_backend_routes()}
    # router_registry.py comments out home_products (MEH-1406 kill-switch), so
    # its routes are not served and must not satisfy a frontend call.
    assert ("POST", "/home-products") not in routes
    # Control: a mounted router, and a second router variable in one module.
    assert ("GET", "/producers") in routes
    assert any(p.startswith("/admin/") and "group-buys" in p for _, p in routes)


def test_self_test_passes(monkeypatch, capsys):
    # The known-answer check the script ships with, run where a red blocks.
    monkeypatch.setattr(sys, "argv", ["check_api_contract.py", "--self-test"])
    assert cac.main() == 0
    assert "probe self-test OK" in capsys.readouterr().out


def test_cross_env_counts_served_vs_missing_404_as_drift(monkeypatch, capsys):
    # Same status on both sides, different meaning: staging's handler found no
    # row (route served), prod's router found no route. That IS deploy drift.
    def answer(_m, url):
        if "/events/0" in url:
            if url.startswith(STAGING):
                return (404, {"detail": "Event not found"})
            return ROUTING_404
        return (200, [])

    _fake_requests(monkeypatch, answer)
    rows = cac.run_cross_env(STAGING, PRODUCTION, _calls(CONTROL, ("GET", "/events/{_}")))
    assert cac._print_cross_env(rows) == 1
    assert "DEPLOY DRIFT" in capsys.readouterr().out


def test_app_routing_404_body_is_the_one_the_probe_keys_on(client):
    # The probe treats any other 404 detail as "route served". If the app ever
    # rewrites its routing 404 (a custom exception handler), every missing
    # route would read as served — this pins the body the rule depends on.
    r = client.get("/no-such-route-meh-2411")
    assert r.status_code == 404
    assert r.json() == {"detail": cac.ROUTING_404_DETAIL}
