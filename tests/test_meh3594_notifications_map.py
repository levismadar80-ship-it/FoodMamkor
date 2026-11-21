"""MEH-3594 — docs/NOTIFICATIONS.md is the site's message map, made from code.

Every place the backend sends a message (email, WhatsApp, Web Push) is one row:
the function that sends, its channels, who it is about. The rows come from the
MEH-2952 send-layer inventory (PINNED, which test_meh2952_send_layer already
holds equal to the code) plus the Web Push calls, so this file adds no second
scanner. A new send site therefore goes red twice: the inventory wants a pin,
and this test wants the map regenerated — and whoever regenerates it sees the
new row, and whether it has only one channel.

Regenerate:  UPDATE_NOTIFICATIONS_MAP=1 pytest tests/test_meh3594_notifications_map.py
Source-text by nature (it documents the code); the inventory it reads is
itself checked against the AST on every run.
"""

from __future__ import annotations

import ast
import os
from collections import defaultdict
from pathlib import Path

from tests._test_meh2952_send_layer__common import APP_DIR, PINNED

DOC = Path(__file__).resolve().parents[1] / "docs" / "NOTIFICATIONS.md"
BEGIN = "<!-- BEGIN GENERATED: tests/test_meh3594_notifications_map.py -->"
END = "<!-- END GENERATED -->"

EMAIL = {"send_email", "send_email_result", "_send_email", "_send_notification_email"}
WHATSAPP = {"send_text", "send_template", "send_template_result", "ping_admin"}
CHANNEL_HE = {"email": "מייל", "whatsapp": "וואטסאפ", "push": "push"}
AUDIENCE_HE = {
    "business": "בית עסק / מנהלת",
    "owner": "בעלת העסק",
    "consumer": "לקוחה",
    "auth": "משתמשת (חשבון)",
    "none": "בלי שורת עסק",
}
# The functions that ARE the send layer — a row for them would say "the
# wrapper sends", which is true and tells the reader nothing.
WRAPPERS = (
    EMAIL
    | WHATSAPP
    | {"_send_whatsapp_alert", "_send_whatsapp_otp", "send_push_notification"}
)


def _channel(callee: str) -> str | None:
    # `add_task(send_email)` → the passed name is the channel.
    name = callee.split("(")[-1].rstrip(")")
    if name in EMAIL:
        return "email"
    if name in WHATSAPP:
        return "whatsapp"
    return None


def _push_sites() -> list[tuple[str, str]]:
    out = []
    for p in sorted(APP_DIR.rglob("*.py")):
        tree = ast.parse(p.read_text(encoding="utf-8"))
        for fn in ast.walk(tree):
            if not isinstance(fn, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            for node in ast.walk(fn):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name)
                    and node.func.id == "send_push_notification"
                ):
                    out.append((str(p.relative_to(APP_DIR)), fn.name))
    return sorted(set(out))


def build_rows() -> list[tuple[str, str, list[str], str]]:
    channels: dict[tuple[str, str], set[str]] = defaultdict(set)
    audience: dict[tuple[str, str], str] = {}
    for (file, func, callee), (_n, group, _why) in PINNED.items():
        ch = _channel(callee)
        if ch is None or func.split(".")[-1] in WRAPPERS:
            continue
        channels[(file, func)].add(ch)
        audience.setdefault((file, func), group)
    for file, func in _push_sites():
        channels[(file, func)].add("push")
        audience.setdefault((file, func), "consumer")
    order = ["email", "whatsapp", "push"]
    return [
        (file, func, [c for c in order if c in chans], audience[(file, func)])
        for (file, func), chans in sorted(channels.items())
    ]


def render() -> str:
    rows = build_rows()
    one = sum(1 for r in rows if len(r[2]) == 1)
    lines = [
        BEGIN,
        "",
        f"{len(rows)} send sites · {one} on a single channel.",
        "",
        "| קובץ (`backend/app/`) | פונקציה | ערוצים | על מי |",
        "|---|---|---|---|",
    ]
    for file, func, chans, group in rows:
        he = " + ".join(CHANNEL_HE[c] for c in chans)
        lines.append(
            f"| `{file}` | `{func}` | {he} | {AUDIENCE_HE.get(group, group)} |"
        )
    lines += ["", END]
    return "\n".join(lines)


def _current() -> str:
    text = DOC.read_text(encoding="utf-8")
    return text[text.index(BEGIN) : text.index(END) + len(END)]


def test_map_is_current():
    want = render()
    if os.environ.get("UPDATE_NOTIFICATIONS_MAP"):
        text = DOC.read_text(encoding="utf-8")
        DOC.write_text(text.replace(_current(), want), encoding="utf-8")
    assert _current() == want, (
        "docs/NOTIFICATIONS.md is out of date — a send site was added or removed. "
        "Run: UPDATE_NOTIFICATIONS_MAP=1 pytest tests/test_meh3594_notifications_map.py "
        "and read the new row: does it reach the reader on every channel it should?"
    )


def test_map_sees_the_known_sites():
    # Control: rows the map must contain, so an empty map cannot read as green.
    rows = {(f, fn): ch for f, fn, ch, _g in build_rows()}
    assert len(rows) > 40, "the map found almost nothing — the inventory read is broken"
    assert rows[("services/auth_notifications.py", "notify_admin_new_recipe")] == [
        "email",
        "whatsapp",
    ]
    assert any("push" in ch for ch in rows.values()), "no Web Push site found"


def test_a_new_send_site_turns_the_map_red(monkeypatch):
    import tests.test_meh3594_notifications_map as me

    fake = dict(PINNED)
    fake[("services/new_feature.py", "notify_someone", "send_email")] = (
        1,
        "consumer",
        "x",
    )
    monkeypatch.setattr(me, "PINNED", fake)
    assert me.render() != _current()
