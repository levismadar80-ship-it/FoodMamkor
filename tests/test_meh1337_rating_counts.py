"""MEH-1337 — rating distribution counts on the public reviews page.

GET /producers/{id}/reviews returns `rating_counts`: one entry per star 1..5,
counted over every VISIBLE review (not just the current page of 10), so the
Google-style bars on the business page can be drawn from one request.
"""
from conftest import make_producer, make_user
from app.models.models import ProducerReview


def _add(db, producer, stars_list, *, hidden_stars=()):
    for i, s in enumerate(stars_list):
        u = make_user(db, email=f"r{i}@example.com")
        db.add(ProducerReview(producer_id=producer.id, user_id=u.id, stars=s, body="טוב מאוד!"))
    for j, s in enumerate(hidden_stars):
        u = make_user(db, email=f"h{j}@example.com")
        db.add(ProducerReview(producer_id=producer.id, user_id=u.id, stars=s, body="ספאם", is_hidden=True))
    db.commit()


def test_zero_reviews_all_counts_zero(client, db):
    producer = make_producer(db)
    r = client.get(f"/producers/{producer.id}/reviews")
    assert r.status_code == 200, r.text
    assert r.json()["rating_counts"] == {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}


def test_counts_cover_every_page_not_just_the_first(client, db):
    # 12 reviews > PAGE_SIZE (10): page 1 alone could not produce these counts.
    producer = make_producer(db)
    _add(db, producer, [5] * 7 + [4] * 3 + [2] * 2)
    r = client.get(f"/producers/{producer.id}/reviews")
    body = r.json()
    assert len(body["reviews"]) == 10
    assert body["rating_counts"] == {"1": 0, "2": 2, "3": 0, "4": 3, "5": 7}
    assert sum(body["rating_counts"].values()) == body["total"] == 12
    # Same counts on page 2 — they describe the business, not the page.
    assert client.get(f"/producers/{producer.id}/reviews?page=2").json()["rating_counts"] == body["rating_counts"]


def test_hidden_reviews_are_not_counted(client, db):
    producer = make_producer(db)
    _add(db, producer, [5, 5, 4, 3, 3], hidden_stars=[1, 1])
    counts = client.get(f"/producers/{producer.id}/reviews").json()["rating_counts"]
    assert counts["1"] == 0
    assert counts == {"1": 0, "2": 0, "3": 2, "4": 1, "5": 2}


def test_other_businesses_reviews_are_not_counted(client, db):
    a = make_producer(db, name="בית עסק א")
    b = make_producer(db, name="בית עסק ב")
    _add(db, a, [5])
    u = make_user(db, email="x@example.com")
    db.add(ProducerReview(producer_id=b.id, user_id=u.id, stars=1, body="לא טוב בכלל"))
    db.commit()
    assert client.get(f"/producers/{a.id}/reviews").json()["rating_counts"] == {"1": 0, "2": 0, "3": 0, "4": 0, "5": 1}
    assert client.get(f"/producers/{b.id}/reviews").json()["rating_counts"] == {"1": 1, "2": 0, "3": 0, "4": 0, "5": 0}
