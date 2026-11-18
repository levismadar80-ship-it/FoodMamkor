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


def test_class_skip_module_skip_and_imperative_skip_are_flagged(tmp_path):
    src = """
    import pytest
    pytestmark = [pytest.mark.skip(reason="later")]
    @pytest.mark.skip(reason="later")
    class TestA:
        def test_x(self):
            assert 1
    class TestB:
        def test_x(self):
            f()
    def test_s():
        pytest.skip("not here")
        assert 1
    def test_t():
        pytest.skip("MEH-9 not here")
        assert 1
    """
    assert sorted(_scan(tmp_path, src)) == [
        "no-verify tests/test_x.py::TestB.test_x",
        "skip-no-card tests/test_x.py::TestA",
        "skip-no-card tests/test_x.py::pytestmark",
        "skip-no-card tests/test_x.py::test_s",
    ]


def test_a_product_call_named_like_a_check_does_not_count(tmp_path):
    src = """
    import pytest
    def test_a(c):
        c.get("/x")
        checkpoint()
        verify_token_cached()
        check_ok(c)
        pytest.approx(1)
    def test_b(m):
        m.assertEqual(1, 1)
    def test_c(m):
        expect_ok(m)
    """
    assert _scan(tmp_path, src) == ["no-verify tests/test_x.py::test_a"]


def test_vitest_skipif_each_and_wrapped_titles_are_flagged(tmp_path):
    p = tmp_path / "x.test.js"
    p.write_text(
        "it.only.each([1])('a %s', () => {});\n"
        "it.skipIf(cond)('b', () => {});\n"
        "it.skip(\n  'c',\n  () => {},\n);\n"
        "// it.skip('d') in a comment is not a skip\n",
        encoding="utf-8",
    )
    assert [k for k, _ in th.scan_js(p, "x.test.js")] == [
        "only x.test.js:1",
        "skip-no-card x.test.js::b",
        "skip-no-card x.test.js::c",
    ]


def test_main_fails_on_a_new_finding_and_on_a_grown_baseline(tmp_path, capsys):
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests/test_x.py").write_text(
        "def test_a():\n    f()\n", encoding="utf-8"
    )
    key = "no-verify tests/test_x.py::test_a"
    bl = tmp_path / "bl.txt"
    bl.write_text("# header\n", encoding="utf-8")
    assert th.main(["x", str(tmp_path), str(bl)]) == 1
    bl.write_text(f"# header\n{key}\n", encoding="utf-8")
    assert th.main(["x", str(tmp_path), str(bl)]) == 0
    base = tmp_path / "base.txt"
    base.write_text("# header\n", encoding="utf-8")
    assert th.main(["x", str(tmp_path), str(bl), str(base)]) == 1
    assert "baseline grew" in capsys.readouterr().out
    base.write_text(f"{key}\n", encoding="utf-8")
    assert th.main(["x", str(tmp_path), str(bl), str(base)]) == 0


# ── anchored to real repo files ────────────────────────────────────────────


def _real(rel):
    return {k for k, _ in th.scan_python(ROOT / rel, rel)}


def test_real_file_module_and_imperative_skips_are_seen():
    # pytestmark = pytest.mark.skipif(not RUN_FUZZ) and a pytest.skip() in a
    # class method: both real, both without a card (in the baseline).
    assert "skip-no-card tests/test_fuzz_schemathesis.py::pytestmark" in _real(
        "tests/test_fuzz_schemathesis.py"
    )
    assert (
        "skip-no-card tests/test_analytics_chokepoint.py::TestChokePointIsEnforced."
        "test_no_analytics_write_outside_the_choke_point"
    ) in _real("tests/test_analytics_chokepoint.py")


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
