"""MEH-2779: split the pytest suite across N parallel CI jobs.

CI runs the suite as 3 jobs, each with its own Postgres service. Each job
sets ``PYTEST_SHARD=<i>/<n>`` and keeps only the tests whose node id hashes
to shard ``i``. A later job combines the coverage data of all shards and
applies the coverage floor once, over the whole suite.

The assignment is a stable hash of the node id (``sha1``, not ``hash()``,
which is salted per process). That matters twice:

* every pytest-xdist worker in a job collects the suite on its own, and all
  of them must deselect exactly the same tests, or xdist aborts the run;
* adding or removing one test moves only that test, never the others.

The tests are close to uniform in cost (≈0.5 s each, dominated by the
per-test TRUNCATE in ``conftest._clean_tables``), so balancing by count is
balancing by time. 5,151 tests over 3 shards: the largest shard is within
about 2% of the mean.

Without ``PYTEST_SHARD`` nothing is deselected — local runs are unchanged.
"""

from __future__ import annotations

import hashlib
import os

ENV_VAR = "PYTEST_SHARD"
# Written (when set) by the first worker of each shard, so the combine job can
# prove that the shards together ran the whole suite.
REPORT_ENV_VAR = "PYTEST_SHARD_REPORT"


def parse_shard(value: str) -> tuple[int, int]:
    """``"2/3"`` -> ``(2, 3)``. Shard numbers are 1-based."""
    try:
        index_s, total_s = value.split("/")
        index, total = int(index_s), int(total_s)
    except ValueError:
        raise ValueError(
            f"{ENV_VAR}={value!r} is not '<index>/<total>' (e.g. '1/3')"
        ) from None
    if total < 1 or not 1 <= index <= total:
        raise ValueError(f"{ENV_VAR}={value!r}: need 1 <= index <= total")
    return index, total


def shard_of(nodeid: str, total: int) -> int:
    """1-based shard that owns ``nodeid``."""
    digest = hashlib.sha1(nodeid.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") % total + 1


def split(nodeids, index: int, total: int) -> tuple[list, list]:
    """Return ``(kept, dropped)`` for shard ``index`` of ``total``."""
    kept, dropped = [], []
    for nid in nodeids:
        (kept if shard_of(nid, total) == index else dropped).append(nid)
    return kept, dropped


def apply(config, items) -> None:
    """``pytest_collection_modifyitems`` body. No-op without the env var."""
    value = os.environ.get(ENV_VAR)
    if not value:
        return
    index, total = parse_shard(value)
    kept, dropped = [], []
    for item in items:
        (kept if shard_of(item.nodeid, total) == index else dropped).append(item)
    if dropped:
        config.hook.pytest_deselected(items=dropped)
    items[:] = kept

    report = os.environ.get(REPORT_ENV_VAR)
    worker = os.environ.get("PYTEST_XDIST_WORKER")
    if report and worker in (None, "gw0"):
        with open(report, "w", encoding="utf-8") as fh:
            fh.write(f"{index} {total} {len(kept)} {len(kept) + len(dropped)}\n")
