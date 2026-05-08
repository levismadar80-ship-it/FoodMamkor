"""MEH-375: pytest for cloudinary_utils helpers (extract_public_id + destroy_image).

These are pure unit tests — no DB, no FastAPI test client. The Cloudinary
HTTP API is mocked via monkeypatch on `cloudinary.uploader.destroy`,
which `destroy_image` lazy-imports inside its try block. Because the
import is real (cloudinary package is a project dependency), patching
the attribute on the live module is enough.
"""

import logging

import pytest

from app.cloudinary_utils import (
    destroy_image,
    destroy_removed_images,
    extract_public_id,
)


# ---------- extract_public_id ----------


class TestExtractPublicId:
    def test_plain_url_no_transforms_no_version(self):
        url = "https://res.cloudinary.com/mehamakor/image/upload/mehamakor/abc123.jpg"
        assert extract_public_id(url) == "mehamakor/abc123"

    def test_single_transform_group(self):
        url = "https://res.cloudinary.com/mehamakor/image/upload/w_400,h_400/mehamakor/avatars/abc123.jpg"
        assert extract_public_id(url) == "mehamakor/avatars/abc123"

    def test_chained_transform_groups(self):
        url = (
            "https://res.cloudinary.com/mehamakor/image/upload/"
            "w_400,h_400/c_fill/f_auto/mehamakor/avatars/abc123.jpg"
        )
        assert extract_public_id(url) == "mehamakor/avatars/abc123"

    def test_version_segment_only(self):
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1234567890/mehamakor/abc123.jpg"
        assert extract_public_id(url) == "mehamakor/abc123"

    def test_transforms_and_version_combined(self):
        url = (
            "https://res.cloudinary.com/mehamakor/image/upload/"
            "w_400,h_400,c_fill,g_face/v1234567890/mehamakor/avatars/abc123.jpg"
        )
        assert extract_public_id(url) == "mehamakor/avatars/abc123"

    def test_dots_in_mid_path_extension_stripped_from_leaf_only(self):
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/avatars/foo.bar.jpg"
        assert extract_public_id(url) == "mehamakor/avatars/foo.bar"

    def test_user_prefixed_public_id_at_leaf_not_treated_as_transform(self):
        # Chunk B will switch /upload/avatar to public_id=f"user_{user.id}".
        # The `user_` leaf must not be confused with a transformation segment
        # (transformation regex matches segment[0], leaf is segment[-1]).
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/avatars/user_abc123.jpg"
        assert extract_public_id(url) == "mehamakor/avatars/user_abc123"

    def test_reserved_story_card_namespace_returns_none(self):
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/producers/some-uuid/story-card.jpg"
        assert extract_public_id(url) is None

    def test_placeholder_url_returns_none(self):
        assert extract_public_id("/placeholder-image.png") is None
        assert extract_public_id("/placeholder-image.png?avatar=abc123") is None

    def test_non_cloudinary_url_returns_none(self):
        assert (
            extract_public_id("https://lh3.googleusercontent.com/a/ACg8ocAbc123")
            is None
        )
        assert extract_public_id("https://example.com/foo.jpg") is None

    def test_none_empty_and_non_string_input_returns_none(self):
        assert extract_public_id(None) is None
        assert extract_public_id("") is None
        assert extract_public_id(12345) is None  # type: ignore[arg-type]
        assert extract_public_id([]) is None  # type: ignore[arg-type]

    def test_cloudinary_host_without_upload_marker_returns_none(self):
        url = "https://res.cloudinary.com/mehamakor/image/fetch/mehamakor/abc123.jpg"
        assert extract_public_id(url) is None

    def test_upload_marker_with_empty_tail_returns_none(self):
        url = "https://res.cloudinary.com/mehamakor/image/upload/"
        assert extract_public_id(url) is None

    def test_query_string_stripped_before_parsing(self):
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/abc.jpg?_a=ATAB"
        assert extract_public_id(url) == "mehamakor/abc"

    @pytest.mark.xfail(
        strict=True,
        reason=(
            "Signed Cloudinary URLs (s--<hash>--/...) are not currently "
            "parsed by extract_public_id. We don't emit signed URLs today, "
            "but if Cloudinary signing is ever enabled, the cleanup script "
            "will silently miss orphans. Remove this xfail when signed-URL "
            "parsing is implemented."
        ),
    )
    def test_signed_url_parsing(self):
        url = (
            "https://res.cloudinary.com/mehamakor/image/upload/"
            "s--abc123def--/v1/mehamakor/avatars/user_abc.jpg"
        )
        assert extract_public_id(url) == "mehamakor/avatars/user_abc"


