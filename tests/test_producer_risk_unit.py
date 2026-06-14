"""Unit tests for app.services.producer_risk pure helpers (MEH-509).

Covers _clamp_score, _truncate_reasoning, _extract_json_object,
_build_profile_payload (PII-safe), and _build_prompt (prompt-injection
wrapper + per-request canary). No network, no DB — these are the
parser/formatter helpers around the Anthropic call.
"""
from types import SimpleNamespace

from app.services import producer_risk as mod


class TestClampScore:
    def test_in_range(self):
        assert mod._clamp_score(42) == 42
        assert mod._clamp_score("75") == 75

    def test_below_min_clamps_to_zero(self):
        assert mod._clamp_score(-5) == 0

    def test_above_max_clamps_to_hundred(self):
        assert mod._clamp_score(250) == 100

    def test_boundaries(self):
        assert mod._clamp_score(0) == 0
        assert mod._clamp_score(100) == 100

    def test_unparseable_returns_none(self):
        assert mod._clamp_score(None) is None
        assert mod._clamp_score("high") is None
        assert mod._clamp_score(3.7) == 3  # int() truncates floats


class TestTruncateReasoning:
    def test_none(self):
        assert mod._truncate_reasoning(None) is None

    def test_blank_returns_none(self):
        assert mod._truncate_reasoning("   ") is None

    def test_strips_whitespace(self):
        assert mod._truncate_reasoning("  פרופיל תקין  ") == "פרופיל תקין"

    def test_caps_at_500_chars(self):
        out = mod._truncate_reasoning("ב" * 800)
        assert len(out) == 500

    def test_coerces_non_string(self):
        assert mod._truncate_reasoning(123) == "123"


class TestExtractJsonObject:
    def test_plain_object(self):
        assert mod._extract_json_object('{"score": 10}') == {"score": 10}

    def test_empty_returns_none(self):
        assert mod._extract_json_object("") is None
        assert mod._extract_json_object(None) is None

    def test_markdown_fence(self):
        assert mod._extract_json_object('```json\n{"score": 5}\n```') == {
            "score": 5
        }

    def test_leading_prose_sliced(self):
        raw = 'Here is the result: {"score": 80, "reasoning": "x"}'
        assert mod._extract_json_object(raw) == {"score": 80, "reasoning": "x"}

    def test_trailing_comma_recovered(self):
        assert mod._extract_json_object('{"score": 1,}') == {"score": 1}

    def test_non_object_json_returns_none(self):
        # valid JSON but not a dict — must not crash downstream .get()
        assert mod._extract_json_object("123") is None

    def test_unrecoverable_returns_none(self):
        assert mod._extract_json_object("no braces here") is None


class TestBuildProfilePayload:
    def test_phone_reduced_to_last4(self):
        producer = SimpleNamespace(
            name="חוות הדס",
            contact_email="a@b.com",
            phone="0501234567",
            description="ירקות אורגניים",
            city="מודיעין",
            primary_contact_method="whatsapp",
        )
        payload = mod._build_profile_payload(producer)
        assert payload["phone_last4"] == "4567"
        # full number must never appear in the payload
        assert "0501234567" not in str(payload)

    def test_missing_phone_is_none(self):
        producer = SimpleNamespace(
            name="x",
            contact_email=None,
            phone=None,
            description=None,
            city=None,
            primary_contact_method=None,
        )
        assert mod._build_profile_payload(producer)["phone_last4"] is None


class TestBuildPrompt:
    def test_returns_system_and_user_pair(self):
        system, user = mod._build_prompt({"name": "test"})
        assert "JSON" in system
        assert "producer_profile_" in user
        assert "test" in user

    def test_canary_differs_per_call(self):
        _, user1 = mod._build_prompt({"name": "a"})
        _, user2 = mod._build_prompt({"name": "a"})
        # per-request canary suffix → wrapper tags differ between calls
        assert user1 != user2
