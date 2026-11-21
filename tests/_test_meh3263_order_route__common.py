"""Shared helpers, constants and fixtures of `tests/test_meh3263_order_route.py`.

Moved here verbatim by the MEH-3540 mechanical split. Not collected by
pytest (no `test_` prefix); `tests/test_meh3263_order_route.py` is the module pytest runs.
"""

import ast
import re
import uuid
from datetime import time, timedelta
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.catalog import ProducerLocation
from app.models.models import DeliveryArea, Product, User
from app.models.product_orders import (
    PRODUCT_ORDER_CODE_STATUSES,
    ProducerOrderSettings,
    ProducerOrderWindow,
    ProductOrder,
    ProductOrderEvent,
    ProductOrderPhoneCode,
)
from app.rate_limit import limiter
from app.routers import product_order_business as business_module
from app.routers import product_order_buyer as buyer_module
from app.routers import product_orders as orders_module
from app.services import product_order_actions as actions
from app.services import product_order_create as create_module
from app.services import product_order_delivery as delivery
from app.services import product_order_phone as phone_codes
from app.services import product_order_views as views
from app.services.product_order_views import BUYER_VIEW_AFTER_CLOSE, mask_phone
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_producer, make_user

REPO = Path(__file__).resolve().parents[1]
APP = REPO / "backend" / "app"
REVISION = (
    REPO
    / "backend"
    / "alembic"
    / "versions"
    / "20261114_2330_f7c1a5e9b3d2_meh3263_order_route.py"
)

PHONE = "050-123-4567"
PHONE_STORED = "972501234567"
OTHER_PHONE = "0529876543"
THIRD_PHONE = "0541112233"


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setattr(orders_module, "product_orders_enabled", lambda: True)


@pytest.fixture
def sent(monkeypatch):
    """WhatsApp "configured", and every code that would be sent, captured."""
    codes: list[tuple[str, str]] = []
    monkeypatch.setattr(buyer_module.whatsapp, "is_configured", lambda: True)
    monkeypatch.setattr(
        buyer_module,
        "_send_whatsapp_otp",
        lambda phone, code, test_cause=False: codes.append((phone, code)) or True,
    )
    return codes


class Shop:
    def __init__(self, db, **settings):
        self.producer = make_producer(db, name=f"מאפייה {uuid.uuid4().hex[:6]}")
        self.owner = make_user(
            db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com"
        )
        self.owner.producer_id = self.producer.id
        self.owner.is_producer = True
        fields = {
            "enabled": True,
            "lead_time_hours": 0,
            "cancel_cutoff_hours": 2,
            "business_id_number": "512345678",
        }
        fields.update(settings)
        db.add(ProducerOrderSettings(producer_id=self.producer.id, **fields))
        self.bread = Product(
            producer_id=self.producer.id, name="חלה", price_min=28, price_max=28
        )
        self.cheese = Product(
            producer_id=self.producer.id,
            name="גבינה",
            price_min=110,
            price_max=130,
            price_unit="kg",
        )
        self.wine = Product(
            producer_id=self.producer.id,
            name="יין",
            price_min=90,
            contains_alcohol=True,
        )
        db.add_all([self.bread, self.cheese, self.wine])
        for weekday in range(7):
            for fulfilment in ("pickup", "delivery"):
                db.add(
                    ProducerOrderWindow(
                        producer_id=self.producer.id,
                        weekday=weekday,
                        start_time=time(8),
                        end_time=time(20),
                        fulfilment=fulfilment,
                    )
                )
        db.commit()
        self.id = str(self.producer.id)
        self.headers = auth_header(self.owner)


def slot_of(client, shop, fulfilment="pickup", nth=1, alcohol_ok=None) -> str:
    # nth=1, not 0: the first slot can start at the next full hour, and a
    # test that reads the menu at xx:59:59 would post after it began.
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    slots = [
        s
        for s in menu["slots"]
        if s["fulfilment"] == fulfilment
        and (alcohol_ok is None or s["alcohol_ok"] is alcohol_ok)
    ]
    return slots[nth]["start"]


def code_for(client, shop, sent, phone=PHONE) -> str:
    res = client.post(
        "/product-orders/phone-code", json={"producer_id": shop.id, "phone": phone}
    )
    assert res.status_code == 200, res.text
    return sent[-1][1]


