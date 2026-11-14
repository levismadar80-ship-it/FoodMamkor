"""MEH-3221 (B10) — the public reviews payload carries no full name, no user_id.

The decision on record is «שם פרטי + אות של משפחה (פרטיות)». Before this card
the server returned `user.name` in full plus `user_id`, and only the browser
shortened the name, so anyone reading the API got every reviewer's full name
and could link one person's reviews across businesses.
"""
import pytest

from conftest import auth_header, make_producer, make_user
from app.models.models import ProducerReview
from app.routers.reviews import public_reviewer_name


@pytest.mark.parametrize(
    ("full", "expected"),
    [
        ("דנה כהן", "דנה כ."),
        ("דנה בת שבע לוי", "דנה ל."),
        ("Sapir", "Sapir"),
        # MEH-2705 parity with formatName: the initial is the first LETTER.
        ("לקוחת בדיקות (QA)", "לקוחת Q."),
        ("דנה כהן -", "דנה כ."),
        ("  ", None),
        (None, None),
    ],
)
def test_public_reviewer_name(full, expected):
    assert public_reviewer_name(full) == expected


def _seed(db):
    author = make_user(db, email="author@test.com", name="רונית כהנוביץ")
    other = make_user(db, email="other@test.com", name="מיכל אברהם")
    producer = make_producer(db)
    db.add(ProducerReview(producer_id=producer.id, user_id=author.id, stars=5, body="טעים מאוד באמת"))
    db.commit()
    return author, other, producer


@pytest.mark.parametrize("path", ["/producers/{pid}/reviews", "/reviews?producer_id={pid}"])
def test_public_get_has_short_name_and_no_user_id(client, db, path):
    author, _other, producer = _seed(db)
    r = client.get(path.format(pid=producer.id))
    assert r.status_code == 200, r.text
    body = r.json()
    row = (body["reviews"] if isinstance(body, dict) else body)[0]
    assert "user_id" not in row
    assert row["user_name"] == "רונית כ."
    assert "כהנוביץ" not in r.text
    assert str(author.id) not in r.text
    assert row["is_mine"] is False  # anonymous viewer


def test_is_mine_only_for_the_author(client, db):
    author, other, producer = _seed(db)
    mine = client.get(f"/producers/{producer.id}/reviews", headers=auth_header(author))
    theirs = client.get(f"/producers/{producer.id}/reviews", headers=auth_header(other))
    assert mine.json()["reviews"][0]["is_mine"] is True
    assert theirs.json()["reviews"][0]["is_mine"] is False
