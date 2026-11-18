"""MEH-3430 — the owner uploads a menu, reviews the rows, publishes.

The model is never called here: `read_menu` is patched at the router, and the
row-shaping (`to_rows`) is tested on its own with the shapes the accuracy test
produced. Bodies are schema-valid in every guard test (regression rule 6).
"""

import uuid
from decimal import Decimal

import pytest

from app import limits
from app.models import Product
from app.routers import menu_import as route
from app.schemas.menu_import import MenuRow
from app.services import menu_reader
from tests.conftest import auth_header, make_producer, make_user

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
HEIC = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 64
PDF_2 = b"%PDF-1.7\n1 0 obj << /Type /Pages /Count 2 >>\n<< /Type /Page >>\n<< /Type /Page >>"


def _owner(db):
    producer = make_producer(db)
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user, producer


def _files(*blobs):
    return [("files", (f"p{i}.bin", b, "application/octet-stream")) for i, b in enumerate(blobs)]


@pytest.fixture
def fake_reader(monkeypatch):
    seen = {}

    def fake(files):
        seen["files"] = files
        return [MenuRow(name="לחם מחמצת", price_min=Decimal("32"))]

    monkeypatch.setattr(route, "read_menu", fake)
    return seen


# --- read ---------------------------------------------------------------------


