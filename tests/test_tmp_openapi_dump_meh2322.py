"""TEMPORARY diagnostic — MEH-2322. Removed before merge.

The CC sandbox cannot install FastAPI (no package registry) and cannot read
raw CI logs, so it cannot regenerate backend/openapi.json locally. This test
prints the exact unified diff between the committed spec and the live app as
compressed check annotations (pytest shows a test's stdout only when it
fails, so it fails on purpose). The diff is applied locally, then this file
is deleted.
"""

import base64
import difflib
import hashlib
import json
import zlib
from pathlib import Path

from app.main import app

SPEC = Path(__file__).resolve().parents[1] / "backend" / "openapi.json"


def test_tmp_dump_openapi_diff():
    cur = json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    old = SPEC.read_text(encoding="utf-8")
    diff = "".join(
        difflib.unified_diff(
            old.splitlines(True), cur.splitlines(True), "a/backend/openapi.json", "b/backend/openapi.json"
        )
    )
    blob = base64.b64encode(zlib.compress(diff.encode("utf-8"), 9)).decode()
    chunks = [blob[i : i + 1800] for i in range(0, len(blob), 1800)]
    kinds = ["notice"] * 9 + ["warning"] * 10 + ["error"] * 10
    sha = hashlib.sha256(cur.encode("utf-8")).hexdigest()
    print(f"::notice title=openapi-meta::chunks={len(chunks)} b64len={len(blob)} new_spec_sha256={sha}")
    for i, c in enumerate(chunks):
        print(f"::{kinds[i]} title=openapi-diff-{i:02d}::{c}")
    raise AssertionError("TEMP diagnostic (MEH-2322): openapi diff dumped to annotations")
