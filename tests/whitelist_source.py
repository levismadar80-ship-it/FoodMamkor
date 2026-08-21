"""
Module:   whitelist_source
Purpose:  One reader for `_PRODUCER_WRITABLE_FIELDS`, parsed out of the shipped
          `producer_me.py` source, shared by every test that asserts what the
          owner PUT path may write.
Does NOT: assert anything itself. Each caller keeps its own subject and its own
          control — this only supplies the parsed set.
Related:  backend/app/routers/producer_me.py ·
          backend/app/data_ownership.py · tests/test_data_ownership.py ·
          tests/test_meh1856_closed_write_paths.py and its per-field siblings.
History:  MEH-2145 (creation, MEH-1938 batch B6).

WHY A PARSE AND NOT AN IMPORT
    `_PRODUCER_WRITABLE_FIELDS` is a local built at call time inside
    `update_my_producer`, so there is no importable object and no constant to
    introspect. Parsing the shipped source keeps the property that matters: a
    hand-copied list in a test would be free to drift from the set the handler
    actually consults.

    NOT `inspect.getfile(update_my_producer)`: the handler is wrapped by
    slowapi's `@limiter.limit`, so that resolves to slowapi/extension.py.

WHY IT LIVES HERE
    Three test files carried a verbatim copy of this function before MEH-2145
    (test_meh1856_closed_write_paths, test_meh2142_hours_owner_path,
    test_meh2143_kosher_owner_path). The CI reviewer flagged it on #3034: with
    copies, a change to the declaration form breaks each independently and none
    of them points at the others as the update site. B6 would have been the
    fourth copy, so it became the consolidation instead.
"""

import ast
from pathlib import Path

import app.routers.producer_me as producer_me_module

WHITELIST_NAME = "_PRODUCER_WRITABLE_FIELDS"


def read_producer_writable_fields() -> set[str]:
    """Return the string literals in `_PRODUCER_WRITABLE_FIELDS`.

    Accepts BOTH declaration forms:
        _PRODUCER_WRITABLE_FIELDS = {...}            → ast.Assign
        _PRODUCER_WRITABLE_FIELDS: set[str] = {...}  → ast.AnnAssign

    The old copies matched only `ast.Assign`, so annotating the declaration
    would have made the walk find nothing. That is a *silent* miss of exactly
    the kind these tests exist to prevent — the parse would return no set and
    raise, or worse, a caller without a positive control would read an empty
    set as "nothing is writable" and pass. Handled here once.
    """
    source = Path(producer_me_module.__file__).read_text(encoding="utf-8")
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Assign):
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        elif isinstance(node, ast.AnnAssign):
            names = [node.target.id] if isinstance(node.target, ast.Name) else []
        else:
            continue
        if WHITELIST_NAME not in names:
            continue
        # An annotation with no assignment (`NAME: set[str]`) parses as an
        # AnnAssign whose `.value` is None. It reached the set-literal assert
        # below and failed as "no longer a set literal", which points the
        # reader at the wrong edit: the declaration form is not the problem,
        # the missing `= {...}` is. Named separately so the message describes
        # the actual state of the source. Still fatal — a whitelist nobody
        # assigns is not a whitelist, and silently skipping it would let a
        # caller read an empty set as "nothing is writable" and pass, which is
        # the exact silent miss this module's docstring exists to prevent.
        if isinstance(node, ast.AnnAssign) and node.value is None:
            raise AssertionError(
                f"{WHITELIST_NAME} is annotated without an assignment "
                f"({WHITELIST_NAME}: ... with no `= {{...}}`) — "
                "there is no set literal to read"
            )
        assert isinstance(node.value, ast.Set), (
            f"{WHITELIST_NAME} is no longer a set literal"
        )
        return {
            e.value
            for e in node.value.elts
            if isinstance(e, ast.Constant) and isinstance(e.value, str)
        }
    raise AssertionError(
        f"could not find {WHITELIST_NAME} in {producer_me_module.__file__}"
    )
