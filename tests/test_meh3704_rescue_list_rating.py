"""MEH-3704 — the public bag list carries the business's public rating, so
the /rescue list can sort by it.

Shown red against a broken build (PR body): the two fields dropped from
`_public_row` -> test_the_list_row_carries_the_rating.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.
from test_rescue import _seed_offer, rescue_on, shop  # noqa: F401


def test_the_list_row_carries_the_rating(client, db, shop, rescue_on):
    producer = shop["location"].producer
    producer.avg_rating = 4.6
    producer.reviews_count = 12
    _seed_offer(db, shop["location"])
    db.commit()

    [row] = client.get("/rescue/offers").json()
    assert row["producer"]["avg_rating"] == 4.6


def test_no_reviews_yet_reads_as_no_rating(client, db, shop, rescue_on):
    producer = shop["location"].producer
    producer.avg_rating = 0
    producer.reviews_count = 0
    _seed_offer(db, shop["location"])
    db.commit()

    [row] = client.get("/rescue/offers").json()
    # None, not 0: the list must sort an unrated business last, not as 0 stars.
    assert row["producer"]["avg_rating"] is None
