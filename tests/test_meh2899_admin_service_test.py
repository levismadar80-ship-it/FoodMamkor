"""
Module:   test_meh2899_admin_service_test
Purpose:  POST /admin/settings/test/{service} — admin only, and the
          response never carries the secret it is reporting on.
Touches:  `app.config.settings` via monkeypatch (restored per test); the
          users table through the conftest factories. No outbound calls —
          the route only reads configuration, it does not contact Meta or
          Cloudinary.
Does NOT: assert that the services actually WORK. The route is a
          configured/not-configured check by construction (it reads
          settings and returns a bool), so a test claiming it proves
          reachability would be claiming more than the endpoint does.
          Also does not cover rate limiting — see the note at the bottom.
Related:  backend/app/routers/admin_extra.py:791 (the route);
          backend/app/auth.py::require_admin (403 for a non-admin,
          401 for an anonymous caller).
History:  MEH-2899 area 7 (creation).

Row 3 of the MEH-2892 top-20 action-map gaps, score 14 — «הגדרות של כל
האתר, אין טסט». Measured before writing: `grep -rn "settings/test"
tests/*.py` returned NOTHING. The route had no test at all.

WHY THE "NO SECRET" CLAIM NEEDS A CONTROL. "The response does not
contain the WhatsApp token" is trivially true when no token is
configured — which is the default in this sandbox, so the obvious
version of this test would pass against a route that echoed the secret
verbatim. Every leak test here therefore installs distinctive sentinel
values, ASSERTS THEY ARE LIVE at call time, and only then asserts they
are absent from the raw body. The liveness assertion is the control; it
is what makes the absence mean something.

SHOWN FAILING (MEH-1619). Five breaks in `admin_extra.py`, each reverted
after measuring. Every test here is red under at least one.

Every "N ran" below was measured against the 14-parametrisation revision
of this file, i.e. BEFORE the reviewer's F1 fix widened the missing-piece
test from 2 settings to all 5. Don't read 14 as the current count and
don't trust this sentence either — derive it:
`pytest tests/test_meh2899_admin_service_test.py --collect-only -q`.

  S1  `Depends(require_admin)` -> `Depends(get_current_user)`
      -> test_a_signed_in_non_admin_is_refused (2) and
         test_an_unknown_service_is_refused_for_a_non_admin_too (1).
         NOT test_anonymous_is_refused, which stays green: swapping in
         `get_current_user` still 401s a caller with no token at all.
         That one reds when the dependency is removed outright (measured
         by this PR's reviewer: 14 ran, 5 failed). The count "3" was
         right by coincidence in an earlier revision of this docstring
         while the attribution was wrong — which is the artifact-asserts-
         coverage trap in the one row most likely to be trusted.
  S2  the whatsapp branch also returns `"token": cfg.whatsapp_access_token`
      -> the leak test AND the shape test
  S3  `ok = True`
      -> the configured/unconfigured test and the missing-piece test
  S4  `ok = bool(cfg.whatsapp_phone_number_id)` — only the first setting
      -> the missing-piece test alone
  S5  the 400 detail becomes f"שירות לא מוכר: {service}"
      -> the no-echo test alone

A NOTE ON HOW S1 WAS NEARLY MISRECORDED, because it is the same shape
this module's own control guards against. The first attempt swapped the
dependency without adding the import, so the module raised NameError at
import and EVERY test errored — and the harness collecting the matrix
grepped only for lines starting with "FAILED", which an error is not. It
reported "still green", i.e. that the authorization tests did not
discriminate. They do; the probe was broken. A red for the wrong reason
is not discrimination, and neither is a probe that cannot see one
(`.claude/rules/testing.md`).
"""

from __future__ import annotations

import pytest

from app.config import settings as cfg

from conftest import auth_header, make_producer, make_user

# Distinctive, so a substring search over the body cannot miss them and
# cannot collide with anything the route legitimately returns. Not real
# credentials — they are nonsense strings that exist only in this module.
_SENTINELS = {
    "whatsapp_phone_number_id": "SENTINEL-wa-phone-id-7f3a",
    "whatsapp_access_token": "SENTINEL-wa-token-9b21",
    "cloudinary_cloud_name": "SENTINEL-cl-cloud-4d5e",
    "cloudinary_api_key": "SENTINEL-cl-key-1c8f",
    "cloudinary_api_secret": "SENTINEL-cl-secret-6e0d",
}
_SERVICES = ("whatsapp", "cloudinary")
_PATH = "/admin/settings/test/{}"


