"""MEH-2241 — `POST /admin/seed-cities` carried its own copy of the broken parser.

`scripts/seed_cities.py` was fixed in PR #3288: the locality-name column is
discovered from the response instead of being guessed, because the data.gov.il
resource publishes `שם_ישוב` (one yod) while the old parser read `שם_יישוב`
(two yods) and therefore skipped all 1272 records, inserted nothing, and exited
0. The admin endpoint held a byte-identical inline copy of that parser, so the
admin button was broken in exactly the same way and would have stayed broken
after the script was fixed — two owners for one parse, which is the drift
`.claude/rules/workflow.md` Smell #1 names.

This drives the ENDPOINT, not the parser: `tests/test_meh2241_seed_cities_parser.py`
already covers `parse_localities` itself. What is asserted here is that the
handler routes through it — the fixture's published column reaches the `cities`
table instead of producing a silent `{"seeded": 0}` with HTTP 200.

Fails-before / passes-after: against the pre-fix handler the same fixture
yields `seeded == 0` and an empty table, with a 200 either way.
"""

import json
from pathlib import Path

import app.routers.admin as admin_module
from conftest import auth_header, make_user
from sqlalchemy import text

FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "meh2241_datagov_localities_5.json"
)


class _Resp:
    """The two methods the handler calls on an httpx response."""

    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


def test_admin_seed_cities_reads_the_published_locality_column(client, db, monkeypatch):
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    records = payload["result"]["records"]
    # Control: an empty fixture would let a dead handler pass this test.
    assert len(records) >= 1
    assert all("שם_ישוב" in rec for rec in records)

    monkeypatch.setattr(admin_module.httpx, "get", lambda *a, **k: _Resp(payload))

    resp = client.post(
        "/admin/seed-cities", headers=auth_header(make_user(db, role="admin"))
    )

    assert resp.status_code == 200, resp.text
    # THE regression: pre-fix this was 0 — the 1272→0 shape, behind a 200.
    assert resp.json()["seeded"] == len(records)

    rows = (
        db.execute(text("SELECT name_he FROM cities ORDER BY name_he")).scalars().all()
    )
    assert len(rows) == len(records)
    assert "אבו גוש" in rows, rows
    # The dataset pads names to a fixed width; the row must carry the trimmed
    # form, since that is what a person types into the city search.
    assert all(r == r.strip() for r in rows)
