"""MEH-375 Chunk I.1 — pytest for cleanup_cloudinary_orphans skeleton.

Covers argparse contract, missing-config exit, and the --batch-size cap.
Pure unit tests — no DB, no Cloudinary network. Live Cloudinary calls
arrive in I.3 / I.5; those tests will mock `cloudinary.api.*`.
"""
import logging

import pytest

from app.models import Event, HomeProduct, Producer, User
from scripts.cleanup_cloudinary_orphans import (
    ARRAY_URL_SOURCES,
    BATCH_SIZE_HARD_CAP,
    DEFAULT_MIN_AGE_HOURS,
    DEFAULT_PREFIXES,
    SCALAR_URL_SOURCES,
    _add_array_urls,
    _add_scalar_urls,
    build_parser,
    build_referenced_url_set,
    main,
)


class TestArgparseDefaults:
    def test_no_flags_uses_spec_defaults(self):
        args = build_parser().parse_args([])
        assert args.apply is False
        assert args.min_age_hours == DEFAULT_MIN_AGE_HOURS == 24
        # Default fill-in happens in main(); parser leaves it None so
        # `action="append"` doesn't accumulate on top of a literal default.
        assert args.prefix is None
        assert args.batch_size == BATCH_SIZE_HARD_CAP == 100

    def test_default_prefixes_constant_is_two_specific_folders(self):
        # Lock the spec: the script defaults to the two folders our uploaders
        # actually write to. mehamakor/producers/* is reserved (story-card,
        # overwrite=True) and is filtered separately by the reject-list.
        assert DEFAULT_PREFIXES == ("mehamakor", "mehamakor/avatars")

    def test_apply_flag_flips_to_true(self):
        args = build_parser().parse_args(["--apply"])
        assert args.apply is True

    def test_repeated_prefix_accumulates(self):
        args = build_parser().parse_args(["--prefix", "foo", "--prefix", "bar"])
        assert args.prefix == ["foo", "bar"]

    def test_help_exits_zero(self, capsys):
        with pytest.raises(SystemExit) as exc:
            build_parser().parse_args(["--help"])
        assert exc.value.code == 0
        out = capsys.readouterr().out
        # Sanity-check the surface is present in --help output. Not asserting
        # exact wording (would re-couple to argparse's formatter).
        for token in ("--apply", "--min-age-hours", "--prefix", "--batch-size"):
            assert token in out, f"--help missing flag {token}"


class TestBatchSizeCap:
    def test_user_value_under_cap_kept(self):
        args = build_parser().parse_args(["--batch-size", "50"])
        assert args.batch_size == 50

    def test_user_value_at_cap_kept(self):
        args = build_parser().parse_args(["--batch-size", "100"])
        assert args.batch_size == 100

    def test_user_value_over_cap_clamped(self):
        # Hard guarantee: the script never asks Cloudinary to delete more
        # than 100 IDs in a single API call regardless of user input.
        args = build_parser().parse_args(["--batch-size", "500"])
        assert args.batch_size == BATCH_SIZE_HARD_CAP == 100

    def test_non_integer_rejected(self):
        with pytest.raises(SystemExit):
            build_parser().parse_args(["--batch-size", "not-a-number"])


class TestMissingCloudinaryConfig:
    def test_empty_cloud_name_exits_zero_with_log(self, monkeypatch, caplog):
        from scripts import cleanup_cloudinary_orphans

        # Wipe the cloud name. Mirror the fail-open posture used by
        # backend/app/cloudinary_utils.py:124 (destroy_image dev fallback)
        # and backend/app/services/oauth_verifiers.py:62 (Google avatar).
        monkeypatch.setattr(
            cleanup_cloudinary_orphans.settings, "cloudinary_cloud_name", ""
        )
        with caplog.at_level(
            logging.INFO, logger="scripts.cleanup_cloudinary_orphans"
        ):
            rc = main([])
        assert rc == 0
        assert any(
            "not configured" in record.message for record in caplog.records
        ), f"expected 'not configured' log, saw: {[r.message for r in caplog.records]}"

    def test_none_cloud_name_exits_zero(self, monkeypatch):
        from scripts import cleanup_cloudinary_orphans

        monkeypatch.setattr(
            cleanup_cloudinary_orphans.settings, "cloudinary_cloud_name", None
        )
        rc = main([])
        assert rc == 0


