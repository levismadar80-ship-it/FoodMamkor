"""MEH-2172 — the staging demo seed must not store full-resolution originals.

`backend/scripts/seed_demo_producers.py::_upload_hero` pulls hero images
straight from Unsplash, which serves the untouched original. One demo hero
landed in Cloudinary at 5886x3924 / 2.43MB (Cloudinary ticket #383070) for a
card slot that never renders above 1200px wide. Every *real* upload endpoint
already caps width; the seed script was the one path that did not.

What is asserted here, and why each assertion can fail:

  1. the transformation kwarg is present and is exactly the 1200px `limit`
     cap — fails by construction against the pre-fix code, which passed no
     `transformation` at all;
  2. that cap is *identical to the `/upload/image` endpoint's*, read out of
     `routers/upload.py` at test time rather than hand-copied — so the two
     cannot drift apart silently;
  3. the unconfigured-Cloudinary path returns None WITHOUT calling the
     uploader;
  4. the best-effort contract survives: an uploader that raises still
     returns None and never propagates.

No network: `cloudinary.uploader.upload` is replaced in every test that
reaches it, and assertion 2 parses source rather than calling anything.
"""

import ast
import importlib.util
import os

import pytest

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "backend")
_SCRIPT = os.path.join(_BACKEND, "scripts", "seed_demo_producers.py")
_UPLOAD_ROUTER = os.path.join(_BACKEND, "app", "routers", "upload.py")

# The cap this ticket prescribes. Assertion 2 proves it is not merely a number
# someone liked, but the number `/upload/image` already enforces.
EXPECTED_TRANSFORMATION = [{"width": 1200, "crop": "limit"}]


