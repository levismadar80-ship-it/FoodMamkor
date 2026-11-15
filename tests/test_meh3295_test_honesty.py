"""MEH-3295 — self-test for scripts/checks/lib/test_honesty.py.

Runs the REAL scanner (imported from its path, never a copy) on synthetic
files, then on real repo files whose answer is known, so a scanner that went
blind would go red here instead of reporting a clean repo.
"""

import importlib.util
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "test_honesty", ROOT / "scripts/checks/lib/test_honesty.py"
)
th = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(th)


def _scan(tmp_path, body):
    p = tmp_path / "test_x.py"
    p.write_text(textwrap.dedent(body), encoding="utf-8")
    return [k for k, _ in th.scan_python(p, "tests/test_x.py")]


def test_a_test_that_only_calls_the_code_is_flagged(tmp_path):
    assert _scan(tmp_path, "def test_a():\n    f()\n") == [
        "no-verify tests/test_x.py::test_a"
    ]


def test_assert_raises_mock_assert_and_raise_each_count(tmp_path):
    src = """
    import pytest
    def test_a():
        assert f()
    def test_b():
        with pytest.raises(ValueError):
            f()
    def test_c(m):
        m.assert_called_once_with(1)
    def test_d():
        if f():
            raise AssertionError("x")
    """
    assert _scan(tmp_path, src) == []


def test_a_helper_that_asserts_counts_through_two_levels(tmp_path):
    src = """
    def _inner(x):
        assert x
    def _outer(x):
        _inner(x)
    def test_a():
        _outer(f())
    """
    assert _scan(tmp_path, src) == []


def test_the_no_assert_comment_is_the_escape_hatch(tmp_path):
    src = "def test_a():\n    f()  # no-assert: not raising is the contract\n"
    assert _scan(tmp_path, src) == []


def test_skip_without_card_and_lax_xfail_are_flagged(tmp_path):
    src = """
    import pytest
    @pytest.mark.skip(reason="later")
    def test_a():
        assert 1
    @pytest.mark.skip(reason="tracked in MEH-1")
    def test_b():
        assert 1
    @pytest.mark.xfail(reason="MEH-2")
    def test_c():
        assert 1
    @pytest.mark.xfail(strict=True, reason="MEH-3")
    def test_d():
        assert 1
    """
    assert _scan(tmp_path, src) == [
        "skip-no-card tests/test_x.py::test_a",
        "xfail-not-strict tests/test_x.py::test_c",
    ]


def test_vitest_only_and_uncarded_skip_are_flagged(tmp_path):
    p = tmp_path / "x.test.js"
    p.write_text(
        'it.only("a", () => {});\n'
        'it.skip("b", () => {});\n'
        '// MEH-9\nit.skip("c", () => {});\n',
        encoding="utf-8",
    )
    assert [k for k, _ in th.scan_js(p, "x.test.js")] == [
        "only x.test.js:1",
        "skip-no-card x.test.js::b",
    ]


# ── anchored to real repo files ────────────────────────────────────────────


def _real(rel):
    return {k for k, _ in th.scan_python(ROOT / rel, rel)}


def test_real_file_strict_xfails_that_name_a_card_pass():
    # Their reasons named FINDING-1/2 and no card until MEH-3317/3318 were
    # added (15/11); the scanner flagged both before that edit.
    keys = _real("tests/test_outreach_prefill_edge_cases.py")
    assert not any(k.startswith(("skip-no-card", "xfail-not-strict")) for k in keys), (
        keys
    )


def test_real_file_helper_assert_is_followed():
    # `_near()` holds the asserts; the tests only call it.
    assert _real("tests/test_meh2669_city_centroid_bundled.py") == set()


def test_real_file_call_only_test_is_seen():
    keys = _real("tests/test_meh3010_chat_global_cap.py")
    assert (
        "no-verify tests/test_meh3010_chat_global_cap.py::test_assistant_message_keeps_the_wider_limit"
        in keys
    )


def test_the_whole_repo_scan_sees_thousands_of_tests():
    # Control: a scanner pointed at the wrong root finds nothing and "passes".
    py = sorted((ROOT / "tests").rglob("test_*.py"))
    assert len(py) > 300
    found = th.scan(ROOT)
    assert len(found) >= 10