# ---------- destroy_image ----------


@pytest.fixture
def cloudinary_configured(monkeypatch):
    """Pretend Cloudinary is wired up so destroy_image doesn't short-circuit
    on the dev-fallback path. Individual tests still control whether the
    actual destroy call is recorded or raises."""
    from app import cloudinary_utils

    monkeypatch.setattr(
        cloudinary_utils.settings, "cloudinary_cloud_name", "test-cloud"
    )
    monkeypatch.setattr(cloudinary_utils.settings, "cloudinary_api_key", "key")
    monkeypatch.setattr(cloudinary_utils.settings, "cloudinary_api_secret", "secret")


def _install_destroy_recorder(monkeypatch, return_value=None, raises=None):
    """Patch cloudinary.uploader.destroy with a recorder. Returns the
    `calls` list so tests can assert call count + kwargs."""
    import cloudinary.uploader

    calls: list[dict] = []

    def fake_destroy(*args, **kwargs):
        calls.append({"args": args, "kwargs": kwargs})
        if raises is not None:
            raise raises
        return return_value

    monkeypatch.setattr(cloudinary.uploader, "destroy", fake_destroy)
    return calls


class TestDestroyImage:
    def test_non_cloudinary_url_returns_true_and_skips_call(
        self, monkeypatch, cloudinary_configured
    ):
        calls = _install_destroy_recorder(monkeypatch)
        assert destroy_image("https://lh3.googleusercontent.com/a/ACg8ocAbc") is True
        assert calls == []

    def test_reserved_namespace_returns_true_and_skips_call(
        self, monkeypatch, cloudinary_configured
    ):
        calls = _install_destroy_recorder(monkeypatch)
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/producers/abc/story-card.jpg"
        assert destroy_image(url) is True
        assert calls == []

    def test_placeholder_url_returns_true_and_skips_call(
        self, monkeypatch, cloudinary_configured
    ):
        calls = _install_destroy_recorder(monkeypatch)
        assert destroy_image("/placeholder-image.png?avatar=abc") is True
        assert calls == []

    def test_none_input_returns_true_and_skips_call(
        self, monkeypatch, cloudinary_configured
    ):
        calls = _install_destroy_recorder(monkeypatch)
        assert destroy_image(None) is True
        assert destroy_image("") is True
        assert calls == []

    def test_cloudinary_unconfigured_returns_true_and_skips_call(self, monkeypatch):
        from app import cloudinary_utils

        monkeypatch.setattr(cloudinary_utils.settings, "cloudinary_cloud_name", None)
        calls = _install_destroy_recorder(monkeypatch)
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/abc.jpg"
        assert destroy_image(url) is True
        assert calls == []

    def test_destroy_returns_ok_yields_true_with_correct_kwargs(
        self, monkeypatch, cloudinary_configured
    ):
        calls = _install_destroy_recorder(monkeypatch, return_value={"result": "ok"})
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/avatars/user_abc.jpg"
        assert destroy_image(url) is True
        assert len(calls) == 1
        assert calls[0]["args"] == ("mehamakor/avatars/user_abc",)
        assert calls[0]["kwargs"] == {"invalidate": True, "resource_type": "image"}

    def test_destroy_returns_not_found_yields_true_idempotent(
        self, monkeypatch, cloudinary_configured
    ):
        # Asset was already deleted by a previous run / sweep — `not found`
        # is the success signal that the orphan is gone, not an error.
        _install_destroy_recorder(monkeypatch, return_value={"result": "not found"})
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/avatars/abc.jpg"
        assert destroy_image(url) is True

    def test_destroy_raises_yields_false_and_logs_error(
        self, monkeypatch, cloudinary_configured, caplog
    ):
        _install_destroy_recorder(monkeypatch, raises=RuntimeError("network down"))
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/avatars/abc.jpg"
        with caplog.at_level(logging.ERROR, logger="app.upload"):
            assert destroy_image(url) is False
        assert any("Cloudinary destroy failed" in r.message for r in caplog.records)

    def test_destroy_unexpected_result_yields_false_and_logs(
        self, monkeypatch, cloudinary_configured, caplog
    ):
        # Documents YF behavior: any result string we don't recognize
        # ("existing", "pending", anything else) is treated as a real
        # error so the cleanup script can re-attempt later.
        _install_destroy_recorder(monkeypatch, return_value={"result": "existing"})
        url = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/avatars/abc.jpg"
        with caplog.at_level(logging.ERROR, logger="app.upload"):
            assert destroy_image(url) is False
        assert any("returned unexpected" in r.message for r in caplog.records)


