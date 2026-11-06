"""MEH-2779: split the pytest suite across N parallel CI jobs.

CI runs the suite as 3 jobs, each with its own Postgres service. Each job
sets ``PYTEST_SHARD=<i>/<n>`` and keeps only its share of the tests
(below). A later job combines the coverage data of all shards and applies
the coverage floor once, over the whole suite.

The assignment is round-robin over the collection order: test number ``k``
(0-based) goes to shard ``k % n + 1``. Every pytest-xdist worker in a job
collects the suite on its own and xdist already requires all of them to
collect the same items in the same order, so all workers deselect exactly
the same tests. A hash of the node id was tried first and rejected:
schemathesis yields ~470 items that share two node ids, and a hash sends
each group to one shard (measured spread 1,569 / 1,720 / 1,876).

The tests are close to uniform in cost (about 0.5 s each, dominated by the
per-test TRUNCATE in ``conftest._clean_tables``), so balancing by count is
balancing by time; round-robin makes the shard sizes differ by at most 1.

Without ``PYTEST_SHARD`` nothing is deselected — local runs are unchanged.
"""

from __future__ import annotations

import hashlib
import os

ENV_VAR = "PYTEST_SHARD"
# Written (when set) by the first worker of each shard, so the combine job can
# prove that the shards together ran the whole suite. One line:
# "<index> <total> <kept> <suite size> <order fingerprint>".
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


def shard_of(position: int, total: int) -> int:
    """1-based shard that owns the test at 0-based collection ``position``."""
    return position % total + 1


def split(items, index: int, total: int) -> tuple[list, list]:
    """Return ``(kept, dropped)`` for shard ``index`` of ``total``."""
    kept, dropped = [], []
    for position, item in enumerate(items):
        (kept if shard_of(position, total) == index else dropped).append(item)
    return kept, dropped


def apply(config, items) -> None:
    """``pytest_collection_modifyitems`` body. No-op without the env var."""
    value = os.environ.get(ENV_VAR)
    if value is None:
        return
    # Set but empty (e.g. a broken matrix expression) is an error, not "off":
    # otherwise every shard job would silently run the whole suite.
    index, total = parse_shard(value)
    # Fingerprint of the ordered list being split. Round-robin is a partition
    # only if every shard job split the SAME list in the SAME order; the
    # combine job fails if the shards' fingerprints differ.
    order = hashlib.sha256("\n".join(i.nodeid for i in items).encode()).hexdigest()[:16]
    kept, dropped = split(items, index, total)
    if dropped:
        config.hook.pytest_deselected(items=dropped)
    items[:] = kept

    # One writer per job: the serial run (no worker id) or xdist's first worker,
    # which xdist always names "gw0". The combine job fails if a report is missing.
    report = os.environ.get(REPORT_ENV_VAR)
    worker = os.environ.get("PYTEST_XDIST_WORKER")
    if report and worker in (None, "gw0"):
        with open(report, "w", encoding="utf-8") as fh:
            fh.write(
                f"{index} {total} {len(kept)} {len(kept) + len(dropped)} {order}\n"
            )
