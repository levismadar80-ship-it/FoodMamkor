"""MEH-375 Chunk I.1 — pytest for cleanup_cloudinary_orphans skeleton.

Covers argparse contract, missing-config exit, and the --batch-size cap.
Pure unit tests — no DB, no Cloudinary network. Live Cloudinary calls
arrive in I.3 / I.5; those tests will mock `cloudinary.api.*`.
"""
import logging

import pytest

from scripts.cleanup_cloudinary_orphans import (
    BATCH_SIZE_HARD_CAP,
    DEFAULT_MIN_AGE_HOURS,
    DEFAULT_PREFIXES,
    build_parser,
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