def test_read_returns_rows_and_saves_nothing(client, db, fake_reader):
    user, producer = _owner(db)
    r = client.post("/producers/me/menu-import/read", files=_files(JPEG, PDF_2), headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["rows"][0]["name"] == "לחם מחמצת"
    assert [m for m, _ in fake_reader["files"]] == ["image/jpeg", "application/pdf"]
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 0


def test_read_sniffs_bytes_not_the_declared_type(client, db, fake_reader):
    user, _ = _owner(db)
    fake_jpeg = [("files", ("menu.jpg", b"<html>not an image</html>" + b"\x00" * 20, "image/jpeg"))]
    r = client.post("/producers/me/menu-import/read", files=fake_jpeg, headers=auth_header(user))
    assert r.status_code == 415
    assert "files" not in fake_reader  # the model was never called


def test_read_refuses_heic_which_the_model_cannot_read(client, db, fake_reader):
    user, _ = _owner(db)
    r = client.post("/producers/me/menu-import/read", files=_files(HEIC), headers=auth_header(user))
    assert r.status_code == 415


def test_read_refuses_more_than_five_files(client, db, fake_reader):
    user, _ = _owner(db)
    r = client.post("/producers/me/menu-import/read", files=_files(*[PNG] * 6), headers=auth_header(user))
    assert r.status_code == 413


def test_read_refuses_a_long_pdf(client, db, fake_reader):
    user, _ = _owner(db)
    pages = b"%PDF-1.7\n" + b"<< /Type /Page >>\n" * (route.MAX_PDF_PAGES + 1)
    r = client.post("/producers/me/menu-import/read", files=_files(pages), headers=auth_header(user))
    assert r.status_code == 413


def test_read_refuses_an_oversized_file(client, db, fake_reader, monkeypatch):
    monkeypatch.setattr(route, "MAX_FILE_BYTES", 100)
    user, _ = _owner(db)
    r = client.post("/producers/me/menu-import/read", files=_files(JPEG + b"\x00" * 200), headers=auth_header(user))
    assert r.status_code == 413


def test_read_without_ai_answers_503_not_an_empty_menu(client, db, monkeypatch):
    monkeypatch.setattr(route, "read_menu", lambda files: None)
    user, _ = _owner(db)
    r = client.post("/producers/me/menu-import/read", files=_files(JPEG), headers=auth_header(user))
    assert r.status_code == 503


def test_read_needs_a_business_owner(client, db, fake_reader):
    consumer = make_user(db, role="consumer", email=f"c{uuid.uuid4().hex[:8]}@example.com")
    r = client.post("/producers/me/menu-import/read", files=_files(JPEG), headers=auth_header(consumer))
    assert r.status_code == 403
    assert client.post("/producers/me/menu-import/read", files=_files(JPEG)).status_code == 401


# --- publish ------------------------------------------------------------------


def _row(name, price=30, **kw):
    return {"name": name, "price_min": price, **kw}


def test_publish_creates_products_for_this_business_only(client, db):
    user, producer = _owner(db)
    other_user, other = _owner(db)
    body = {"products": [_row("לחם שיפון"), _row("פטה כבשים", 18, price_unit="100g")]}
    r = client.post("/producers/me/menu-import/publish", json=body, headers=auth_header(user))
    assert r.status_code == 201, r.text
    assert r.json() == {"created": 2, "skipped_duplicates": []}
    mine = {p.name: p for p in db.query(Product).filter(Product.producer_id == producer.id)}
    assert set(mine) == {"לחם שיפון", "פטה כבשים"}
    assert mine["פטה כבשים"].price_unit == "100g"
    assert mine["לחם שיפון"].is_draft is False
    assert db.query(Product).filter(Product.producer_id == other.id).count() == 0


def test_publish_skips_names_the_business_already_has(client, db):
    user, producer = _owner(db)
    db.add(Product(producer_id=producer.id, name="לחם שיפון", price_min=20))
    db.commit()
    body = {"products": [_row("לחם  שיפון"), _row("בגט"), _row("בגט")]}
    r = client.post("/producers/me/menu-import/publish", json=body, headers=auth_header(user))
    assert r.json() == {"created": 1, "skipped_duplicates": ["לחם  שיפון", "בגט"]}


def test_publish_refuses_a_row_without_a_price(client, db):
    user, producer = _owner(db)
    body = {"products": [_row("תות שדה", None)]}
    r = client.post("/producers/me/menu-import/publish", json=body, headers=auth_header(user))
    assert r.status_code == 422
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 0


def test_publish_stops_at_the_product_cap_and_saves_nothing(client, db, monkeypatch):
    monkeypatch.setattr(limits, "CAPS", {**limits.CAPS, "products": 3})
    user, producer = _owner(db)
    db.add(Product(producer_id=producer.id, name="קיים", price_min=10))
    db.commit()
    exactly = {"products": [_row("א"), _row("ב")]}
    r = client.post("/producers/me/menu-import/publish", json=exactly, headers=auth_header(user))
    assert r.status_code == 201, r.text  # 1 + 2 = 3 = the cap
    over = {"products": [_row("ג")]}
    r = client.post("/producers/me/menu-import/publish", json=over, headers=auth_header(user))
    assert r.status_code == 409
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 3


def test_publish_fires_no_new_product_alerts(client, db, monkeypatch):
    fired = []
    monkeypatch.setattr("app.routers.alerts.fire_alerts", lambda *a, **k: fired.append(a))
    user, _ = _owner(db)
    body = {"products": [_row("לחם")]}
    assert client.post("/producers/me/menu-import/publish", json=body, headers=auth_header(user)).status_code == 201
    assert fired == []


def test_publish_moderates_the_whole_menu_in_one_call(client, db, monkeypatch):
    calls = []
    monkeypatch.setattr(route.approved_edit, "check_product", lambda bg, prod, obj, payload, tc: calls.append(payload))
    user, _ = _owner(db)
    body = {"products": [_row("לחם"), _row("עוגה", description="שוקולד")]}
    client.post("/producers/me/menu-import/publish", json=body, headers=auth_header(user))
    assert calls == [{"name": "לחם\nעוגה", "description": "שוקולד"}]


# --- to_rows: the model's output → rows -----------------------------------------


def _item(**kw):
    base = {"name": "לחם", "description": None, "section": None, "price_min": 30, "price_max": None,
            "unit": "unit", "uncertain_fields": []}
    return {**base, **kw}


def test_rows_keep_a_missing_price_missing_and_flag_it():
    (row,) = menu_reader.to_rows([_item(price_min=None)])
    assert row.price_min is None and "price" in row.uncertain


def test_rows_drop_an_out_of_range_price_instead_of_clamping():
    (row,) = menu_reader.to_rows([_item(price_min=0.5), ])
    assert row.price_min is None and row.uncertain == ["price"]
    (row,) = menu_reader.to_rows([_item(price_min=25000)])
    assert row.price_min is None


def test_rows_keep_a_range_and_drop_an_inverted_one():
    (ok,) = menu_reader.to_rows([_item(price_min=250, price_max=400)])
    assert (ok.price_min, ok.price_max) == (Decimal("250.00"), Decimal("400.00"))
    (bad,) = menu_reader.to_rows([_item(price_min=250, price_max=100)])
    assert bad.price_max is None


def test_rows_skip_nameless_items_and_cap_at_100():
    rows = menu_reader.to_rows([_item(name="  ")] + [_item(name=f"מוצר {i}") for i in range(150)])
    assert len(rows) == menu_reader.MAX_ROWS - 1  # the blank one used a slot of the 100 read


def test_rows_ignore_an_unknown_unit_and_unknown_flags():
    (row,) = menu_reader.to_rows([_item(unit="dozen", uncertain_fields=["name", "colour"])])
    assert row.price_unit == "unit" and row.uncertain == ["name"]


def test_reader_is_fail_open_without_a_key(monkeypatch):
    monkeypatch.setattr(menu_reader, "_client", None)
    monkeypatch.setattr(menu_reader.settings, "anthropic_api_key", "")
    assert menu_reader.read_menu([("image/jpeg", JPEG)]) is None


class _Resp:
    def __init__(self, text, stop="end_turn"):
        self.stop_reason = stop
        self.content = [type("B", (), {"type": "text", "text": text})()]


def test_reader_parses_a_structured_answer(monkeypatch):
    answer = '{"items": [{"name": "בגט", "description": null, "section": "לחמים", "price_min": 14, ' \
             '"price_max": null, "unit": "unit", "uncertain_fields": []}]}'
    client = type("C", (), {"messages": type("M", (), {"create": staticmethod(lambda **kw: _Resp(answer))})()})()
    monkeypatch.setattr(menu_reader, "_client", client)
    (row,) = menu_reader.read_menu([("image/jpeg", JPEG)])
    assert (row.name, row.section, row.price_min) == ("בגט", "לחמים", Decimal("14.00"))


def test_reader_treats_a_cut_off_answer_as_unread(monkeypatch):
    client = type("C", (), {"messages": type("M", (), {"create": staticmethod(lambda **kw: _Resp('{"items": [', "max_tokens"))})()})()
    monkeypatch.setattr(menu_reader, "_client", client)
    assert menu_reader.read_menu([("image/jpeg", JPEG)]) is None


def test_publish_refuses_another_business_photo(client, db):
    # MEH-3247 parity with POST /producers/me/products (security review, 18/11).
    user, producer = _owner(db)
    foreign = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/owner/owner_" + str(uuid.uuid4()) + ".jpg"
    body = {"products": [_row("לחם", image_url=foreign)]}
    r = client.post("/producers/me/menu-import/publish", json=body, headers=auth_header(user))
    assert r.status_code == 403
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 0