# ---------- destroy_removed_images ----------


class TestDestroyRemovedImages:
    """Helper extracted from update_my_producer + admin_update_producer to
    keep both handlers under the C901 max-complexity threshold. Tests
    here lock the dedup contract (set diff, not list iteration) and the
    no-op path so the call-site complexity stays at +1 branch."""

    def test_empty_inputs_no_destroy_called(self, monkeypatch):
        from app import cloudinary_utils

        calls: list[str | None] = []
        monkeypatch.setattr(cloudinary_utils, "destroy_image", calls.append)
        destroy_removed_images(None, None)
        destroy_removed_images([], [])
        assert calls == []

    def test_all_old_urls_removed_destroys_each(self, monkeypatch):
        from app import cloudinary_utils

        calls: list[str | None] = []
        monkeypatch.setattr(cloudinary_utils, "destroy_image", calls.append)
        destroy_removed_images(["a", "b", "c"], [])
        # Order is unspecified (set iteration); compare as sets.
        assert set(calls) == {"a", "b", "c"}
        assert len(calls) == 3

    def test_partial_overlap_destroys_only_removed(self, monkeypatch):
        from app import cloudinary_utils

        calls: list[str | None] = []
        monkeypatch.setattr(cloudinary_utils, "destroy_image", calls.append)
        destroy_removed_images(["a", "b", "c"], ["a", "c", "d"])
        assert calls == ["b"]

    def test_duplicate_in_old_destroyed_once(self, monkeypatch):
        # Dedup contract: set(old) - new_set, not list iteration. A
        # duplicate URL in `old` (possible after a buggy upstream merge)
        # must not produce two Cloudinary API calls.
        from app import cloudinary_utils

        calls: list[str | None] = []
        monkeypatch.setattr(cloudinary_utils, "destroy_image", calls.append)
        destroy_removed_images(["a", "a", "b"], [])
        assert set(calls) == {"a", "b"}
        assert len(calls) == 2


# ---------- MEH-510: bypass_reserved opt-out ----------