def _configure(monkeypatch) -> dict[str, str]:
    """Install every sentinel on the live settings object."""
    for name, value in _SENTINELS.items():
        monkeypatch.setattr(cfg, name, value, raising=False)
    return dict(_SENTINELS)


def _clear(monkeypatch) -> None:
    for name in _SENTINELS:
        monkeypatch.setattr(cfg, name, "", raising=False)


def _admin(db):
    return make_user(db, role="admin")


# --- who may call it -------------------------------------------------------


@pytest.mark.parametrize("service", _SERVICES)
def test_anonymous_is_refused(client, service):
    assert client.post(_PATH.format(service)).status_code == 401


@pytest.mark.parametrize("role", ["consumer", "producer"])
def test_a_signed_in_non_admin_is_refused(client, db, role):
    """403, not 401 — the caller is authenticated, just not an admin.

    A producer is wired to a business, because `require_producer`-style
    plumbing elsewhere keys off `producer_id` and a role string with no
    business attached is not the shape a real producer account has.
    """
    user = make_user(db, role=role)
    if role == "producer":
        user.producer_id = make_producer(db).id
    db.commit()

    resp = client.post(_PATH.format("whatsapp"), headers=auth_header(user))

    assert resp.status_code == 403, resp.text


# --- the secret must not come back ----------------------------------------


@pytest.mark.parametrize("service", _SERVICES)
def test_the_response_never_carries_the_secret(client, db, monkeypatch, service):
    """The point of the row: site-wide settings, admin-only, no leak.

    The control runs first: every sentinel must be readable off the live
    settings object at call time. Without it this test passes against a
    route that echoes the secret, because the sandbox configures none of
    these and the search would be over empty strings.
    """
    installed = _configure(monkeypatch)
    for name, value in installed.items():
        assert getattr(cfg, name) == value, (
            f"the sentinel for {name} is not live on the settings object, so "
            "the absence check below is searching for a value the route "
            "could not have returned either way"
        )

    resp = client.post(_PATH.format(service), headers=auth_header(_admin(db)))

    assert resp.status_code == 200, resp.text
    body = resp.text
    leaked = [name for name, value in installed.items() if value in body]
    assert not leaked, (
        f"the response body contains the configured value of {leaked}: {body}"
    )


@pytest.mark.parametrize("service", _SERVICES)
def test_the_response_is_three_known_keys_and_two_booleans(
    client, db, monkeypatch, service
):
    """Shape, asserted as a whole rather than key by key.

    `set(payload) == {...}` is what catches a NEW key — a future
    `"token_preview"` or `"detail"` carrying part of a credential would
    satisfy any number of per-key assertions and fail this one.
    """
    _configure(monkeypatch)

    payload = client.post(
        _PATH.format(service), headers=auth_header(_admin(db))
    ).json()

    assert set(payload) == {"ok", "configured", "service"}, payload
    assert isinstance(payload["ok"], bool), payload
    assert isinstance(payload["configured"], bool), payload
    assert payload["service"] == service, payload


# --- the verdict tracks the configuration ---------------------------------


@pytest.mark.parametrize("service", _SERVICES)
def test_ok_is_true_when_configured_and_false_when_not(
    client, db, monkeypatch, service
):
    """Both directions in one test, because either alone is a smoke check.

    A route hard-coded to `ok: True` passes a configured-only test; one
    hard-coded to `False` passes an unconfigured-only test. The pair is
    the contract.
    """
    admin = _admin(db)

    _configure(monkeypatch)
    configured = client.post(
        _PATH.format(service), headers=auth_header(admin)
    ).json()
    assert configured["ok"] is True, configured
    assert configured["configured"] is True, configured

    _clear(monkeypatch)
    unconfigured = client.post(
        _PATH.format(service), headers=auth_header(admin)
    ).json()
    assert unconfigured["ok"] is False, unconfigured
    assert unconfigured["configured"] is False, unconfigured


