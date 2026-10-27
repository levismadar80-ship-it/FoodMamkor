"""MEH-2375: admin error responses must not echo raw exception text.

`admin.py` built `detail=` strings from `str(exc)` in the producer-import
parser error, the story-card Cloudinary failure and the seed-cities fetch
failure (one test each below). Exception text from a
third-party library can carry internals (paths, cloud names, request ids,
library versions) and is English, so it also broke the Hebrew-detail rule
(backend/app/routers/CLAUDE.md). The fix logs the exception server-side and
returns a fixed Hebrew message.

DISCRIMINATION: each test plants a sentinel string in the raised exception and
asserts it is absent from the response. Against the old f-string the sentinel
is present, so all three go red.
"""

import base64
import io
from unittest.mock import patch

from conftest import auth_header, make_producer, make_user

SENTINEL = "SENTINEL-internal-detail-9f3a"


def test_import_parse_error_does_not_echo_exception(client, db):
    admin = make_user(db, role="admin")
    with patch("openpyxl.load_workbook", side_effect=ValueError(SENTINEL)) as parse:
        resp = client.post(
            "/admin/producers/import",
            files={
                "file": (
                    "x.xlsx",
                    io.BytesIO(b"not a workbook"),
                    "application/octet-stream",
                )
            },
            headers=auth_header(admin),
        )
    # The patch only bites while admin.py imports load_workbook inside the
    # handler; if that import moves, this goes red instead of passing vacuously.
    assert parse.called
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert SENTINEL not in detail
    assert detail == "לא ניתן לקרוא את הקובץ"


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
