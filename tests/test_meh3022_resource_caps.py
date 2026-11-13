"""
Module:   test_meh3022_resource_caps
Purpose:  MEH-3022 — nothing a business or a user writes may grow without
          bound. Three guards over the WHOLE app (so the next new route,
          request list or business-owned table is caught the day it lands)
          plus behaviour tests for the caps and limits this ticket added.
Touches:  every mounted write route · every request-body model · every table
          with a FK to producers.id · POST /producers/me/products · POST
          /events · PUT /producers/me · POST /users/me/favorites/{id}.
Related:  backend/app/limits.py (caps + registries) · app/rate_limit.py.
History:  MEH-3022 (creation; scan found 17 unlimited non-admin write routes,
          29 uncapped request lists, 0 per-business caps).

Each guard runs a CONTROL first — a case whose answer is known — so a guard
that silently enumerates nothing fails loudly instead of passing green
(testing.md: "a probe whose null output is also its reassuring output").
"""

from __future__ import annotations

import importlib.util
import inspect
import os
import sys
import typing
import uuid
from datetime import timedelta
from pathlib import Path

import annotated_types
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("ENV", "test")

# REUSES: tests/test_action_map_complete.py:33 — load the route collector.
_SPEC = importlib.util.spec_from_file_location(
    "action_map", ROOT / "scripts" / "release" / "action_map.py"
)
am = importlib.util.module_from_spec(_SPEC)
sys.modules.setdefault("action_map", am)
_SPEC.loader.exec_module(am)

from app import limits  # noqa: E402
from app.database import Base  # noqa: E402
from app.models.models import Event, Product  # noqa: E402
from app.rate_limit import limiter  # noqa: E402
from app.utils.clock import israel_today  # noqa: E402
from conftest import auth_header, make_producer, make_user  # noqa: E402

_WRITE = {"POST", "PUT", "PATCH", "DELETE"}


# --------------------------------------------------------------------------
# Guard 1 — every write route carries a rate limit (or a documented exemption)
# --------------------------------------------------------------------------


def _limited_keys() -> set[str]:
    # slowapi keys are "app.routers.<module>.<func>"; collect_routes gives the
    # short module name, so compare on "<module>.<func>".
    return {".".join(k.rsplit(".", 2)[-2:]) for k in limiter._route_limits}


def _write_routes():
    return [r for r in am.collect_routes(am.load_app()) if set(r.methods) & _WRITE]


def unlimited_write_routes() -> list[str]:
    limited = _limited_keys()
    out = []
    for r in _write_routes():
        if any(r.path.startswith(p) for p in limits.RATE_LIMIT_EXEMPT_PREFIXES):
            continue
        if f"{r.module}.{r.func}" not in limited:
            out.append(f"{','.join(sorted(r.methods))} {r.path}")
    return sorted(out)


def test_guard1_control_enumerates_and_recognises_a_limited_route():
    routes = _write_routes()
    assert len(routes) > 100, "route collector found almost nothing — guard is void"
    limited = _limited_keys()
    login = [r for r in routes if r.path == "/auth/login"]
    assert login and f"{login[0].module}.{login[0].func}" in limited


def test_guard1_every_non_admin_write_route_is_rate_limited():
    missing = unlimited_write_routes()
    assert missing == [], (
        "Write routes with no @limiter.limit (add one — see app/limits.py "
        f"for the exemption list): {missing}"
    )


# --------------------------------------------------------------------------
# Guard 2 — every list in a request body has max_length
# --------------------------------------------------------------------------


def _is_list(ann) -> bool:
    if typing.get_origin(ann) in (list, set, tuple):
        return True
    return any(_is_list(a) for a in typing.get_args(ann))


def _models_in(ann):
    if inspect.isclass(ann) and issubclass(ann, BaseModel):
        yield ann
        return
    for a in typing.get_args(ann):
        yield from _models_in(a)


def _body_models() -> set[type[BaseModel]]:
    seen: set[type[BaseModel]] = set()

    def walk(m):
        if m in seen:
            return
        seen.add(m)
        for f in m.model_fields.values():
            for sub in _models_in(f.annotation):
                walk(sub)

    for _methods, _path, _ep, dep in am._iter_api_routes(am.load_app()):
        for bp in dep.body_params:
            for m in _models_in(bp.field_info.annotation):
                walk(m)
    return seen


def uncapped_request_lists(models) -> list[str]:
    out = []
    for m in models:
        for name, f in m.model_fields.items():
            if _is_list(f.annotation) and not any(
                isinstance(x, annotated_types.MaxLen) for x in f.metadata
            ):
                out.append(f"{m.__name__}.{name}")
    return sorted(out)


def test_guard2_control_sees_a_capped_and_an_uncapped_list():
    models = _body_models()
    names = {m.__name__ for m in models}
    assert len(models) > 50 and "ProductCreate" in names

    class _Uncapped(BaseModel):
        tags: list[str] = []

    # The real classifier, a known-bad synthetic case, and a known-good real
    # one (ProductCreate.allergens carries max_length=50).
    assert uncapped_request_lists({_Uncapped}) == ["_Uncapped.tags"]
    from app.schemas.schemas import ProductCreate

    assert uncapped_request_lists({ProductCreate}) == []


