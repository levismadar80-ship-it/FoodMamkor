"""MEH-3415 — search survives the wrong keyboard layout, niqqud and final letters.

Sapir 15/11: typing a Hebrew word while the keyboard is on English ("sca" for
"דבש") found nothing. Unit cases pin the SI 1452 mapping; endpoint cases pin
that the fallback runs only on a miss and reports what it searched for.
"""

from app.utils.hebrew_search import layout_alternative, normalise, token_variants
from conftest import make_producer


class TestLayoutAlternative:
    def test_latin_slip_to_hebrew(self):
        assert layout_alternative("sca") == "דבש"
        assert layout_alternative("dchbv") == "גבינה"
        # the brand name itself — a real repo string (frontend/messages/he.json)
        assert layout_alternative("nvneur") == "מהמקור"

    def test_uppercase_and_spaces(self):
        assert layout_alternative("Sca  dchbv") == "דבש גבינה"

    def test_final_letter_keys(self):
        # o -> ם, i -> ן: "שלום" is typed "akuo"
        assert layout_alternative("akuo") == "שלום"

    def test_hebrew_slip_to_latin(self):
        assert layout_alternative("נרקשג") == "bread"

    def test_too_short_is_not_converted(self):
        assert layout_alternative("ok") is None
        assert layout_alternative("שנ") is None

    def test_one_letter_token_is_not_converted(self):
        assert layout_alternative("ab c") is None

    def test_mixed_scripts_are_not_converted(self):
        assert layout_alternative("sca תל") is None

    def test_punctuation_only_is_not_converted(self):
        assert layout_alternative(",./;") is None


class TestNormalise:
    def test_drops_niqqud(self):
        assert normalise("גְּבִינָה") == "גבינה"

    def test_geresh_and_mid_word_final_left_alone(self):
        # a stored name may hold a real ׳ or a compound with a mid-word final
        assert normalise("צ׳יפס אבןעזרא") == "צ׳יפס אבןעזרא"

    def test_final_form_is_a_variant_not_a_replacement(self):
        variants = token_variants("שלומ")
        assert "שלום" in variants  # reaches "שלום"
        assert "שלומ" in variants  # still reaches "שלומית"


class TestSmartSearchLayoutFallback:
    def test_wrong_layout_finds_the_hebrew_word(self, client, db):
        make_producer(db, name="דבש הגליל", city="צפת")
        body = client.get("/search?q=sca").json()
        assert [p["name"] for p in body["producers"]] == ["דבש הגליל"]
        assert body["corrected_query"] == "דבש"

    def test_as_typed_skips_the_layout_read(self, client, db):
        make_producer(db, name="דבש הגליל", city="צפת")
        body = client.get("/search?q=sca&as_typed=true").json()
        assert body["producers"] == []
        assert body["corrected_query"] is None

    def test_query_with_results_is_not_rewritten(self, client, db):
        make_producer(db, name="sca farm", city="צפת")
        make_producer(db, name="דבש הגליל", city="צפת")
        body = client.get("/search?q=sca").json()
        assert [p["name"] for p in body["producers"]] == ["sca farm"]
        assert body["corrected_query"] is None

    def test_no_results_either_way(self, client, db):
        make_producer(db, name="דבש הגליל", city="צפת")
        body = client.get("/search?q=zzzq").json()
        assert body["producers"] == [] and body["categories"] == []
        assert body["corrected_query"] is None

    def test_brand_name_on_english_keyboard(self, client, db):
        make_producer(db, name="מהמקור לדוגמה", city="צפת")
        body = client.get("/search?q=nvneur").json()
        assert [p["name"] for p in body["producers"]] == ["מהמקור לדוגמה"]
        assert body["corrected_query"] == "מהמקור"

    def test_english_name_on_hebrew_keyboard(self, client, db):
        make_producer(db, name="bread house", city="צפת")
        body = client.get("/search", params={"q": "נרקשג"}).json()
        assert [p["name"] for p in body["producers"]] == ["bread house"]
        assert body["corrected_query"] == "bread"

    def test_stored_geresh_still_matches(self, client, db):
        make_producer(db, name="צ׳יפס הכפר", city="צפת")
        body = client.get("/search", params={"q": "צ׳יפס"}).json()
        assert [p["name"] for p in body["producers"]] == ["צ׳יפס הכפר"]

    def test_niqqud_query_matches(self, client, db):
        make_producer(db, name="גבינה מהכפר", city="צפת")
        body = client.get("/search", params={"q": "גְּבִינָה"}).json()
        assert [p["name"] for p in body["producers"]] == ["גבינה מהכפר"]


class TestProducersLayoutFallback:
    def test_listing_wrong_layout(self, client, db):
        make_producer(db, name="דבש הגליל", city="צפת")
        make_producer(db, name="מחלבה", city="חיפה")
        resp = client.get("/producers?q=sca")
        assert resp.status_code == 200
        assert [p["name"] for p in resp.json()] == ["דבש הגליל"]
        assert resp.headers["X-Total-Count"] == "1"

    def test_listing_as_typed_wins(self, client, db):
        make_producer(db, name="sca farm", city="צפת")
        make_producer(db, name="דבש הגליל", city="צפת")
        names = [p["name"] for p in client.get("/producers?q=sca").json()]
        assert names == ["sca farm"]

    def test_listing_no_results_either_way(self, client, db):
        make_producer(db, name="דבש הגליל", city="צפת")
        resp = client.get("/producers?q=zzzq")
        assert resp.json() == []
        assert resp.headers["X-Total-Count"] == "0"

    def test_listing_niqqud(self, client, db):
        make_producer(db, name="גבינה מהכפר", city="צפת")
        names = [
            p["name"] for p in client.get("/producers", params={"q": "גְּבִינָה"}).json()
        ]
        assert names == ["גבינה מהכפר"]
