"""Path-traversal-safe filesystem slug helper.

Pure module — only `re` import. Tests can import this without dragging in
core.py / data CSVs / search infrastructure.

MEH-398 — closes the path-traversal finding from MEH-397's in-PR audit of
ui-ux-pro-max.  Originally `project_name.lower().replace(' ', '-')` left
characters like `..`, `/`, and `\\` intact, so a `--project-name "../etc"`
escaped the design-system output directory via mkdir(parents=True).
"""

import re


def _sanitize_slug(name: str) -> str:
    """Return a filesystem-safe slug from `name`.

    Strips every character that is not in [a-z0-9-]. Spaces become
    hyphens before stripping. Returns 'default' when the result is empty
    (e.g. input was None, empty string, or contained only path-traversal
    characters).

    MEH-404 hardening (over MEH-398 baseline):
        F-3 collapse multi-hyphens, F-7 cap at 64, F-4 trim end hyphens.
        Order: strip -> collapse -> cap -> trim. Trim AFTER cap so a cap
        landing mid-hyphen-run can't leave a trailing dash.
    """
    slug = re.sub(r'[^a-z0-9-]', '', (name or '').lower().replace(' ', '-'))
    slug = re.sub(r'-+', '-', slug)   # F-3
    slug = slug[:64]                   # F-7
    slug = slug.strip('-')             # F-4 (after cap)
    return slug or 'default'


if __name__ == "__main__":
    # Sandbox sanity check — runnable without pytest. Mirrors the 5
    # required test cases from the MEH-398 acceptance criteria + MEH-404.
    assert _sanitize_slug("../../../foo") == "foo"
    assert _sanitize_slug("normal name") == "normal-name"
    assert _sanitize_slug("../") == "default"
    assert _sanitize_slug("name/with/slash") == "namewithslash"
    assert _sanitize_slug("") == "default"
    # MEH-404
    assert _sanitize_slug("foo--bar") == "foo-bar"
    assert _sanitize_slug("-foo-") == "foo"
    assert len(_sanitize_slug("a" * 1000)) == 64
    assert _sanitize_slug("--") == "default"
    assert len(_sanitize_slug("foo" * 100)) == 64
    print("OK")