class TestPrefixDefaultPostFill:
    def test_main_fills_default_prefixes_when_none_provided(
        self, monkeypatch, caplog
    ):
        # main() emits a "Parsed args: ... prefix=[...]" INFO line after
        # post-filling, but only on the configured path. Stub the lazy
        # cloudinary import so config(...) doesn't reach the network.
        from scripts import cleanup_cloudinary_orphans

        monkeypatch.setattr(
            cleanup_cloudinary_orphans.settings,
            "cloudinary_cloud_name",
            "test-cloud",
        )
        monkeypatch.setattr(
            cleanup_cloudinary_orphans.settings, "cloudinary_api_key", "key"
        )
        monkeypatch.setattr(
            cleanup_cloudinary_orphans.settings,
            "cloudinary_api_secret",
            "secret",
        )
        # Stub `import cloudinary` inside main() — the SDK is a real dep,
        # but we don't want config() to do anything observable.
        import sys
        import types

        fake_cloudinary = types.ModuleType("cloudinary")
        fake_cloudinary.config = lambda **kwargs: None  # type: ignore[attr-defined]
        monkeypatch.setitem(sys.modules, "cloudinary", fake_cloudinary)

        with caplog.at_level(
            logging.INFO, logger="scripts.cleanup_cloudinary_orphans"
        ):
            rc = main([])
        assert rc == 0
        msgs = [r.message for r in caplog.records]
        assert any(
            "prefix=['mehamakor', 'mehamakor/avatars']" in m for m in msgs
        ), f"expected default prefixes in log, saw: {msgs}"


# ---------- I.2: referenced-set DB query ----------


class TestSourceConstants:
    """Lock the 8-source list. Drift in either tuple = silent miss in cleanup."""

    def test_scalar_sources_is_six_specific_columns(self):
        # Compare on InstrumentedAttribute identity via .key attribute, which
        # is the column name on the parent model. SQLA InstrumentedAttribute
        # __eq__ produces a SQL expression, not a bool — never compare those
        # directly in a test.
        keys = [(c.parent.entity.__name__, c.key) for c in SCALAR_URL_SOURCES]
        assert keys == [
            ("User", "avatar_url"),
            ("Producer", "story_card_url"),
            ("Product", "image_url"),
            ("HomeProduct", "photo"),
            ("Event", "image_url"),
            ("Experience", "image_url"),
        ]

    def test_array_sources_is_two_specific_columns(self):
        keys = [(c.parent.entity.__name__, c.key) for c in ARRAY_URL_SOURCES]
        assert keys == [
            ("Producer", "images"),
            ("HomeProduct", "images"),
        ]

    def test_total_source_count_is_eight(self):
        # Phase 1 spec lock: 6 scalar + 2 array = 8 referenced-set sources.
        assert len(SCALAR_URL_SOURCES) + len(ARRAY_URL_SOURCES) == 8


class TestAddScalarUrls:
    def test_url_added(self):
        target: set[str] = set()
        _add_scalar_urls(target, [("https://res.cloudinary.com/x/a.jpg",)])
        assert target == {"https://res.cloudinary.com/x/a.jpg"}

    def test_none_skipped(self):
        target: set[str] = set()
        _add_scalar_urls(target, [(None,), ("https://x/a.jpg",)])
        assert target == {"https://x/a.jpg"}

    def test_empty_string_skipped(self):
        target: set[str] = set()
        _add_scalar_urls(target, [("",), ("https://x/a.jpg",)])
        assert target == {"https://x/a.jpg"}

    def test_dedup_within_single_call(self):
        target: set[str] = set()
        _add_scalar_urls(target, [("u",), ("u",), ("u",)])
        assert target == {"u"}

    def test_dedup_against_preexisting(self):
        target: set[str] = {"existing"}
        _add_scalar_urls(target, [("existing",), ("new",)])
        assert target == {"existing", "new"}

    def test_empty_rows_no_change(self):
        target: set[str] = {"keep"}
        _add_scalar_urls(target, [])
        assert target == {"keep"}


