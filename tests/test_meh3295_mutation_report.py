"""MEH-3295 — self-test for scripts/mutation/report.py.

The fixture is a fragment of a REAL mutants file written by mutmut 3.8.1
(tests/fixtures/mutmut/pricing_fragment.py.txt), so the fingerprint is tested
against the shape mutmut actually emits, not a hand-made guess.
"""

import importlib.util
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "mutation_report", ROOT / "scripts/mutation/report.py"
)
rep = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rep)

FRAG = ROOT / "tests/fixtures/mutmut/pricing_fragment.py.txt"
KEY = "app.pricing.x_rescue_bag_fee_agorot__mutmut_"


def _tree(tmp_path, codes):
    app = tmp_path / "app"
    app.mkdir()
    shutil.copy(FRAG, app / "pricing.py")
    (app / "pricing.py.meta").write_text(
        json.dumps({"exit_code_by_key": codes}), encoding="utf-8"
    )
    # A copied-for-imports file: meta with no mutants must not be reported.
    (app / "other.py").write_text("x = 1\n", encoding="utf-8")
    (app / "other.py.meta").write_text(
        json.dumps({"exit_code_by_key": {}}), encoding="utf-8"
    )
    return tmp_path


def test_fingerprint_names_the_changed_line_not_the_mutant_number():
    funcs = rep._functions(FRAG.read_text(encoding="utf-8"))
    assert rep.fingerprint("app/pricing.py", KEY + "1", funcs) == (
        "app/pricing.py::rescue_bag_fee_agorot: pl = price_list or current_price_list() => pl = None"
    )
    assert rep.fingerprint("app/pricing.py", KEY + "2", funcs).endswith(
        "=> pl = price_list and current_price_list()"
    )


def test_collect_counts_and_lists_survivors(tmp_path):
    root = _tree(tmp_path, {KEY + "1": 1, KEY + "2": 0})
    per_file, survivors = rep.collect(root)
    assert list(per_file) == ["app/pricing.py"]
    assert per_file["app/pricing.py"]["killed"] == 1
    assert per_file["app/pricing.py"]["survived"] == 1
    assert survivors == [
        "app/pricing.py::rescue_bag_fee_agorot: pl = price_list or current_price_list() => pl = price_list and current_price_list()"
    ]


def test_main_exits_1_on_a_new_survivor_and_0_once_explained(tmp_path, capsys):
    root = _tree(tmp_path, {KEY + "1": 1, KEY + "2": 0})
    expl = tmp_path / "survivors.txt"
    expl.write_text("# header\n", encoding="utf-8")
    assert rep.main(["--mutants", str(root), "--survivors", str(expl)]) == 1
    assert "NEW SURVIVOR:" in capsys.readouterr().out
    fp = rep.collect(root)[1][0]
    expl.write_text(f"{fp}  ## equivalent: test reason\n", encoding="utf-8")
    assert rep.main(["--mutants", str(root), "--survivors", str(expl)]) == 0


def test_a_run_that_killed_nothing_is_void_not_perfect(tmp_path, capsys):
    root = _tree(tmp_path, {KEY + "1": None, KEY + "2": None})
    assert (
        rep.main(["--mutants", str(root), "--survivors", str(tmp_path / "none.txt")])
        == 2
    )
    assert "MUTATION VOID" in capsys.readouterr().out
