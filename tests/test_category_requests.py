"""MEH-555 — CategoryRequestCreate validation: reject junk text.

POST /category-requests must accept only requested_name values
that contain ≥ 3 Hebrew or Latin letter characters after strip().
"""


def test_punctuation_only_rejected(client):
    """'???' has 0 letter chars → 422."""
    r = client.post("/category-requests", json={"requested_name": "???"})
    assert r.status_code == 422


def test_two_hebrew_letters_rejected(client):
    """'אא' has 2 letter chars → 422 (below the 3-letter threshold)."""
    r = client.post("/category-requests", json={"requested_name": "אא"})
    assert r.status_code == 422


def test_valid_hebrew_accepted(client):
    """'מותססים' has 7 letter chars → 201 (regression: must still work)."""
    r = client.post("/category-requests", json={"requested_name": "מותססים"})
    assert r.status_code == 201


def test_letters_surrounded_by_junk_accepted(client):
    """'   ?abc?   ' has 3 Latin letters after strip+count → 201."""
    r = client.post("/category-requests", json={"requested_name": "   ?abc?   "})
    assert r.status_code == 201