def _load_seed_module():
    spec = importlib.util.spec_from_file_location("seed_demo_producers", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def seed_mod():
    return _load_seed_module()


class _RecordingUploader:
    """Stands in for `cloudinary.uploader.upload`. Records every call."""

    def __init__(self, result=None, raises=None):
        self.calls = []
        self._result = result or {
            "secure_url": "https://res.cloudinary.com/x/demo/s.jpg"
        }
        self._raises = raises

    def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self._raises is not None:
            raise self._raises
        return self._result


@pytest.fixture()
def uploader(monkeypatch):
    """Patch the uploader and force Cloudinary to look configured.

    `_upload_hero` imports `cloudinary.uploader` inside the function body, so
    the patch has to land on the real module object — which is what
    `monkeypatch.setattr` on the imported module does.
    """
    import cloudinary
    import cloudinary.uploader

    def _install(rec):
        monkeypatch.setattr(cloudinary.uploader, "upload", rec)
        # NB the subject here is the SUT, not this fixture: `_upload_hero`
        # itself calls `cloudinary.config(...)` with the dummy values
        # `_configure` monkeypatches onto `settings`. That call only mutates
        # in-process state and issues no request, so it is left unpatched.
        return rec

    return _install


def _configure(monkeypatch, seed_mod, *, cloud_name="demo-cloud"):
    monkeypatch.setattr(seed_mod.settings, "cloudinary_cloud_name", cloud_name)
    monkeypatch.setattr(seed_mod.settings, "cloudinary_api_key", "key", raising=False)
    monkeypatch.setattr(
        seed_mod.settings, "cloudinary_api_secret", "secret", raising=False
    )


# ── 1. the cap is applied ────────────────────────────────────────────────────


def test_upload_hero_caps_width_at_1200_limit(seed_mod, monkeypatch, uploader):
    """The kwarg the whole ticket is about. Red against the pre-fix code."""
    rec = uploader(_RecordingUploader())
    _configure(monkeypatch, seed_mod)

    url = seed_mod._upload_hero("demo-slug", "https://images.unsplash.com/photo-x")

    assert url == "https://res.cloudinary.com/x/demo/s.jpg"
    assert len(rec.calls) == 1
    _, kwargs = rec.calls[0]

    assert "transformation" in kwargs, (
        "no transformation kwarg — the original is stored uncapped, which is "
        "exactly the MEH-2172 defect"
    )
    assert kwargs["transformation"] == EXPECTED_TRANSFORMATION

    # Named separately so a failure says WHICH half drifted, rather than
    # dumping two dicts. `crop: limit` is the half that makes this safe on a
    # small source: it shrinks or does nothing, and never upscales.
    (entry,) = kwargs["transformation"]
    assert entry["width"] == 1200
    assert entry["crop"] == "limit"


def test_upload_hero_leaves_every_other_kwarg_untouched(
    seed_mod, monkeypatch, uploader
):
    """Scope guard: the fix adds one kwarg and changes nothing else.

    Asserted as an exact key set, not as a series of presence checks — a
    presence check passes just as happily when a kwarg is added or dropped
    alongside it.
    """
    rec = uploader(_RecordingUploader())
    _configure(monkeypatch, seed_mod)

    seed_mod._upload_hero("bakery-tel-aviv", "https://images.unsplash.com/photo-y")

    args, kwargs = rec.calls[0]
    # Asserted as a positional tuple on purpose: this pins the cloudinary SDK
    # calling convention (`upload(url, **opts)`) as well as the URL value, so
    # a refactor that moved the source URL into a keyword would fail here.
    assert args == ("https://images.unsplash.com/photo-y",)
    assert set(kwargs) == {
        "folder",
        "public_id",
        "overwrite",
        "resource_type",
        "transformation",
    }
    assert kwargs["folder"] == "demo"
    assert kwargs["public_id"] == "bakery-tel-aviv"
    assert kwargs["overwrite"] is True
    assert kwargs["resource_type"] == "image"


# ── 2. parity with the endpoint the ticket points at ─────────────────────────


def _extract_image_upload_transformation():
    """Read `/upload/image`'s transformation literal out of `upload.py`.

    Parses source rather than importing, so this needs no app config and makes
    no call. Raises rather than returning a falsy default — a probe whose
    "nothing found" output is also its reassuring output is worthless, and a
    silent `None` here would let the parity assertion pass against a file it
    never actually read.
    """
    with open(_UPLOAD_ROUTER, encoding="utf-8") as fh:
        tree = ast.parse(fh.read(), filename=_UPLOAD_ROUTER)

    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        for kw in node.keywords:
            if kw.arg != "transformation":
                continue
            try:
                value = ast.literal_eval(kw.value)
            except ValueError:  # a non-literal transformation — not our shape
                continue
            found.append(value)

    # The avatar endpoints also pass `transformation`, with a face-gravity fill.
    # `/upload/image`'s is the only `crop: "limit"` one in the file.
    limits = [
        v for v in found if isinstance(v, list) and v and v[0].get("crop") == "limit"
    ]
    if not limits:
        raise AssertionError(
            f"parsed {len(found)} transformation literal(s) from {_UPLOAD_ROUTER} and "
            "none used crop='limit'. Either the endpoint changed shape or this "
            "parser is broken — do NOT read the parity test below as passing."
        )
    return limits[0]


def test_parser_actually_reads_the_router():
    """Control for the parser above, run before the parity claim rests on it.

    Anchored to the committed `upload.py`, not a synthetic fixture: the point
    is that the probe recognises the shape THIS repo uses.
    """
    parsed = _extract_image_upload_transformation()
    assert isinstance(parsed, list) and len(parsed) == 1
    assert set(parsed[0]) == {"width", "crop"}


def test_seed_cap_is_identical_to_the_upload_endpoint(seed_mod, monkeypatch, uploader):
    """The seed must not pick its own number.

    If `/upload/image` ever changes its cap, this goes red and names both
    values — which is the drift a hand-copied literal cannot catch.
    """
    endpoint_transformation = _extract_image_upload_transformation()
    assert endpoint_transformation == EXPECTED_TRANSFORMATION, (
        f"/upload/image now caps at {endpoint_transformation}, but this test "
        f"and the seed script still say {EXPECTED_TRANSFORMATION}"
    )

    rec = uploader(_RecordingUploader())
    _configure(monkeypatch, seed_mod)
    seed_mod._upload_hero("slug", "https://images.unsplash.com/photo-z")

    assert rec.calls[0][1]["transformation"] == endpoint_transformation


# ── 3. the unconfigured path ─────────────────────────────────────────────────


def test_unconfigured_cloudinary_returns_none_without_uploading(
    seed_mod, monkeypatch, uploader
):
    rec = uploader(_RecordingUploader())
    _configure(monkeypatch, seed_mod, cloud_name="")

    assert seed_mod._upload_hero("slug", "https://images.unsplash.com/photo-a") is None
    assert rec.calls == [], "uploader was called despite Cloudinary being unconfigured"


def test_empty_source_url_returns_none_without_uploading(
    seed_mod, monkeypatch, uploader
):
    rec = uploader(_RecordingUploader())
    _configure(monkeypatch, seed_mod)

    assert seed_mod._upload_hero("slug", "") is None
    assert rec.calls == []


# ── 4. best-effort contract ──────────────────────────────────────────────────


def test_failed_upload_returns_none_and_never_raises(seed_mod, monkeypatch, uploader):
    """A dead image must not abort the seed — the business falls back to the
    leaf placeholder (`ProducerCard.jsx`, MEH-643)."""
    rec = uploader(_RecordingUploader(raises=RuntimeError("cloudinary 500")))
    _configure(monkeypatch, seed_mod)

    assert seed_mod._upload_hero("slug", "https://images.unsplash.com/photo-b") is None
    assert len(rec.calls) == 1, "the uploader should have been attempted exactly once"