@pytest.mark.parametrize("missing", sorted(_SENTINELS))
def test_one_missing_piece_is_enough_to_report_not_configured(
    client, db, monkeypatch, missing
):
    """Each service needs ALL of its settings, not any of them.

    Without this, a route that checked only one value per service would
    report a half-configured integration as ready — and the admin screen
    exists precisely to answer "is this wired up".

    Parametrised over EVERY sentinel, derived from `_SENTINELS` rather
    than listed, so a setting added to the route's check cannot be added
    to the fixture and left untested. An earlier revision named two
    settings by hand — the LAST of each service — and this PR's reviewer
    measured what that missed: with the route reduced to
    `ok = bool(cfg.whatsapp_access_token)` and
    `ok = bool(cfg.cloudinary_api_secret)`, all 14 tests ran and 0
    failed. Two of Cloudinary's three settings were untested in either
    direction, so a Cloudinary wired up with only `API_SECRET` answered
    "ready" and uploads failed at runtime.
    """
    _configure(monkeypatch)
    monkeypatch.setattr(cfg, missing, "", raising=False)
    service = "whatsapp" if missing.startswith("whatsapp") else "cloudinary"

    payload = client.post(
        _PATH.format(service), headers=auth_header(_admin(db))
    ).json()

    assert payload["ok"] is False, (
        f"{service} reported ready with {missing} unset: {payload}"
    )
    # Both keys, because they are separate claims in the response even
    # though the route derives them from one value today. Measured by the
    # reviewer: with `"configured": bool(cfg.whatsapp_phone_number_id)`
    # and `ok` left whole, 14 ran and 0 failed — the shape test freezes
    # `configured` as a KEY but not its value, and the all-set/all-clear
    # test cannot separate the two. The admin screen reads only `ok`
    # today (`frontend/app/[locale]/admin/settings/page.js`), so this is
    # a response-contract gap rather than a user-visible one; freezing
    # the contract is what this file is for.
    assert payload["configured"] is False, (
        f"{service} claims configured with {missing} unset: {payload}"
    )


# --- an unknown service ----------------------------------------------------


def test_an_unknown_service_is_refused_without_echoing_the_input(
    client, db, monkeypatch
):
    """400, and the caller's string does not come back in the body.

    The service name is a path segment the caller controls. Reflecting it
    is not an injection on its own — FastAPI returns JSON and nothing
    renders this as HTML — but a refusal that repeats the input is how a
    reflection habit starts, and the route already answers with a fixed
    Hebrew string. Asserted so it stays fixed.
    """
    _configure(monkeypatch)
    probe = "zzz-probe-not-a-service"

    resp = client.post(_PATH.format(probe), headers=auth_header(_admin(db)))

    assert resp.status_code == 400, resp.text
    # This is the line S5 reds. FastAPI serialises an HTTPException as
    # exactly {"detail": <detail>}, so any world where this equality holds
    # has a body that cannot contain `probe`.
    assert resp.json()["detail"] == "שירות לא מוכר", resp.text
    # Which makes the line below entailed TODAY but not dead: it covers a
    # move off HTTPException to a body with an extra key. Measured by this
    # PR's reviewer with `JSONResponse(..., {"detail": "שירות לא מוכר",
    # "requested": service})` — 14 ran, 1 failed, and the failure was here.
    assert probe not in resp.text, (
        f"the refusal echoes the caller's service name: {resp.text}"
    )


def test_an_unknown_service_is_refused_for_a_non_admin_too(client, db):
    """The unknown-service path is admin-gated too.

    A 400 here instead of a 403 would mean the route tells a caller who
    may not use it which service names are real.

    It does NOT prove an ordering, which is what this docstring claimed
    until this PR's reviewer took it apart: "authorization before the
    path param is read" is a property of FastAPI resolving dependencies
    before the handler body, not of anything this route decides. Measured,
    this test reds and greens in lockstep with
    test_a_signed_in_non_admin_is_refused[consumer] under every break, so
    it adds no discriminating power — it is kept as a statement about the
    surface, not as evidence about order.
    """
    user = make_user(db, role="consumer")
    db.commit()

    resp = client.post(
        _PATH.format("zzz-probe-not-a-service"), headers=auth_header(user)
    )

    assert resp.status_code == 403, resp.text


# NOTE, recorded so it is not re-discovered as a finding: this route
# carries no `@limiter.limit`. It is `require_admin`, so brute-force is
# not the threat model, and adding a limit is a change to production
# behaviour that nobody asked for. Stated here rather than left for the
# next reader to notice and re-litigate.
