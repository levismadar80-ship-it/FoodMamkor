"""MEH-2779: the shard split must cover every test exactly once.

If two shards could claim the same test, or none could, the combined CI run
would silently run a different suite from the single-job run it replaced.
These tests pin the partition property against the real implementation and
against the real test corpus (the files in this directory), not a copy.
"""

from pathlib import Path

import pytest

import ci_shard

TESTS_DIR = Path(__file__).parent

# Anchored to real files: one node id per test function in the corpus, so a
# hashing change that happens to work for synthetic ids is still checked here.
REAL_NODEIDS = sorted(
    {
        f"tests/{p.name}::{line.split('def ', 1)[1].split('(', 1)[0]}"
        for p in TESTS_DIR.glob("test_*.py")
        for line in p.read_text(encoding="utf-8").splitlines()
        if line.lstrip().startswith("def test_")
    }
)  # a set: same-named methods in different classes would repeat


def test_corpus_is_real():
    # If the scan above found nothing, every assertion below is vacuous.
    assert len(REAL_NODEIDS) > 1000
    assert "tests/test_ci_shard.py::test_corpus_is_real" in REAL_NODEIDS


@pytest.mark.parametrize("total", [1, 2, 3, 4])
def test_every_test_lands_in_exactly_one_shard(total):
    owners = {}
    for index in range(1, total + 1):
        kept, dropped = ci_shard.split(REAL_NODEIDS, index, total)
        assert len(kept) + len(dropped) == len(REAL_NODEIDS)
        for nid in kept:
            assert nid not in owners, f"{nid} in shard {owners[nid]} and {index}"
            owners[nid] = index
    assert len(owners) == len(REAL_NODEIDS)


def test_shards_are_balanced():
    sizes = [len(ci_shard.split(REAL_NODEIDS, i, 3)[0]) for i in (1, 2, 3)]
    assert max(sizes) - min(sizes) <= 1, sizes


def test_repeated_node_ids_are_spread():
    # schemathesis yields hundreds of items under ONE node id. A split keyed
    # on the id (the first version) sent all of them to one shard.
    items = ["tests/test_fuzz_schemathesis.py::test_fuzz_authenticated"] * 300
    sizes = [len(ci_shard.split(items, i, 3)[0]) for i in (1, 2, 3)]
    assert sizes == [100, 100, 100], sizes


@pytest.mark.parametrize("bad", ["", "3", "0/3", "4/3", "1/0", "a/b", "1/2/3"])
def test_bad_value_is_rejected(bad):
    with pytest.raises(ValueError):
        ci_shard.parse_shard(bad)


def test_apply_is_a_noop_without_the_env_var(monkeypatch):
    monkeypatch.delenv(ci_shard.ENV_VAR, raising=False)
    items = ["a", "b"]
    ci_shard.apply(config=None, items=items)
    assert items == ["a", "b"]
