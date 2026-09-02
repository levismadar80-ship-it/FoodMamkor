"""MEH-2241 chunk 0 — `scripts/seed_cities.py` parsed 0 of 1272 records.

Railway staging, 02/09 12:34Z (log on MEH-2227 §4יא): ``Received 1272 records``
then ``WARNING No cities fetched — nothing to insert``. The parser read the
locality name from ``שם_יישוב`` / ``SHEM_YISHUV`` only; the data.gov.il
resource does not carry either key, so every record was skipped and the
script exited 0 having inserted nothing — and without logging which keys the
records DID carry.

Fixture: ``tests/fixtures/meh2241_datagov_localities_5.json``, the shape of a
``datastore_search?limit=5`` response. **It is written from the resource's
published schema, not captured live** — data.gov.il is egress-blocked from the
CC sandbox and absent from the WebFetch allowlist (see the fixture's
``__provenance__``). Every test below reads whatever the file holds, so
dropping in a real capture re-validates the parser against the true shape
with no test edit.

Fails-before / passes-after (MEH-1619): against the pre-fix parser the
fixture yields 0 cities and the unknown-key payload raises nothing — both
runs recorded in the PR body.
"""

import importlib.util
import json
from pathlib import Path

import pytest
from sqlalchemy import text

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "meh2241_datagov_localities_5.json"
SCRIPT = ROOT / "backend" / "scripts" / "seed_cities.py"


@pytest.fixture(scope="module")
def seed_cities():
    # Load by path rather than sys.path.insert (precedent:
    # tests/test_meh1979_public_rate_limits.py). The script's own shim only
    # inserts backend/ when it is missing, and conftest already put it there.
    spec = importlib.util.spec_from_file_location("meh2241_seed_cities", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def payload() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _fixture_records(payload: dict) -> list[dict]:
    return payload["result"]["records"]


# ── the captured shape ────────────────────────────────────────────────────


def test_fixture_is_a_datastore_search_response_with_records(payload):
    """Control for every test below: an empty or malformed fixture would let
    a dead parser pass. The file must hold ≥1 record and a `fields` schema."""
    records = _fixture_records(payload)
    assert payload["result"]["resource_id"] == "d4901968-dad3-4845-a9b0-a57d027f11ab"
    assert len(records) >= 1
    assert payload["result"]["fields"], "CKAN schema missing from fixture"


def test_every_fixture_record_parses_to_a_trimmed_hebrew_name(seed_cities, payload):
    """THE regression: pre-fix, this fixture parsed to 0 (the 1272→0 shape)."""
    records = _fixture_records(payload)
    cities = seed_cities.parse_localities(payload)

    assert len(cities) == len(records)
    for city in cities:
        name = city["name_he"]
        assert name == name.strip() and "  " not in name, name
        assert any("א" <= ch <= "ת" for ch in name), f"not Hebrew: {name!r}"
        assert name not in ("None", "")


def test_fixture_first_record_name(seed_cities, payload):
    """Anchor to one concrete value so a parser that returns the wrong column
    (e.g. the Latin-script twin) cannot pass on shape alone."""
    cities = seed_cities.parse_localities(payload)
    assert cities[0]["name_he"] == "אבו גוש"
    # The localities resource carries no coordinates.
    assert cities[0]["lat"] is None and cities[0]["lng"] is None


# ── the failure that was silent ───────────────────────────────────────────


def test_records_with_no_name_column_raise_and_name_the_keys(seed_cities):
    """Pre-fix: 1272 records, no matching key → WARNING + exit 0. Now: an
    error whose message carries the keys, so the next log IS the Phase 0."""
    bad = {
        "result": {
            "fields": [{"id": "_id", "type": "int"}, {"id": "foo", "type": "text"}],
            "records": [{"_id": i, "foo": f"x{i}"} for i in range(3)],
        }
    }
    with pytest.raises(seed_cities.LocalityParseError) as exc:
        seed_cities.parse_localities(bad)
    assert "3 records received" in str(exc.value)
    assert "'foo'" in str(exc.value) and "'_id'" in str(exc.value)


def test_name_column_present_but_every_value_empty_raises(seed_cities):
    payload = {
        "result": {
            "records": [{"שם_ישוב": "   "}, {"שם_ישוב": None}, {"שם_ישוב": ""}],
        }
    }
    with pytest.raises(seed_cities.LocalityParseError):
        seed_cities.parse_localities(payload)


def test_empty_records_is_not_an_error(seed_cities):
    """Zero records is a different world from 'records but no names'; the
    caller keeps its 'nothing to insert' warning for that one."""
    assert seed_cities.parse_localities({"result": {"records": []}}) == []
    assert seed_cities.parse_localities({}) == []


# ── key discovery ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "key",
    ["שם_ישוב", "שם_יישוב", "SHEM_YISHUV", "shem_yishuv", " שם_ישוב "],
    ids=[
        "published-one-yod",
        "legacy-two-yods",
        "latin-upper",
        "latin-lower",
        "padded-id",
    ],
)
def test_every_known_spelling_of_the_name_key_parses(seed_cities, key):
    payload = {"result": {"records": [{key: " כפר סבא  "}]}}
    assert seed_cities.parse_localities(payload) == [
        {"name_he": "כפר סבא", "lat": None, "lng": None}
    ]


