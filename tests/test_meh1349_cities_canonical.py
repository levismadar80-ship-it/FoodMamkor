"""MEH-1349: GET /cities must never be empty on a fresh DB.

The cities table has no seed path, so before the fix the live endpoint
(backend/app/routers/cities.py) returned [] for every query and
delivery-city selection was impossible. The endpoint now unions the
canonical static list (backend/app/data/cities.py) with DB rows.
"""

from app.models.models import City


def test_cities_prefix_match_on_empty_db(client):
    """Fresh DB (no producers, no cities rows): תל prefix finds תל אביב-יפו."""
    r = client.get("/cities", params={"q": "תל"})
    assert r.status_code == 200
    names = r.json()
    assert "תל אביב-יפו" in names
    assert "תל מונד" in names


def test_cities_no_query_returns_baseline(client):
    """No query on a fresh DB returns the capped canonical baseline, not []."""
    r = client.get("/cities")
    assert r.status_code == 200
    names = r.json()
    assert len(names) == 20
    assert len(set(names)) == len(names)


def test_cities_db_rows_merge_and_dedup(client, db):
    """DB-only city appears alongside static list; overlap dedups to one."""
    db.add(City(name_he="תל עדשים"))  # not in the static list
    db.add(City(name_he="תל אביב-יפו"))  # overlaps the static list
    db.commit()

    r = client.get("/cities", params={"q": "תל"})
    assert r.status_code == 200
    names = r.json()
    assert "תל עדשים" in names
    assert names.count("תל אביב-יפו") == 1


def test_cities_exact_match_first(client):
    """An exact-match query floats the exact name to the front."""
    r = client.get("/cities", params={"q": "יפו"})
    assert r.status_code == 200
    names = r.json()
    assert names[0] == "יפו"


def test_cities_no_match_returns_empty(client):
    """A prefix matching nothing still returns a clean empty list."""
    r = client.get("/cities", params={"q": "זזזז"})
    assert r.status_code == 200
    assert r.json() == []