def test_guard2_every_request_list_has_max_length():
    missing = uncapped_request_lists(_body_models())
    assert missing == [], f"Request lists without max_length: {missing}"


# --------------------------------------------------------------------------
# Guard 3 — every business-owned table is capped or exempt with a reason
# --------------------------------------------------------------------------


def _owned_tables() -> set[str]:
    out = set()
    for mapper in Base.registry.mappers:
        t = mapper.local_table
        if any(
            fk.column.table.name == "producers"
            for c in t.columns
            for fk in c.foreign_keys
        ):
            out.add(t.name)
    return out


def test_guard3_control_finds_products():
    owned = _owned_tables()
    assert "products" in owned and len(owned) > 10


def test_guard3_every_owned_table_is_capped_or_exempt():
    owned = _owned_tables()
    covered = set(limits.OWNED_TABLE_CAPS) | set(limits.OWNED_TABLE_EXEMPT)
    assert sorted(owned - covered) == [], (
        "Tables owned by a business with no cap in app/limits.py "
        f"(add a cap, or an OWNED_TABLE_EXEMPT reason): {sorted(owned - covered)}"
    )
    assert sorted(covered - owned) == [], f"Stale registry entries: {sorted(covered - owned)}"
    for table, kind in limits.OWNED_TABLE_CAPS.items():
        assert kind in limits.CAPS, (table, kind)
    for table, reason in limits.OWNED_TABLE_EXEMPT.items():
        assert len(reason) > 15, f"{table}: exemption needs a real reason"


# --------------------------------------------------------------------------
# Behaviour — the caps and limits this ticket added
# --------------------------------------------------------------------------


def _owner(db, *, approved: bool = True):
    producer = make_producer(db, status="approved" if approved else "pending")
    user = make_user(
        db,
        role="producer",
        email=f"o{uuid.uuid4().hex[:8]}@example.com",
        email_verified=True,
    )
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user, producer


def test_product_cap_refuses_the_next_product_in_hebrew(client, db):
    user, producer = _owner(db)
    for i in range(limits.MAX_PRODUCTS - 1):
        db.add(Product(producer_id=producer.id, name=f"מוצר {i}", price_min=10))
    db.commit()
    payload = {"name": "לחם מחמצת", "price_min": 30}
    ok = client.post("/producers/me/products", json=payload, headers=auth_header(user))
    assert ok.status_code == 201, ok.text  # the 100th is still allowed
    over = client.post("/producers/me/products", json=payload, headers=auth_header(user))
    assert over.status_code == 409
    assert over.json()["detail"].startswith("אפשר להוסיף עד 100 מוצרים")


def test_event_cap_counts_upcoming_only(client, db):
    user, producer = _owner(db)
    today = israel_today()
    for i in range(limits.MAX_UPCOMING_EVENTS):
        db.add(
            Event(
                producer_id=producer.id,
                title=f"שוק {i}",
                event_date=today - timedelta(days=i + 1),  # all in the past
                category="שוק",
                is_active=True,
            )
        )
    db.commit()
    payload = {
        "title": "שוק גלם",
        "event_date": (today + timedelta(days=30)).isoformat(),
        "category": "שוק",
        "city": "תל אביב",
    }
    r = client.post("/events", json=payload, headers=auth_header(user))
    assert r.status_code == 201, r.text  # past events never count

    for i in range(limits.MAX_UPCOMING_EVENTS - 1):
        db.add(
            Event(
                producer_id=producer.id,
                title=f"עתידי {i}",
                event_date=today + timedelta(days=i + 2),
                category="שוק",
                is_active=True,
            )
        )
    db.commit()
    over = client.post("/events", json=payload, headers=auth_header(user))
    assert over.status_code == 409
    assert "אירועים עתידיים" in over.json()["detail"]


def test_gallery_over_cap_is_refused_in_hebrew(client, db):
    user, _ = _owner(db)
    images = [
        f"https://res.cloudinary.com/demo/image/upload/v1/p{i}.jpg"
        for i in range(limits.MAX_GALLERY_IMAGES + 1)
    ]
    r = client.put("/producers/me", json={"images": images}, headers=auth_header(user))
    assert r.status_code == 422
    assert limits.GALLERY_IMAGES_DETAIL in r.text


def test_favorites_add_is_rate_limited(client, db):
    user = make_user(db, email=f"f{uuid.uuid4().hex[:8]}@example.com")
    absent = "00000000-0000-4000-8000-000000000000"
    codes = [
        client.post(f"/users/me/favorites/{absent}", headers=auth_header(user)).status_code
        for _ in range(61)
    ]
    assert 429 not in codes[:60], codes[:60]
    assert codes[60] == 429