@pytest.mark.parametrize("key", ["שמישוב", "שמיישוב", "שם ישוב", "SHEMYISHUV"])
def test_undocumented_spellings_without_the_underscore_are_rejected(seed_cities, key):
    """CI reviewer, PR #3288 round 4: the separator is part of every known
    column name; an optional underscore would admit forms nobody publishes."""
    with pytest.raises(seed_cities.LocalityParseError):
        seed_cities.parse_localities({"result": {"records": [{key: "כפר סבא"}]}})


def test_latin_script_name_column_is_never_chosen(seed_cities):
    """`שם_ישוב_לועזי` shares the prefix; a loose match would seed English."""
    payload = {
        "result": {
            "fields": [{"id": "שם_ישוב_לועזי"}, {"id": "שם_ישוב"}],
            "records": [{"שם_ישוב_לועזי": "KFAR SAVA", "שם_ישוב": "כפר סבא"}],
        }
    }
    assert seed_cities.parse_localities(payload)[0]["name_he"] == "כפר סבא"

    only_latin = {"result": {"records": [{"שם_ישוב_לועזי": "KFAR SAVA"}]}}
    with pytest.raises(seed_cities.LocalityParseError):
        seed_cities.parse_localities(only_latin)


def test_schema_fields_win_over_record_keys(seed_cities):
    """When `fields` names the column, a stray record-level lookalike does
    not redirect the parse."""
    payload = {
        "result": {
            "fields": [{"id": "שם_ישוב"}],
            "records": [{"SHEM_YISHUV": "wrong", "שם_ישוב": "נהריה"}],
        }
    }
    assert seed_cities.parse_localities(payload)[0]["name_he"] == "נהריה"


def test_padded_schema_id_resolves_to_the_unpadded_record_key(seed_cities):
    """CI reviewer, PR #3288 round 3: a `fields` id with stray whitespace used
    to be returned verbatim, so `rec.get(" שם_ישוב ")` missed every record and
    the error read "every value was empty" — a key mismatch dressed as empty
    data. The discovered key must be one the records actually carry."""
    payload = {
        "result": {
            "fields": [{"id": " שם_ישוב "}],
            "records": [{"שם_ישוב": "אילת"}, {"שם_ישוב": "מצפה רמון"}],
        }
    }
    cities = seed_cities.parse_localities(payload)
    assert [c["name_he"] for c in cities] == ["אילת", "מצפה רמון"]


def test_schema_id_absent_from_records_falls_through_to_record_keys(seed_cities):
    """`fields` names a column the records do not carry; the record-key scan
    still finds the real one instead of trusting the schema blindly."""
    payload = {
        "result": {
            "fields": [{"id": "שם_ישוב"}],
            "records": [{"SHEM_YISHUV": "דימונה"}],
        }
    }
    assert seed_cities.parse_localities(payload)[0]["name_he"] == "דימונה"


def test_schema_id_absent_and_no_record_key_reports_a_key_mismatch(seed_cities):
    """Neither the schema id nor any record key resolves → the error names the
    KEYS (a mismatch), not "every value was empty"."""
    payload = {
        "result": {
            "fields": [{"id": "שם_ישוב"}],
            "records": [{"_id": 1, "name": "x"}],
        }
    }
    with pytest.raises(seed_cities.LocalityParseError) as exc:
        seed_cities.parse_localities(payload)
    assert "none carries a locality-name column" in str(exc.value)
    assert "every value was empty" not in str(exc.value)


def test_coordinates_read_when_present_and_tolerate_garbage(seed_cities):
    payload = {
        "result": {
            "records": [
                {"שם_ישוב": "חיפה", "lat": "32.79", "lon": "34.98"},
                {"שם_ישוב": "עכו", "Y": "32.92", "X": "35.07"},
                {"שם_ישוב": "צפת", "lat": "n/a", "lon": "n/a"},
            ]
        }
    }
    cities = seed_cities.parse_localities(payload)
    assert (cities[0]["lat"], cities[0]["lng"]) == (32.79, 34.98)
    assert (cities[1]["lat"], cities[1]["lng"]) == (32.92, 35.07)
    assert (cities[2]["lat"], cities[2]["lng"]) == (None, None)


# ── end to end against the test DB ────────────────────────────────────────


def test_seed_inserts_the_fixture_and_is_idempotent(
    seed_cities, payload, db, monkeypatch
):
    """Drive `seed()` with the fixture in place of the network: N rows land,
    a second run inserts 0 and leaves N — the property the card relies on
    when Sapir re-runs on Railway."""
    monkeypatch.setattr(seed_cities, "_fetch_payload", lambda: payload)
    n = len(_fixture_records(payload))

    assert seed_cities.seed() == n
    rows = (
        db.execute(text("SELECT name_he FROM cities ORDER BY name_he")).scalars().all()
    )
    assert len(rows) == n
    assert "אבו גוש" in rows
    assert all(r == r.strip() for r in rows)

    assert seed_cities.seed() == 0
    assert db.execute(text("SELECT count(*) FROM cities")).scalar() == n


def test_seed_with_unparseable_records_raises_instead_of_exiting_clean(
    seed_cities, db, monkeypatch
):
    """The staging failure, end to end: records arrive, none parse → the run
    fails loudly and the table stays untouched."""
    monkeypatch.setattr(
        seed_cities,
        "_fetch_payload",
        lambda: {"result": {"records": [{"_id": 1, "foo": "bar"}] * 4}},
    )
    with pytest.raises(seed_cities.LocalityParseError):
        seed_cities.seed()
    assert db.execute(text("SELECT count(*) FROM cities")).scalar() == 0