class TestAddArrayUrls:
    def test_array_flattened(self):
        target: set[str] = set()
        _add_array_urls(target, [(["a", "b", "c"],)])
        assert target == {"a", "b", "c"}

    def test_none_array_skipped(self):
        # producers.images / home_products.images can be NULL despite the
        # `default=[]` declaration (existing rows pre-MEH-375 may have NULL).
        target: set[str] = set()
        _add_array_urls(target, [(None,), (["a"],)])
        assert target == {"a"}

    def test_empty_array_skipped(self):
        target: set[str] = set()
        _add_array_urls(target, [([],), (["a"],)])
        assert target == {"a"}

    def test_none_entries_within_array_skipped(self):
        # PG text[] permits NULL entries inside the array.
        target: set[str] = set()
        _add_array_urls(target, [([None, "a", None, "b"],)])
        assert target == {"a", "b"}

    def test_empty_string_entries_within_array_skipped(self):
        target: set[str] = set()
        _add_array_urls(target, [(["", "a", ""],)])
        assert target == {"a"}

    def test_dedup_across_arrays(self):
        target: set[str] = set()
        _add_array_urls(target, [(["a", "b"],), (["b", "c"],)])
        assert target == {"a", "b", "c"}


class TestBuildReferencedUrlSet:
    """Integration via session stub. Maps each column object to canned rows;
    asserts the orchestrator queries every source and unions the results.
    Sandbox-runnable — no real DB."""

    def _stub_session(self, by_col: dict):
        class _Query:
            def __init__(self, rows):
                self._rows = rows

            def filter(self, *args, **kwargs):
                # build_referenced_url_set passes col.isnot(None); the stub
                # ignores the filter expression — canned rows already exclude
                # the NULL row that the SQL filter would have removed.
                return self

            def __iter__(self):
                return iter(self._rows)

        class _Session:
            def __init__(self, table):
                self._table = table

            def query(self, col):
                if col not in self._table:
                    raise AssertionError(
                        f"build_referenced_url_set queried an unexpected "
                        f"column: {col.parent.entity.__name__}.{col.key}"
                    )
                return _Query(self._table[col])

        return _Session(by_col)

    def _empty_table(self) -> dict:
        """One empty rowset per source — minimum to satisfy the stub
        coverage assertion."""
        return {col: [] for col in SCALAR_URL_SOURCES + ARRAY_URL_SOURCES}

    def test_all_eight_sources_queried_with_empty_data(self):
        # If build_referenced_url_set ever skips a source, the stub raises
        # AssertionError on the missing key — but here every source is
        # populated with [], so a clean run proves all 8 queries fired.
        db = self._stub_session(self._empty_table())
        assert build_referenced_url_set(db) == set()

    def test_scalar_and_array_sources_combine(self):
        table = self._empty_table()
        table[User.avatar_url] = [("https://x/avatar.jpg",)]
        table[Producer.images] = [(["https://x/p1.jpg", "https://x/p2.jpg"],)]
        table[HomeProduct.images] = [(["https://x/h1.jpg"],)]
        table[Event.image_url] = [("https://x/event.jpg",)]
        db = self._stub_session(table)
        assert build_referenced_url_set(db) == {
            "https://x/avatar.jpg",
            "https://x/p1.jpg",
            "https://x/p2.jpg",
            "https://x/h1.jpg",
            "https://x/event.jpg",
        }

    def test_dedup_across_sources(self):
        # Same URL appearing in multiple columns collapses to one entry.
        # Real-world: producer.images[0] mirrored as producer.story_card_url
        # base, or product.image_url reused as home_product.photo by the user.
        table = self._empty_table()
        shared = "https://x/shared.jpg"
        table[User.avatar_url] = [(shared,)]
        table[Producer.story_card_url] = [(shared,)]
        table[Producer.images] = [([shared, "https://x/other.jpg"],)]
        db = self._stub_session(table)
        result = build_referenced_url_set(db)
        assert result == {shared, "https://x/other.jpg"}
        assert len(result) == 2

    def test_none_and_empty_filtered_across_all_sources(self):
        table = self._empty_table()
        # Build a URL keyed on (model, column) — multiple columns share
        # the simple name `image_url` (Product/Event/Experience) and
        # `images` (Producer/HomeProduct), so model-qualified URLs are
        # required for the per-source uniqueness assertion.
        def _url(col):
            return f"https://x/{col.parent.entity.__name__}-{col.key}.jpg"

        # Scalar sources contribute None / "" / real URL each.
        for col in SCALAR_URL_SOURCES:
            table[col] = [(None,), ("",), (_url(col),)]
        # Array sources contribute one None array, one empty array, one
        # mixed-content array.
        for col in ARRAY_URL_SOURCES:
            table[col] = [(None,), ([],), ([None, _url(col), ""],)]
        db = self._stub_session(table)
        result = build_referenced_url_set(db)
        # 6 scalar sources + 2 array sources, each contributing exactly 1 URL.
        assert len(result) == 8
        for col in SCALAR_URL_SOURCES + ARRAY_URL_SOURCES:
            assert _url(col) in result