def valid_order_payload(shop, slot_start, code, **over) -> dict:
    body = {
        "producer_id": shop.id,
        "items": [{"product_id": str(shop.bread.id), "qty": 2}],
        "fulfilment": "pickup",
        "slot_start": slot_start,
        "customer_name": "דנה לוי",
        "phone": PHONE,
        "code": code,
        "idempotency_key": str(uuid.uuid4()),
    }
    body.update(over)
    return body


def send(client, shop, sent, headers=None, **over):
    """One whole order: a fresh code, then the request."""
    phone = over.get("phone", PHONE)
    slot = over.pop("slot_start", None) or slot_of(
        client, shop, over.get("fulfilment", "pickup")
    )
    body = valid_order_payload(shop, slot, code_for(client, shop, sent, phone), **over)
    return client.post("/product-orders", json=body, headers=headers or {})


def stored_order(db, shop, status="pending", **over) -> ProductOrder:
    now = utc_now()
    fields = {
        "producer_id": shop.producer.id,
        "customer_name": "דנה לוי",
        "customer_phone": PHONE_STORED,
        "fulfilment": "pickup",
        "slot_start": now + timedelta(days=1),
        "slot_end": now + timedelta(days=1, hours=1),
        "estimated_total_agorot": 5600,
        "status": status,
    }
    fields.update(over)
    order = ProductOrder(**fields)
    db.add(order)
    db.commit()
    return order


# --- delivery -----------------------------------------------------------------

FACTS = delivery.DeliveryFacts(
    offers_delivery=True,
    nationwide=False,
    cities=frozenset({"חיפה", "עכו"}),
    excluded_cities=frozenset(),
    fee=30,
    free_above=200,
)


def _facts(**over):
    return delivery.DeliveryFacts(**{**FACTS.__dict__, **over})


def _menu_starts(client, shop) -> set[str]:
    menu = client.get(f"/producers/{shop.id}/order-menu").json()
    return {s["start"] for s in menu["slots"] if s["fulfilment"] == "pickup"}


# --- MEH-3216 stage 5a: where to pick up -------------------------------------


def _primary(db, shop, **fields):
    db.query(ProducerLocation).filter_by(producer_id=shop.producer.id).delete()
    db.add(
        ProducerLocation(
            producer_id=shop.producer.id, kind="branch", is_primary=True, **fields
        )
    )
    db.commit()


ACTIONS = [
    ("confirm", {}),
    ("decline", {}),
    ("ready", {}),
    ("cancel", {}),
    ("handed", {}),
    ("no-show", None),
    ("propose-change", {"total_agorot": 100, "note": "חסר במלאי"}),
]


# --- one writer of an order's status -----------------------------------------


def _status_assignments(path: Path) -> list[int]:
    """Lines where `<something>.status = ...` is assigned, or `status` is set
    through a bulk `.update({...})` / a constructor keyword other than the
    order's birth."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    lines = []
    for node in ast.walk(tree):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AugAssign | ast.AnnAssign):
            targets = [node.target]
        # MEH-3296: a tuple target (`row.status, row.x = ...`) slipped past
        # the plain check; its elements are targets too.
        flat = []
        for t in targets:
            flat += t.elts if isinstance(t, ast.Tuple | ast.List) else [t]
        lines += [
            t.lineno
            for t in flat
            if isinstance(t, ast.Attribute) and t.attr == "status"
        ]
        if isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "update":
            for arg in node.args:
                if isinstance(arg, ast.Dict) and any(
                    (isinstance(k, ast.Constant) and k.value == "status")
                    or (isinstance(k, ast.Attribute) and k.attr == "status")
                    for k in arg.keys
                ):
                    lines.append(node.lineno)
        if isinstance(node, ast.Call):
            name = getattr(node.func, "attr", "") or getattr(node.func, "id", "")
            by_keyword = name in ("ProductOrder", "values", "update") and any(
                k.arg == "status" for k in node.keywords
            )
            by_setattr = (
                name == "setattr"
                and len(node.args) > 1
                and isinstance(node.args[1], ast.Constant)
                and node.args[1].value == "status"
            )
            if by_keyword or by_setattr:
                lines.append(node.lineno)
    return lines


# Every app file that names the order model, wherever it lives: a status
# written from an admin router or a scheduler is the same breach. A file that
# starts using ProductOrder joins this list by itself.
ORDER_FILES = sorted(
    p
    for p in APP.rglob("*.py")
    if p.parent.name != "models"
    and (
        p.name.startswith("product_order")
        or re.search(r"\bProductOrder\b", p.read_text(encoding="utf-8"))
    )
)
