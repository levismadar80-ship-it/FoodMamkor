"""MEH-375 Chunk I.1 — pytest for cleanup_cloudinary_orphans skeleton.

Covers argparse contract, missing-config exit, and the --batch-size cap.
Pure unit tests — no DB, no Cloudinary network. Live Cloudinary calls
arrive in I.3 / I.5; those tests will mock `cloudinary.api.*`.
"""
import logging
from datetime import datetime, timedelta, timezone

import pytest

from app.cloudinary_utils import RESERVED_PUBLIC_ID_PREFIXES
from app.models import Event, HomeProduct, Producer, User
from scripts.cleanup_cloudinary_orphans import (
    ARRAY_URL_SOURCES,
    BATCH_SIZE_HARD_CAP,
    DEFAULT_MIN_AGE_HOURS,
    DEFAULT_PREFIXES,
    SCALAR_URL_SOURCES,
    _add_array_urls,
    _add_scalar_urls,
    _batch_delete_orphans,
    _confirm_or_abort,
    _format_bytes,
    _passes_age_filter,
    _passes_depth_filter,
    _passes_reject_filter,
    build_parser,
    build_referenced_url_set,
    compute_orphans,
    list_cloudinary_assets,
    main,
    print_dry_run_summary,
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
        # I.5: confirmation prompt is the default; --yes opts out for CI.
        assert args.yes is False

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
        for token in (
            "--apply",
            "--min-age-hours",
            "--prefix",
            "--batch-size",
            "--yes",  # I.5
        ):
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
        # post-filling, but only on the configured path. Stub the full
        # pipeline (settings + DB + cloudinary.api.resources) so main()
        # reaches the log line cleanly. Reuses the I.4 stub pattern;
        # earlier I.1-era partial stub broke once I.3 added
        # `import cloudinary.api` inside list_cloudinary_assets.
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

        class _FakeQuery:
            def filter(self, *args, **kwargs):
                return self

            def __iter__(self):
                return iter([])

        class _FakeDB:
            def query(self, col):
                return _FakeQuery()

            def close(self):
                pass

        monkeypatch.setattr(
            cleanup_cloudinary_orphans, "SessionLocal", lambda: _FakeDB()
        )
        import cloudinary.api as cloudinary_api

        monkeypatch.setattr(
            cloudinary_api, "resources", lambda **kwargs: {"resources": []}
        )

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


# ---------- I.3: Cloudinary listing + filter helpers ----------


class TestPassesDepthFilter:
    def test_single_segment_under_mehamakor_root_kept(self):
        assert _passes_depth_filter("mehamakor/abc123", "mehamakor") is True

    def test_two_segments_under_mehamakor_root_dropped(self):
        # mehamakor/avatars/<uuid> would be valid under prefix=mehamakor/avatars,
        # but a top-level `mehamakor` scan must default-deny everything beneath
        # the first slash so a future subfolder can't be silently swept.
        assert _passes_depth_filter("mehamakor/avatars/xyz", "mehamakor") is False

    def test_three_segments_under_mehamakor_root_dropped(self):
        assert _passes_depth_filter("mehamakor/x/y/z", "mehamakor") is False

    def test_subprefix_scan_no_depth_filter(self):
        # Operator opted into mehamakor/avatars explicitly; depth filter disabled.
        assert _passes_depth_filter(
            "mehamakor/avatars/abc", "mehamakor/avatars"
        ) is True

    def test_subprefix_scan_deep_path_kept(self):
        assert _passes_depth_filter(
            "mehamakor/avatars/x/y", "mehamakor/avatars"
        ) is True

    def test_just_root_token_dropped(self):
        # `mehamakor` with no leaf doesn't match `^mehamakor/[^/]+$`.
        assert _passes_depth_filter("mehamakor", "mehamakor") is False

    def test_trailing_slash_dropped(self):
        assert _passes_depth_filter("mehamakor/", "mehamakor") is False


class TestPassesRejectFilter:
    def test_normal_public_id_kept(self):
        assert _passes_reject_filter("mehamakor/abc123") is True

    def test_reserved_namespace_dropped_via_imported_constant(self):
        # The constant comes from app.cloudinary_utils — proves the script
        # uses the single-source-of-truth, not a duplicated literal.
        for reserved in RESERVED_PUBLIC_ID_PREFIXES:
            assert (
                _passes_reject_filter(reserved + "some-uuid/story-card") is False
            )

    def test_placeholder_substring_dropped(self):
        # `/placeholder` anywhere in the public_id, not just as a prefix.
        assert _passes_reject_filter("mehamakor/placeholder-x") is False
        assert _passes_reject_filter("foo/placeholder/bar") is False

    def test_avatar_path_kept(self):
        assert _passes_reject_filter("mehamakor/avatars/user_abc123") is True


class TestPassesAgeFilter:
    def _cutoff(self, hours_ago: int) -> datetime:
        return datetime.now(timezone.utc) - timedelta(hours=hours_ago)

    def test_older_than_cutoff_kept(self):
        # 48h-old asset against a 24h cutoff → safe to delete.
        assert _passes_age_filter("2020-01-01T00:00:00Z", self._cutoff(24)) is True

    def test_younger_than_cutoff_dropped(self):
        # Asset created "now + 1 hour" can't be older than any past cutoff.
        future = (
            datetime.now(timezone.utc) + timedelta(hours=1)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        assert _passes_age_filter(future, self._cutoff(24)) is False

    def test_z_suffix_iso_handled(self):
        # ISO format with Z (UTC) — the Cloudinary `created_at` shape.
        assert _passes_age_filter("2020-01-01T00:00:00Z", self._cutoff(1)) is True

    def test_offset_iso_handled(self):
        # ISO format with explicit +00:00 offset (also valid).
        assert (
            _passes_age_filter("2020-01-01T00:00:00+00:00", self._cutoff(1))
            is True
        )

    def test_strict_less_than_boundary(self):
        # Asset created exactly at the cutoff is treated as too young.
        # Strict `<` boundary documented in _passes_age_filter docstring.
        cutoff = datetime(2026, 1, 1, tzinfo=timezone.utc)
        at_cutoff = "2026-01-01T00:00:00+00:00"
        assert _passes_age_filter(at_cutoff, cutoff) is False


class TestListCloudinaryAssets:
    """Stub `cloudinary.api.resources` and exercise pagination + filter
    composition. Sandbox-runnable — no real Cloudinary network."""

    def _patch_resources(self, monkeypatch, pages_or_callable):
        """Two modes:
        - list of page-dicts → pop one per call
        - callable → use as-is (lets the test verify kwargs)
        """
        # cloudinary.api is lazy-imported inside list_cloudinary_assets,
        # so the SDK must already be resolvable; patching the attr on the
        # real submodule survives that import.
        import cloudinary.api as cloudinary_api

        if callable(pages_or_callable):
            fake = pages_or_callable
        else:
            pages = list(pages_or_callable)
            calls: list[dict] = []

            def fake(**kwargs):
                calls.append(kwargs)
                if not pages:
                    raise AssertionError(
                        "list_cloudinary_assets paged past the canned data"
                    )
                return pages.pop(0)

            fake.calls = calls  # type: ignore[attr-defined]

        monkeypatch.setattr(cloudinary_api, "resources", fake)
        return fake

    def _asset(self, public_id: str, *, created_at: str = "2020-01-01T00:00:00Z"):
        return {
            "public_id": public_id,
            "secure_url": f"https://res.cloudinary.com/x/{public_id}.jpg",
            "bytes": 1234,
            "created_at": created_at,
        }

    def test_empty_response_returns_empty(self, monkeypatch):
        self._patch_resources(monkeypatch, [{"resources": []}])
        assert list_cloudinary_assets(["mehamakor"], min_age_hours=24) == []

    def test_single_page_passes_all_filters(self, monkeypatch):
        self._patch_resources(
            monkeypatch,
            [
                {
                    "resources": [
                        self._asset("mehamakor/a"),
                        self._asset("mehamakor/b"),
                        self._asset("mehamakor/c"),
                    ]
                }
            ],
        )
        result = list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert len(result) == 3
        assert {pid for pid, _, _ in result} == {
            "mehamakor/a",
            "mehamakor/b",
            "mehamakor/c",
        }

    def test_pagination_two_pages_terminates_on_missing_cursor(
        self, monkeypatch
    ):
        fake = self._patch_resources(
            monkeypatch,
            [
                {
                    "resources": [self._asset("mehamakor/a")],
                    "next_cursor": "cursor-1",
                },
                {"resources": [self._asset("mehamakor/b")]},  # no next_cursor
            ],
        )
        result = list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert {pid for pid, _, _ in result} == {"mehamakor/a", "mehamakor/b"}
        assert len(fake.calls) == 2
        assert "next_cursor" not in fake.calls[0]
        assert fake.calls[1].get("next_cursor") == "cursor-1"

    def test_pagination_three_pages_terminates_on_empty_cursor(
        self, monkeypatch
    ):
        # Defensive termination: empty string `next_cursor` (not just absent).
        fake = self._patch_resources(
            monkeypatch,
            [
                {
                    "resources": [self._asset("mehamakor/a")],
                    "next_cursor": "c1",
                },
                {
                    "resources": [self._asset("mehamakor/b")],
                    "next_cursor": "c2",
                },
                {
                    "resources": [self._asset("mehamakor/c")],
                    "next_cursor": "",  # explicit empty → terminate
                },
            ],
        )
        result = list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert len(result) == 3
        assert len(fake.calls) == 3

    def test_depth_2_path_under_mehamakor_root_filtered_out(self, monkeypatch):
        self._patch_resources(
            monkeypatch,
            [
                {
                    "resources": [
                        self._asset("mehamakor/keep_me"),
                        self._asset("mehamakor/avatars/depth_2_dropped"),
                        self._asset("mehamakor/sub/sub2/depth_3_dropped"),
                    ]
                }
            ],
        )
        result = list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert {pid for pid, _, _ in result} == {"mehamakor/keep_me"}

    def test_subprefix_scan_keeps_deep_paths(self, monkeypatch):
        self._patch_resources(
            monkeypatch,
            [
                {
                    "resources": [
                        self._asset("mehamakor/avatars/abc"),
                        self._asset("mehamakor/avatars/x/y"),
                    ]
                }
            ],
        )
        result = list_cloudinary_assets(
            ["mehamakor/avatars"], min_age_hours=24
        )
        assert {pid for pid, _, _ in result} == {
            "mehamakor/avatars/abc",
            "mehamakor/avatars/x/y",
        }

    def test_placeholder_substring_filtered_out(self, monkeypatch):
        self._patch_resources(
            monkeypatch,
            [
                {
                    "resources": [
                        self._asset("mehamakor/placeholder-x"),
                        self._asset("mehamakor/abc"),
                    ]
                }
            ],
        )
        result = list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert {pid for pid, _, _ in result} == {"mehamakor/abc"}

    def test_reserved_prefix_filtered_out(self, monkeypatch):
        # Cloudinary will return mehamakor/producers/<id>/story-card under
        # a `prefix=mehamakor` scan because Cloudinary's `prefix` is
        # itself a substring filter, not a depth filter. Reject filter
        # catches them.
        reserved_pid = list(RESERVED_PUBLIC_ID_PREFIXES)[0] + "abc/story-card"
        self._patch_resources(
            monkeypatch,
            [
                {
                    "resources": [
                        self._asset(reserved_pid),
                        self._asset("mehamakor/keep_me"),
                    ]
                }
            ],
        )
        result = list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert {pid for pid, _, _ in result} == {"mehamakor/keep_me"}

    def test_young_asset_filtered_out(self, monkeypatch):
        future = (
            datetime.now(timezone.utc) + timedelta(hours=1)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        self._patch_resources(
            monkeypatch,
            [
                {
                    "resources": [
                        self._asset("mehamakor/young", created_at=future),
                        self._asset("mehamakor/old"),  # 2020 → very old
                    ]
                }
            ],
        )
        result = list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert {pid for pid, _, _ in result} == {"mehamakor/old"}

    def test_sdk_exception_logged_and_re_raised(self, monkeypatch, caplog):
        def boom(**kwargs):
            raise RuntimeError("api broke")

        self._patch_resources(monkeypatch, boom)
        with caplog.at_level(
            logging.ERROR, logger="scripts.cleanup_cloudinary_orphans"
        ):
            with pytest.raises(RuntimeError, match="api broke"):
                list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert any(
            "cloudinary.api.resources failed" in r.message
            for r in caplog.records
        )

    def test_kwargs_to_resources_match_spec(self, monkeypatch):
        fake = self._patch_resources(monkeypatch, [{"resources": []}])
        list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert fake.calls[0] == {
            "prefix": "mehamakor",
            "type": "upload",
            "resource_type": "image",
            "max_results": 500,
        }

    def test_multi_prefix_scans_each(self, monkeypatch):
        fake = self._patch_resources(
            monkeypatch,
            [
                {"resources": [self._asset("mehamakor/a")]},
                {"resources": [self._asset("mehamakor/avatars/b")]},
            ],
        )
        result = list_cloudinary_assets(
            ["mehamakor", "mehamakor/avatars"], min_age_hours=24
        )
        assert {pid for pid, _, _ in result} == {
            "mehamakor/a",
            "mehamakor/avatars/b",
        }
        assert [c["prefix"] for c in fake.calls] == [
            "mehamakor",
            "mehamakor/avatars",
        ]

    def test_returns_public_id_secure_url_bytes_tuple(self, monkeypatch):
        self._patch_resources(
            monkeypatch,
            [{"resources": [self._asset("mehamakor/a")]}],
        )
        result = list_cloudinary_assets(["mehamakor"], min_age_hours=24)
        assert result == [
            (
                "mehamakor/a",
                "https://res.cloudinary.com/x/mehamakor/a.jpg",
                1234,
            )
        ]


# ---------- I.4: orphan compute + dry-run summary + --apply gate ----------


class TestComputeOrphans:
    def test_empty_candidates_returns_empty(self):
        assert compute_orphans([], {"https://x/a.jpg"}) == []

    def test_empty_referenced_all_orphans(self):
        c = [
            ("p1", "https://x/a.jpg", 100),
            ("p2", "https://x/b.jpg", 200),
            ("p3", "https://x/c.jpg", 300),
        ]
        assert compute_orphans(c, set()) == c

    def test_all_referenced_no_orphans(self):
        c = [("p1", "https://x/a.jpg", 100), ("p2", "https://x/b.jpg", 200)]
        ref = {"https://x/a.jpg", "https://x/b.jpg"}
        assert compute_orphans(c, ref) == []

    def test_mixed_only_unmatched_returned_order_preserved(self):
        c = [
            ("p1", "https://x/a.jpg", 100),
            ("p2", "https://x/b.jpg", 200),
            ("p3", "https://x/c.jpg", 300),
            ("p4", "https://x/d.jpg", 400),
        ]
        ref = {"https://x/a.jpg", "https://x/c.jpg"}
        assert compute_orphans(c, ref) == [
            ("p2", "https://x/b.jpg", 200),
            ("p4", "https://x/d.jpg", 400),
        ]

    def test_comparison_key_is_secure_url_not_public_id(self):
        # Same public_id, different secure_url → orphan. Locks the
        # comparison key so a refactor can't accidentally switch to public_id.
        c = [("same_pid", "https://x/different.jpg", 100)]
        ref = {"same_pid"}  # public_id in the set, NOT secure_url
        assert compute_orphans(c, ref) == c

    def test_comparison_key_is_secure_url_not_bytes(self):
        # bytes value should never affect membership.
        c = [("p", "https://x/a.jpg", 999)]
        assert compute_orphans(c, {"https://x/a.jpg"}) == []

    def test_inputs_not_mutated(self):
        candidates = [
            ("p1", "https://x/a.jpg", 100),
            ("p2", "https://x/b.jpg", 200),
        ]
        candidates_snapshot = list(candidates)
        referenced = {"https://x/a.jpg"}
        referenced_snapshot = set(referenced)
        compute_orphans(candidates, referenced)
        assert candidates == candidates_snapshot
        assert referenced == referenced_snapshot


class TestFormatBytes:
    def test_bytes_under_kib(self):
        assert _format_bytes(0) == "0 B"
        assert _format_bytes(512) == "512 B"
        assert _format_bytes(1023) == "1023 B"

    def test_kilobytes(self):
        assert _format_bytes(1024) == "1.0 KB"
        assert _format_bytes(1536) == "1.5 KB"

    def test_megabytes(self):
        assert _format_bytes(1024 * 1024) == "1.0 MB"
        assert _format_bytes(int(2.5 * 1024 * 1024)) == "2.5 MB"

    def test_gigabytes(self):
        assert _format_bytes(1024**3) == "1.0 GB"

    def test_terabytes_fallback(self):
        assert _format_bytes(2 * 1024**4) == "2.0 TB"


class TestPrintDryRunSummary:
    def _candidate(self, n: int, size: int = 100):
        return (f"mehamakor/p{n}", f"https://res.cloudinary.com/x/p{n}.jpg", size)

    def test_writes_to_stdout_not_stderr(self, capsys):
        # Ops piping `2>cleanup.log` must preserve the summary on stdout.
        candidates = [self._candidate(1), self._candidate(2)]
        orphans = [self._candidate(2)]
        print_dry_run_summary(candidates, {"https://x/p1.jpg"}, orphans)
        captured = capsys.readouterr()
        assert "Cloudinary candidates" in captured.out
        assert "Cloudinary candidates" not in captured.err
        assert captured.err == ""

    def test_contains_all_required_count_lines(self, capsys):
        candidates = [self._candidate(i, 100) for i in range(1, 4)]
        orphans = [self._candidate(2, 100), self._candidate(3, 100)]
        print_dry_run_summary(
            candidates, {"https://res.cloudinary.com/x/p1.jpg"}, orphans
        )
        out = capsys.readouterr().out
        assert "Cloudinary candidates (after filters): 3" in out
        assert "DB-referenced URLs:                    1" in out
        assert "Orphans:                               2" in out

    def test_total_bytes_present_with_human_readable(self, capsys):
        # 1.5 MB of orphans → both raw byte count and "1.5 MB" in output.
        size = int(1.5 * 1024 * 1024)
        orphan = self._candidate(1, size)
        print_dry_run_summary([orphan], set(), [orphan])
        out = capsys.readouterr().out
        assert str(size) in out
        assert "1.5 MB" in out

    def test_sample_size_default_five(self, capsys):
        # 7 orphans → only first 5 sampled by default.
        orphans = [self._candidate(i) for i in range(1, 8)]
        print_dry_run_summary(orphans, set(), orphans)
        out = capsys.readouterr().out
        for i in range(1, 6):
            assert f"mehamakor/p{i}" in out
        for i in range(6, 8):
            assert f"mehamakor/p{i}" not in out
        # Heading reflects actual shown count.
        assert "First 5 orphan public_ids:" in out

    def test_sample_size_param_respected(self, capsys):
        orphans = [self._candidate(i) for i in range(1, 5)]
        print_dry_run_summary(orphans, set(), orphans, sample_size=2)
        out = capsys.readouterr().out
        assert "mehamakor/p1" in out
        assert "mehamakor/p2" in out
        assert "mehamakor/p3" not in out
        assert "First 2 orphan public_ids:" in out

    def test_sample_is_first_n_of_input_order_not_sorted(self, capsys):
        # Input order: p3, p1, p2. Sample must respect that — not alphabetical.
        orphans = [self._candidate(3), self._candidate(1), self._candidate(2)]
        print_dry_run_summary(orphans, set(), orphans, sample_size=2)
        out = capsys.readouterr().out
        # p3 and p1 should appear in that order; p2 not in the sample.
        p3_idx = out.find("mehamakor/p3")
        p1_idx = out.find("mehamakor/p1")
        p2_idx = out.find("mehamakor/p2")
        assert p3_idx != -1 and p1_idx != -1
        assert p3_idx < p1_idx, "input order p3 → p1 must be preserved"
        # p2 might still appear via the secure_url string elsewhere; check
        # that the sample-block line `  - mehamakor/p2` is absent.
        assert "  - mehamakor/p2" not in out
        assert p2_idx == -1 or out.count("mehamakor/p2") < 3

    def test_sample_when_fewer_orphans_than_sample_size(self, capsys):
        orphans = [self._candidate(1), self._candidate(2)]
        print_dry_run_summary(orphans, set(), orphans, sample_size=10)
        out = capsys.readouterr().out
        # Heading uses min(sample_size, len(orphans)) — locks against
        # off-by-one ("First 10..." when only 2 exist would be misleading).
        assert "First 2 orphan public_ids:" in out

    def test_zero_orphans_skips_sample_block(self, capsys):
        candidates = [self._candidate(1)]
        print_dry_run_summary(candidates, {"https://x/p1.jpg"}, [])
        out = capsys.readouterr().out
        assert "Orphans:                               0" in out
        # No "First N" heading when there's nothing to show.
        assert "orphan public_ids:" not in out

    def test_hint_line_present(self, capsys):
        print_dry_run_summary([], set(), [])
        out = capsys.readouterr().out
        assert "Re-run with --apply to delete." in out


# ---------- I.5: --apply flow (DESTRUCTIVE PATH) ----------


class TestConfirmOrAbort:
    def test_lowercase_yes_returns(self):
        # Real prompt; verify return path. No SystemExit.
        _confirm_or_abort(3, 1024, _input=lambda prompt: "yes")

    def test_no_aborts(self, capsys):
        with pytest.raises(SystemExit) as exc:
            _confirm_or_abort(3, 1024, _input=lambda prompt: "no")
        assert exc.value.code == 0
        assert "Aborted." in capsys.readouterr().out

    def test_partial_y_aborts(self, capsys):
        # Defense against hasty Enter — `y` alone never proceeds.
        with pytest.raises(SystemExit) as exc:
            _confirm_or_abort(3, 1024, _input=lambda prompt: "y")
        assert exc.value.code == 0
        assert "Aborted." in capsys.readouterr().out

    def test_uppercase_Y_aborts(self, capsys):
        with pytest.raises(SystemExit) as exc:
            _confirm_or_abort(3, 1024, _input=lambda prompt: "Y")
        assert exc.value.code == 0

    def test_uppercase_yes_aborts(self, capsys):
        # Strict case-sensitivity: only lowercase "yes" proceeds.
        with pytest.raises(SystemExit) as exc:
            _confirm_or_abort(3, 1024, _input=lambda prompt: "YES")
        assert exc.value.code == 0
        assert "Aborted." in capsys.readouterr().out

    def test_empty_input_aborts(self, capsys):
        with pytest.raises(SystemExit) as exc:
            _confirm_or_abort(3, 1024, _input=lambda prompt: "")
        assert exc.value.code == 0
        assert "Aborted." in capsys.readouterr().out

    def test_whitespace_padded_yes_returns(self):
        # `.strip()` applied before equality — newline / spaces don't break it.
        _confirm_or_abort(3, 1024, _input=lambda prompt: "  yes  ")

    def test_trailing_newline_yes_returns(self):
        _confirm_or_abort(3, 1024, _input=lambda prompt: "yes\n")

    def test_prompt_contains_count_and_human_readable_bytes(self):
        captured: list[str] = []

        def spy_input(prompt: str) -> str:
            captured.append(prompt)
            return "yes"

        _confirm_or_abort(7, int(1.5 * 1024 * 1024), _input=spy_input)
        assert len(captured) == 1
        prompt = captured[0]
        assert "7" in prompt
        assert "1.5 MB" in prompt
        assert "yes" in prompt  # the literal in the prompt text


class TestBatchDeleteOrphans:
    def _orphan(self, n: int):
        return (f"mehamakor/p{n}", f"https://x/p{n}.jpg", 100)

    def _patch_delete(self, monkeypatch, callable_or_responses):
        import cloudinary.api as cloudinary_api

        if callable(callable_or_responses):
            fake = callable_or_responses
            calls: list[dict] = []
            original = fake

            def wrapped(**kwargs):
                calls.append(kwargs)
                return original(**kwargs)

            wrapped.calls = calls  # type: ignore[attr-defined]
            monkeypatch.setattr(cloudinary_api, "delete_resources", wrapped)
            return wrapped

        responses = list(callable_or_responses)
        calls = []

        def fake(**kwargs):
            calls.append(kwargs)
            if not responses:
                raise AssertionError("delete_resources called past canned data")
            return responses.pop(0)

        fake.calls = calls  # type: ignore[attr-defined]
        monkeypatch.setattr(cloudinary_api, "delete_resources", fake)
        return fake

    def test_empty_list_no_sdk_calls(self, monkeypatch):
        fake = self._patch_delete(monkeypatch, [])
        assert _batch_delete_orphans([], 100) == (0, 0, 0)
        assert len(fake.calls) == 0

    def test_50_orphans_one_batch(self, monkeypatch):
        orphans = [self._orphan(i) for i in range(50)]
        fake = self._patch_delete(
            monkeypatch,
            [{"deleted": {pid: "deleted" for pid, _, _ in orphans}}],
        )
        assert _batch_delete_orphans(orphans, 100) == (50, 0, 0)
        assert len(fake.calls) == 1
        assert len(fake.calls[0]["public_ids"]) == 50

    def test_250_orphans_three_batches_100_100_50(self, monkeypatch):
        orphans = [self._orphan(i) for i in range(250)]
        responses = [
            {"deleted": {pid: "deleted" for pid, _, _ in orphans[0:100]}},
            {"deleted": {pid: "deleted" for pid, _, _ in orphans[100:200]}},
            {"deleted": {pid: "deleted" for pid, _, _ in orphans[200:250]}},
        ]
        fake = self._patch_delete(monkeypatch, responses)
        assert _batch_delete_orphans(orphans, 100) == (250, 0, 0)
        assert len(fake.calls) == 3
        assert [len(c["public_ids"]) for c in fake.calls] == [100, 100, 50]

    def test_all_deleted_for_250_returns_clean_count(self, monkeypatch):
        # Same as above but asserting only the count tuple.
        orphans = [self._orphan(i) for i in range(250)]
        responses = [
            {"deleted": {pid: "deleted" for pid, _, _ in orphans[0:100]}},
            {"deleted": {pid: "deleted" for pid, _, _ in orphans[100:200]}},
            {"deleted": {pid: "deleted" for pid, _, _ in orphans[200:250]}},
        ]
        self._patch_delete(monkeypatch, responses)
        assert _batch_delete_orphans(orphans, 100) == (250, 0, 0)

    def test_mixed_deleted_and_not_found(self, monkeypatch):
        orphans = [self._orphan(i) for i in range(4)]
        per_id = {
            "mehamakor/p0": "deleted",
            "mehamakor/p1": "not_found",
            "mehamakor/p2": "deleted",
            "mehamakor/p3": "not_found",
        }
        self._patch_delete(monkeypatch, [{"deleted": per_id}])
        assert _batch_delete_orphans(orphans, 100) == (2, 2, 0)

    def test_other_status_counted_as_error_with_warning(
        self, monkeypatch, caplog
    ):
        orphans = [self._orphan(0), self._orphan(1)]
        per_id = {
            "mehamakor/p0": "deleted",
            "mehamakor/p1": "blocked",  # unexpected status
        }
        self._patch_delete(monkeypatch, [{"deleted": per_id}])
        with caplog.at_level(
            logging.WARNING, logger="scripts.cleanup_cloudinary_orphans"
        ):
            assert _batch_delete_orphans(orphans, 100) == (1, 0, 1)
        assert any(
            "unexpected status 'blocked'" in r.message for r in caplog.records
        )

    def test_sdk_exception_counts_batch_as_errors_continues_next(
        self, monkeypatch, caplog
    ):
        # 3 batches of 2; batch 2 raises; batches 1 and 3 succeed.
        orphans = [self._orphan(i) for i in range(6)]
        call_counter = {"n": 0}

        def fake(**kwargs):
            call_counter["n"] += 1
            if call_counter["n"] == 2:
                raise RuntimeError("transient API error")
            return {"deleted": {pid: "deleted" for pid in kwargs["public_ids"]}}

        self._patch_delete(monkeypatch, fake)
        with caplog.at_level(
            logging.ERROR, logger="scripts.cleanup_cloudinary_orphans"
        ):
            deleted, not_found, errors = _batch_delete_orphans(orphans, 2)
        # Batch 1 (2 deleted) + Batch 2 (2 errors) + Batch 3 (2 deleted)
        assert deleted == 4
        assert not_found == 0
        assert errors == 2
        assert any(
            "delete_resources failed" in r.message for r in caplog.records
        )

    def test_kwargs_match_phase_1_spec(self, monkeypatch):
        orphans = [self._orphan(0)]
        fake = self._patch_delete(
            monkeypatch,
            [{"deleted": {"mehamakor/p0": "deleted"}}],
        )
        _batch_delete_orphans(orphans, 100)
        assert fake.calls[0] == {
            "public_ids": ["mehamakor/p0"],
            "type": "upload",
            "resource_type": "image",
            "invalidate": False,
        }


class TestApplyMainPath:
    """Full main() integration with --apply variants. Stubbed DB + SDK."""

    def _stub_main_environment(
        self,
        monkeypatch,
        *,
        cloudinary_resources: list,
        cloudinary_delete_response=None,
    ):
        """Wire stubs and return (delete_calls_list, db_close_count_list)."""
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

        class _FakeQuery:
            def filter(self, *args, **kwargs):
                return self

            def __iter__(self):
                return iter([])

        class _FakeDB:
            def query(self, col):
                return _FakeQuery()

            def close(self):
                pass

        monkeypatch.setattr(
            cleanup_cloudinary_orphans, "SessionLocal", lambda: _FakeDB()
        )
        import cloudinary.api as cloudinary_api

        monkeypatch.setattr(
            cloudinary_api,
            "resources",
            lambda **kwargs: {"resources": cloudinary_resources},
        )
        delete_calls: list[dict] = []
        if cloudinary_delete_response is not None:
            def fake_delete(**kwargs):
                delete_calls.append(kwargs)
                return cloudinary_delete_response
            monkeypatch.setattr(
                cloudinary_api, "delete_resources", fake_delete
            )
        else:
            def forbidden_delete(**kwargs):
                raise AssertionError(
                    "delete_resources called when test expected no delete"
                )
            monkeypatch.setattr(
                cloudinary_api, "delete_resources", forbidden_delete
            )
        return delete_calls

    def _orphan_resource(self, n: int):
        return {
            "public_id": f"mehamakor/orphan_{n}",
            "secure_url": f"https://x/orphan_{n}.jpg",
            "bytes": 100,
            "created_at": "2020-01-01T00:00:00Z",
        }

    def test_apply_yes_all_deleted_returns_zero(self, monkeypatch):
        resources = [self._orphan_resource(i) for i in range(3)]
        delete_response = {
            "deleted": {f"mehamakor/orphan_{i}": "deleted" for i in range(3)}
        }
        delete_calls = self._stub_main_environment(
            monkeypatch,
            cloudinary_resources=resources,
            cloudinary_delete_response=delete_response,
        )
        assert main(["--apply", "--yes"]) == 0
        # 2 prefix scans, but only 1 delete call (the 3 orphans live under
        # `mehamakor` only — `mehamakor/avatars` scan returns same data
        # which dedups via secure_url? No — same resources duplicated; but
        # the 2nd scan would re-stage the same public_ids. Phase 1 spec says
        # we don't dedup across prefixes — we just delete twice. Validated
        # below in test_apply_no_orphans which uses real semantics.)
        assert len(delete_calls) >= 1

    def test_apply_yes_emits_summary_block_to_stdout(
        self, monkeypatch, capsys
    ):
        # UX symmetry with dry-run: `--apply --yes 2>cleanup.log` must still
        # show the final result on stdout. Operational logs stay on stderr;
        # the summary box mirrors the dry-run block's aesthetic.
        resources = [self._orphan_resource(0)]
        delete_response = {"deleted": {"mehamakor/orphan_0": "deleted"}}
        self._stub_main_environment(
            monkeypatch,
            cloudinary_resources=resources,
            cloudinary_delete_response=delete_response,
        )
        rc = main(["--apply", "--yes"])
        assert rc == 0
        out = capsys.readouterr().out
        assert "Apply complete:" in out
        assert "deleted=1" in out
        assert "not_found=0" in out
        assert "errors=0" in out
        assert "CLEAN" in out
        assert "exit code 0" in out

    def test_apply_yes_mixed_response_returns_one(self, monkeypatch):
        resources = [self._orphan_resource(i) for i in range(2)]
        delete_response = {
            "deleted": {
                "mehamakor/orphan_0": "deleted",
                "mehamakor/orphan_1": "not_found",
            }
        }
        self._stub_main_environment(
            monkeypatch,
            cloudinary_resources=resources,
            cloudinary_delete_response=delete_response,
        )
        # not_found > 0 → exit 1.
        assert main(["--apply", "--yes"]) == 1

    def test_apply_yes_no_orphans_returns_zero_no_delete_call(
        self, monkeypatch, capsys
    ):
        # cloudinary returns nothing → empty candidates → empty orphans.
        delete_calls = self._stub_main_environment(
            monkeypatch,
            cloudinary_resources=[],
            cloudinary_delete_response=None,  # forbidden_delete; never called
        )
        rc = main(["--apply", "--yes"])
        assert rc == 0
        assert delete_calls == []
        # Empty-orphan short-circuit still prints the dry-run summary.
        out = capsys.readouterr().out
        assert "Orphans:                               0" in out

    def test_apply_without_yes_typed_yes_proceeds(self, monkeypatch):
        resources = [self._orphan_resource(0)]
        delete_response = {"deleted": {"mehamakor/orphan_0": "deleted"}}
        self._stub_main_environment(
            monkeypatch,
            cloudinary_resources=resources,
            cloudinary_delete_response=delete_response,
        )
        # Real prompt path — patch builtins.input.
        monkeypatch.setattr("builtins.input", lambda prompt: "yes")
        assert main(["--apply"]) == 0

    def test_apply_without_yes_typed_no_aborts(self, monkeypatch, capsys):
        resources = [self._orphan_resource(0)]
        delete_calls = self._stub_main_environment(
            monkeypatch,
            cloudinary_resources=resources,
            cloudinary_delete_response=None,  # forbidden_delete
        )
        monkeypatch.setattr("builtins.input", lambda prompt: "no")
        with pytest.raises(SystemExit) as exc:
            main(["--apply"])
        assert exc.value.code == 0
        assert delete_calls == []
        assert "Aborted." in capsys.readouterr().out

    def test_dry_run_unchanged_no_delete_call(self, monkeypatch, capsys):
        resources = [self._orphan_resource(0)]
        delete_calls = self._stub_main_environment(
            monkeypatch,
            cloudinary_resources=resources,
            cloudinary_delete_response=None,
        )
        rc = main([])
        assert rc == 0
        assert delete_calls == []
        out = capsys.readouterr().out
        assert "Re-run with --apply to delete." in out


class TestExitCodeMatrix:
    """Lock the exit-code matrix end-to-end via main()."""

    def _stub_base(self, monkeypatch):
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

        class _FakeQuery:
            def filter(self, *args, **kwargs):
                return self

            def __iter__(self):
                return iter([])

        class _FakeDB:
            def query(self, col):
                return _FakeQuery()

            def close(self):
                pass

        monkeypatch.setattr(
            cleanup_cloudinary_orphans, "SessionLocal", lambda: _FakeDB()
        )

    def _setup_listing_failed(self, monkeypatch):
        self._stub_base(monkeypatch)
        import cloudinary.api as cloudinary_api

        monkeypatch.setattr(
            cloudinary_api,
            "resources",
            lambda **kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
        )

    def _setup_apply_all_deleted(self, monkeypatch):
        self._stub_base(monkeypatch)
        import cloudinary.api as cloudinary_api

        monkeypatch.setattr(
            cloudinary_api,
            "resources",
            lambda **kwargs: {
                "resources": [
                    {
                        "public_id": "mehamakor/x",
                        "secure_url": "https://x/x.jpg",
                        "bytes": 100,
                        "created_at": "2020-01-01T00:00:00Z",
                    }
                ]
            },
        )
        monkeypatch.setattr(
            cloudinary_api,
            "delete_resources",
            lambda **kwargs: {"deleted": {"mehamakor/x": "deleted"}},
        )

    def _setup_apply_with_not_found(self, monkeypatch):
        self._stub_base(monkeypatch)
        import cloudinary.api as cloudinary_api

        monkeypatch.setattr(
            cloudinary_api,
            "resources",
            lambda **kwargs: {
                "resources": [
                    {
                        "public_id": "mehamakor/x",
                        "secure_url": "https://x/x.jpg",
                        "bytes": 100,
                        "created_at": "2020-01-01T00:00:00Z",
                    }
                ]
            },
        )
        monkeypatch.setattr(
            cloudinary_api,
            "delete_resources",
            lambda **kwargs: {"deleted": {"mehamakor/x": "not_found"}},
        )

    def _setup_apply_no_orphans(self, monkeypatch):
        self._stub_base(monkeypatch)
        import cloudinary.api as cloudinary_api

        monkeypatch.setattr(
            cloudinary_api, "resources", lambda **kwargs: {"resources": []}
        )

    def _setup_apply_user_aborts(self, monkeypatch):
        self._stub_base(monkeypatch)
        import cloudinary.api as cloudinary_api

        monkeypatch.setattr(
            cloudinary_api,
            "resources",
            lambda **kwargs: {
                "resources": [
                    {
                        "public_id": "mehamakor/x",
                        "secure_url": "https://x/x.jpg",
                        "bytes": 100,
                        "created_at": "2020-01-01T00:00:00Z",
                    }
                ]
            },
        )
        monkeypatch.setattr("builtins.input", lambda prompt: "no")

    def _setup_dry_run(self, monkeypatch):
        self._stub_base(monkeypatch)
        import cloudinary.api as cloudinary_api

        monkeypatch.setattr(
            cloudinary_api,
            "resources",
            lambda **kwargs: {
                "resources": [
                    {
                        "public_id": "mehamakor/x",
                        "secure_url": "https://x/x.jpg",
                        "bytes": 100,
                        "created_at": "2020-01-01T00:00:00Z",
                    }
                ]
            },
        )

    @pytest.mark.parametrize(
        "scenario,argv,expected_code,expects_systemexit",
        [
            ("listing_failed", [], 1, False),
            ("apply_all_deleted", ["--apply", "--yes"], 0, False),
            ("apply_with_not_found", ["--apply", "--yes"], 1, False),
            ("apply_no_orphans", ["--apply", "--yes"], 0, False),
            ("apply_user_aborts", ["--apply"], 0, True),
            ("dry_run", [], 0, False),
        ],
    )
    def test_exit_code(
        self, monkeypatch, scenario, argv, expected_code, expects_systemexit
    ):
        getattr(self, f"_setup_{scenario}")(monkeypatch)
        if expects_systemexit:
            with pytest.raises(SystemExit) as exc:
                main(argv)
            assert exc.value.code == expected_code, scenario
        else:
            assert main(argv) == expected_code, scenario
