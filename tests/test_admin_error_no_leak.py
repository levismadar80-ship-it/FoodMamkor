"""MEH-2375: admin error responses must not echo raw exception text.

`admin.py` built `detail=` strings from `str(exc)` in the producer-import
parser error, the story-card Cloudinary failure and the seed-cities fetch
failure. The import route was removed in MEH-2516, so its case is now a
route-is-gone check; the other two keep one test each below. Exception text from a
third-party library can carry internals (paths, cloud names, request ids,
library versions) and is English, so it also broke the Hebrew-detail rule
(backend/app/routers/CLAUDE.md). The fix logs the exception server-side and
returns a fixed Hebrew message.

DISCRIMINATION: each test plants a sentinel string in the raised exception and
asserts it is absent from the response. Against the old f-string the sentinel
is present, so both go red.
"""

import base64
import io
from unittest.mock import patch

from conftest import auth_header, make_producer, make_user

SENTINEL = "SENTINEL-internal-detail-9f3a"


def test_producer_import_route_is_gone(client, db):
    """MEH-2516 removed the Excel/CSV import (it published rows with no
    licence, photo or declaration). Its parser-error case lived here; the
    route itself must now be absent, not merely unlinked from the UI."""
    admin = make_user(db, role="admin")
    resp = client.post(
        "/admin/producers/import",
        files={"file": ("x.xlsx", io.BytesIO(b"x"), "application/octet-stream")},
        headers=auth_header(admin),
    )
    # 405: `/producers/{producer_id}` style routes may match the path with
    # another verb; 404 when nothing does. Either way, no handler ran.
    assert resp.status_code in (404, 405)


def test_story_card_upload_failure_does_not_echo_exception(client, db):
    admin = make_user(db, role="admin")
    producer = make_producer(db)
    payload = {
        "image_data": "data:image/jpeg;base64,"
        + base64.b64encode(b"\xff\xd8\xff").decode()
    }
    with (
        patch("app.routers.admin.settings.cloudinary_cloud_name", "test-cloud"),
        patch("cloudinary.uploader.upload", side_effect=RuntimeError(SENTINEL)),
    ):
        resp = client.post(
            f"/admin/producers/{producer.id}/story-card",
            json=payload,
            headers=auth_header(admin),
        )
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert SENTINEL not in detail
    assert detail == "העלאת התמונה נכשלה"


def test_seed_cities_fetch_error_does_not_echo_exception(client, db):
    import httpx

    admin = make_user(db, role="admin")
    with patch("app.routers.admin.httpx.get", side_effect=httpx.ConnectError(SENTINEL)):
        resp = client.post("/admin/seed-cities", headers=auth_header(admin))
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert SENTINEL not in detail
    assert detail == "לא הצלחנו להביא את רשימת היישובים מ-data.gov.il"


def test_seed_cities_parse_error_detail_is_only_our_keys_text(client, db):
    """The LocalityParseError branch is excluded from MEH-2375 on purpose: its
    text is built by scripts/seed_cities.py and names the record keys an admin
    needs to fix the import. Pin that the response carries exactly that text
    under the fixed Hebrew prefix, nothing else."""
    from scripts.seed_cities import LocalityParseError

    admin = make_user(db, role="admin")

    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return [{"foo": 1}]

    with (
        patch("app.routers.admin.httpx.get", return_value=_Resp()),
        patch(
            "scripts.seed_cities.parse_localities",
            side_effect=LocalityParseError("keys: foo"),
        ),
    ):
        resp = client.post("/admin/seed-cities", headers=auth_header(admin))
    assert resp.status_code == 502
    assert (
        resp.json()["detail"]
        == "הרשומות התקבלו אך לא נמצאה בהן עמודת שם יישוב: keys: foo"
    )
