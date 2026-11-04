"""MEH-2119 — the temporary stack-depth probe is gone.

The probe (`app/utils/stack_probe.py`, logged from GET /producers/by-slug and
GET /categories) did its one job on 01–02/11: both routes read depth=10 on
staging, which the card's §4 table resolves to "do not convert". It was
writing 60+ INFO lines a minute on staging after that. This pins the removal
by behaviour: the two routes it instrumented no longer emit a `stack_probe`
line, and the module is not importable.
"""

import importlib
import logging

import pytest
from conftest import make_producer


def _probe_lines(caplog):
    return [r for r in caplog.records if "stack_probe" in r.getMessage()]


def test_categories_route_emits_no_probe_line(client, caplog):
    with caplog.at_level(logging.INFO):
        resp = client.get("/categories")
    assert resp.status_code == 200
    assert _probe_lines(caplog) == []


def test_by_slug_route_emits_no_probe_line(client, db, caplog):
    producer = make_producer(db)
    producer.slug = "meh-2119-probe"  # make_producer sets no slug
    db.commit()
    with caplog.at_level(logging.INFO):
        resp = client.get(f"/producers/by-slug/{producer.slug}")
    assert resp.status_code == 200, resp.text
    assert _probe_lines(caplog) == []


def test_probe_module_is_gone():
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("app.utils.stack_probe")
