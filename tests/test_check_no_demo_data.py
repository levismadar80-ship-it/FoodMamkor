"""
Tests for backend/scripts/check_no_demo_data.py (MEH-1199).

The script is READ-ONLY; these tests exercise its `scan()` detection logic
against the shared test DB. They also pin the documented false-positive
behaviour of the "תסס" fermentation marker so a future edit can't silently
drop it (ADR-029 §False-positive analysis).
"""
import importlib.util
import os

from tests.conftest import make_producer, make_user

# Load the script module by path — `backend/scripts/` is not a package, so a
# plain import won't resolve. conftest.py has already put `backend/` on
# sys.path (so `app.*` inside the script resolves) and pointed DATABASE_URL at
# the test DB before this import runs.
_SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backend",
    "scripts",
    "check_no_demo_data.py",
)
_spec = importlib.util.spec_from_file_location("check_no_demo_data", _SCRIPT)
check_no_demo_data = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_no_demo_data)

scan = check_no_demo_data.scan


def test_clean_db_is_clean(db):
    """No demo/test entities → clean=True, zero hits (script would exit 0)."""
    make_producer(db, name="מאפיית רוח השדה")  # a plausible real business name
    result = scan(db)
    assert result["clean"] is True
    assert result["total_hits"] == 0
    assert result["hits"]["producers_admin_notes_demo"] == []
    assert result["hits"]["producers_name_marker"] == []
    assert result["hits"]["users_example_com"] == []


def test_seeded_demo_producer_flagged(db):
    """A producer with 'DEMO …' admin_notes is flagged (script would exit 1)."""
    p = make_producer(db, name="מאפיית רוח השדה")
    p.admin_notes = (
        "DEMO BUSINESS — MEH-1074 Wave 3 'sample perfect listing'. STAGING ONLY."
    )
    db.commit()
    result = scan(db)
    assert result["clean"] is False
    hits = result["hits"]["producers_admin_notes_demo"]
    assert len(hits) == 1
    assert hits[0]["name"] == "מאפיית רוח השדה"
    assert hits[0]["id"] == str(p.id)  # ids are stringified for JSON-safety


def test_example_com_user_flagged(db):
    """Users with @example.com emails are flagged."""
    make_user(db, email="demo-owner@example.com", name="נועה לביא")
    result = scan(db)
    assert result["clean"] is False
    emails = [h["email"] for h in result["hits"]["users_example_com"]]
    assert "demo-owner@example.com" in emails


def test_name_marker_flags_test_producer(db):
    """A producer whose NAME contains a marker ('בדיקה') is flagged."""
    make_producer(db, name="חוות הבדיקה")
    result = scan(db)
    assert result["clean"] is False
    name_hits = result["hits"]["producers_name_marker"]
    assert len(name_hits) == 1
    assert "בדיקה" in name_hits[0]["matched_markers"]


def test_fermentation_marker_is_a_documented_false_positive(db):
    """HONEST DOCUMENTATION (ADR-029): the 'תסס' marker matches a real Israeli
    fermentation business name — 'מאפיית תסס' — because תסס is the root of
    תסיסה (fermentation). This is a genuine false-positive on a plausible real
    business. It is accepted (not dropped) because the script only FLAGS for a
    human and never deletes. This test pins that behaviour so it stays visible.
    """
    make_producer(db, name="מאפיית תסס")
    result = scan(db)
    assert result["clean"] is False
    name_hits = result["hits"]["producers_name_marker"]
    assert len(name_hits) == 1
    assert "תסס" in name_hits[0]["matched_markers"]


def test_description_is_never_matched(db):
    """Markers match NAME only — a clean name with 'test' in the description
    (never exposed to the marker scan) must NOT be flagged."""
    make_producer(db, name="מאפיית רוח השדה")
    # make_producer sets description="Test producer" — contains 'Test'. The
    # name is clean, so no name-marker hit may be produced.
    result = scan(db)
    assert result["hits"]["producers_name_marker"] == []
    assert result["clean"] is True


def test_markers_are_configurable(db):
    """The name-marker list is overridable; a narrower list ignores other
    markers."""
    make_producer(db, name="חוות הבדיקה")  # matches default 'בדיקה'
    # Override to a list that does NOT include 'בדיקה' → no name-marker hit.
    result = scan(db, markers=["twt"])
    assert result["hits"]["producers_name_marker"] == []


def test_multiple_categories_counted_together(db):
    """admin_notes + name + email hits all contribute to total_hits."""
    p = make_producer(db, name="חוות הבדיקה")  # name marker
    p.admin_notes = "DEMO seeded row"  # admin_notes marker
    db.commit()
    make_user(db, email="reviewer@example.com")  # email marker
    result = scan(db)
    assert result["clean"] is False
    assert result["total_hits"] >= 3
