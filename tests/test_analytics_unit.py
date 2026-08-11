"""Unit tests for app.services.analytics pure helpers.

Covers is_bot_user_agent, hash_ip (salt determinism / None handling), and
the in-memory request-metrics pair record_request / server_health. No DB:
these helpers operate on strings and a module-level deque.
"""
import pytest

from app.services import analytics as mod


class TestIsBotUserAgent:
    def test_none_and_empty(self):
        assert mod.is_bot_user_agent(None) is False
        assert mod.is_bot_user_agent("") is False

    @pytest.mark.parametrize(
        "ua",
        [
            "Mozilla/5.0 (compatible; Googlebot/2.1)",
            "facebookexternalhit/1.1",
            "Slackbot-LinkExpanding 1.0",
            "Some Spider crawler",
            "YandexBot/3.0",
        ],
    )
    def test_known_bots(self, ua):
        assert mod.is_bot_user_agent(ua) is True

    def test_real_browser_is_not_bot(self):
        ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15"
        assert mod.is_bot_user_agent(ua) is False

    def test_case_insensitive(self):
        assert mod.is_bot_user_agent("GOOGLEBOT") is True


class TestHashIp:
    def test_none_returns_none(self):
        assert mod.hash_ip(None) is None
        assert mod.hash_ip("") is None

    def test_deterministic_same_input(self):
        assert mod.hash_ip("1.2.3.4") == mod.hash_ip("1.2.3.4")

    def test_different_ips_differ(self):
        assert mod.hash_ip("1.2.3.4") != mod.hash_ip("5.6.7.8")

    def test_is_sha256_hex(self):
        digest = mod.hash_ip("9.9.9.9")
        assert len(digest) == 64
        assert all(c in "0123456789abcdef" for c in digest)

    def test_not_plaintext(self):
        assert "1.2.3.4" not in mod.hash_ip("1.2.3.4")


class TestRequestMetrics:
    @pytest.fixture(autouse=True)
    def _clear_samples(self):
        with mod._samples_lock:
            mod._samples.clear()
        yield
        with mod._samples_lock:
            mod._samples.clear()

    def test_empty_window(self):
        health = mod.server_health()
        assert health["sample_count"] == 0
        assert health["response_time_avg_ms"] == 0
        assert health["requests_per_minute"] == 0
        assert health["window"] == "last_hour"

    def test_records_and_averages(self):
        mod.record_request(100.0)
        mod.record_request(200.0)
        health = mod.server_health()
        assert health["sample_count"] == 2
        assert health["response_time_avg_ms"] == 150.0

    def test_negative_duration_dropped(self):
        mod.record_request(-5.0)
        assert mod.server_health()["sample_count"] == 0

    def test_outlier_over_60s_dropped(self):
        mod.record_request(120_000.0)
        assert mod.server_health()["sample_count"] == 0

    def test_requests_per_minute_rounded(self):
        for _ in range(30):
            mod.record_request(10.0)
        # 30 samples over a 60-min window → 0.5 rpm
        assert mod.server_health()["requests_per_minute"] == 0.5