class TestBypassReserved:
    """The producer-delete cascade is the one legitimate caller that needs
    to delete a `mehamakor/producers/*` asset (the producer is gone, the
    story-card slot is now an orphan). `bypass_reserved=True` opts out of
    the default reject — default False keeps the cleanup script + 8 MEH-375
    cascade hooks unchanged.
    """

    _STORY_CARD_URL = (
        "https://res.cloudinary.com/mehamakor/image/upload/v1/"
        "mehamakor/producers/abc-uuid/story-card.jpg"
    )
    _STORY_CARD_PUBLIC_ID = "mehamakor/producers/abc-uuid/story-card"

    def test_extract_public_id_default_still_rejects_reserved_namespace(self):
        # Regression guard — default behavior unchanged for the cleanup
        # script and the existing 8 MEH-375 cascade hooks.
        assert extract_public_id(self._STORY_CARD_URL) is None

    def test_extract_public_id_bypass_reserved_returns_public_id(self):
        assert (
            extract_public_id(self._STORY_CARD_URL, bypass_reserved=True)
            == self._STORY_CARD_PUBLIC_ID
        )

    def test_destroy_image_bypass_reserved_actually_calls_cloudinary(
        self, monkeypatch, cloudinary_configured
    ):
        # The whole point of MEH-510: with bypass_reserved=True, destroy_image
        # must reach cloudinary.uploader.destroy(public_id, ...) instead of
        # short-circuiting on the reject list. Mirror of
        # `test_reserved_namespace_returns_true_and_skips_call` at line 143
        # (which proves default behavior still skips).
        calls = _install_destroy_recorder(monkeypatch, return_value={"result": "ok"})
        assert destroy_image(self._STORY_CARD_URL, bypass_reserved=True) is True
        assert len(calls) == 1
        assert calls[0]["args"] == (self._STORY_CARD_PUBLIC_ID,)
        assert calls[0]["kwargs"] == {"invalidate": True, "resource_type": "image"}


# ---------- MEH-512: context= observability ----------


class TestDestroyImageContext:
    """The helper logs failures at ERROR level (existing behavior — preserved
    by MEH-512). The new `context: str = ""` keyword tags those log lines so
    a post-incident grep can pinpoint which cascade hook dropped a destroy.
    Default empty string keeps existing log shape minimally — the bracketed
    slot just appears empty.
    """

    _NORMAL_URL = "https://res.cloudinary.com/x/image/upload/v1/mehamakor/abc.jpg"

    def test_destroy_failure_logs_with_context(
        self, monkeypatch, cloudinary_configured, caplog
    ):
        # Cloudinary call raises → log.error path includes the context tag.
        _install_destroy_recorder(monkeypatch, raises=RuntimeError("network down"))
        with caplog.at_level(logging.ERROR, logger="app.upload"):
            assert (
                destroy_image(self._NORMAL_URL, context="auth.delete_account") is False
            )
        messages = [r.message for r in caplog.records]
        assert any("[auth.delete_account]" in m for m in messages), messages

    def test_destroy_failure_logs_with_default_empty_context(
        self, monkeypatch, cloudinary_configured, caplog
    ):
        # Default context — log line still emitted, bracketed slot just empty.
        _install_destroy_recorder(monkeypatch, raises=RuntimeError("network down"))
        with caplog.at_level(logging.ERROR, logger="app.upload"):
            assert destroy_image(self._NORMAL_URL) is False
        messages = [r.message for r in caplog.records]
        assert any("Cloudinary destroy failed" in m for m in messages), messages

    def test_destroy_unexpected_result_logs_with_context(
        self, monkeypatch, cloudinary_configured, caplog
    ):
        # Unexpected result string is also a failure path — must carry context.
        _install_destroy_recorder(monkeypatch, return_value={"result": "blocked"})
        with caplog.at_level(logging.ERROR, logger="app.upload"):
            assert (
                destroy_image(self._NORMAL_URL, context="admin.delete_listing photo")
                is False
            )
        messages = [r.message for r in caplog.records]
        assert any("[admin.delete_listing photo]" in m for m in messages), messages

    def test_destroy_removed_images_propagates_context(
        self, monkeypatch, cloudinary_configured, caplog
    ):
        # Wrapper passes context through to each inner destroy_image call.
        _install_destroy_recorder(monkeypatch, raises=RuntimeError("api blip"))
        with caplog.at_level(logging.ERROR, logger="app.upload"):
            destroy_removed_images(
                [self._NORMAL_URL],
                [],
                context="producer_me.update_my_producer images",
            )
        messages = [r.message for r in caplog.records]
        assert any("[producer_me.update_my_producer images]" in m for m in messages), (
            messages
        )
