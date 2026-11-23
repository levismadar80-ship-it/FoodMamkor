# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3752 PR)
"""
Module:   form_fill_windows
Purpose:  The hand-over windows of an order-setup draft (MEH-3752): keep a
          window only when the text names its day and states its hours (a
          clock time, an hour number, or a part of the day such as «בבוקר»),
          and only when the week still passes the save's own check.
Touches:  nothing; pure.
Owns:     the Hebrew day names and the «is this hour written?» check,
          which form_filler also uses for an event's date and time.
Does NOT: save (the owner approves in OrderWindowsCard, which PUTs
          /producers/me/order-windows); read the clock.
Related:  services/form_filler.py (the engine, type "windows") ·
          schemas/product_order_offer.py OrderWindowIn / OrderWindowsIn (the
          same validation as a manual save) · data/form_maps/order_setup.json
History:  MEH-3752 (creation)
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import ValidationError

from app.schemas.product_order_offer import OrderWindowIn, OrderWindowsIn

# 0 = Sunday … 6 = Saturday, as producers.order_window and OrderWindowIn.
DAYS = ("ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת")
# A part of the day the prompt turns into these hours; the text must say it.
PARTS_OF_DAY: dict[str, tuple[str, str]] = {
    "אחר הצהריים": ("14:00", "18:00"),
    "אחה״צ": ("14:00", "18:00"),
    'אחה"צ': ("14:00", "18:00"),
    "בוקר": ("08:00", "12:00"),
    "צהריים": ("12:00", "16:00"),
    "ערב": ("17:00", "21:00"),
}
_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_FULFILMENT = ("pickup", "delivery")


def json_type() -> dict[str, object]:
    """The structured-output schema of one draft's windows."""
    return {
        "type": "array",
        "items": {
            "type": "object",
            "additionalProperties": False,
            "required": ["weekday", "start_time", "end_time", "fulfilment"],
            "properties": {
                "weekday": {"type": "integer"},
                "start_time": {"type": "string"},
                "end_time": {"type": "string"},
                "fulfilment": {"type": "string", "enum": list(_FULFILMENT)},
            },
        },
    }


def _day_pattern(weekday: int) -> str:
    return rf"(?<![א-ת])(?:ו?ב|ה)?(?:יום\s+)?{re.escape(DAYS[weekday])}(?![א-ת])"


def day_named(weekday: int, source: str) -> bool:
    """«שישי», «בשישי», «יום שישי»; not inside another word («שנית»).
    Also dates an event (form_filler._date)."""
    return bool(re.search(_day_pattern(weekday), source))


def _part_of_day_by(weekday: int, words: str, source: str) -> bool:
    """«בשישי בבוקר»: the part of the day in the same phrase as its day, so
    «עד חמישי בערב, איסוף בשישי בבוקר» gives Friday no evening."""
    for m in re.finditer(_day_pattern(weekday), source):
        phrase = re.split(r"[,.;\n]", source[m.end() :], maxsplit=1)[0]
        if words in phrase:
            return True
    return False


def hour_stated(hhmm: str, source: str) -> bool:
    """«09:00» or «9:00» as written, or a whole hour as a stand-alone number
    («9-12», «בשעה 9»). Also ties an event time to the text."""
    hour, minutes = int(hhmm[:2]), hhmm[3:]
    if hhmm in source or f"{hour}:{minutes}" in source:
        return True
    return minutes == "00" and bool(
        re.search(rf"(?<![\d:.]){hour}(?![\d.]|:\d)", source)
    )


def _hours_stated(weekday: int, start: str, end: str, source: str) -> bool:
    if hour_stated(start, source) and hour_stated(end, source):
        return True
    return any(
        (start, end) == hours and _part_of_day_by(weekday, words, source)
        for words, hours in PARTS_OF_DAY.items()
    )


def _shape(raw: object) -> tuple[int, str, str, str] | None:
    """(weekday, start, end, fulfilment) when the model's item has the right
    shape: weekday 0–6, HH:MM times, pickup or delivery."""
    if not isinstance(raw, dict):
        return None
    weekday, start, end = raw.get("weekday"), raw.get("start_time"), raw.get("end_time")
    fulfilment = raw.get("fulfilment")
    ok = (
        isinstance(weekday, int)
        and not isinstance(weekday, bool)
        and 0 <= weekday <= 6  # noqa: PLR2004 — Sunday … Saturday
        and isinstance(start, str)
        and isinstance(end, str)
        and bool(_TIME.match(start) and _TIME.match(end))
        and fulfilment in _FULFILMENT
    )
    if not ok:
        return None
    return weekday, start, end, fulfilment  # type: ignore[return-value]


def _one(raw: object, source: str) -> dict[str, Any] | None:
    shape = _shape(raw)
    if shape is None:
        return None
    weekday, start, end, fulfilment = shape
    if not (day_named(weekday, source) and _hours_stated(weekday, start, end, source)):
        return None
    try:  # the same check as a manual save: ends after it starts
        OrderWindowIn(
            weekday=weekday, start_time=start, end_time=end, fulfilment=fulfilment
        )
    except ValidationError:
        return None
    return {
        "weekday": weekday,
        "start_time": start,
        "end_time": end,
        "fulfilment": fulfilment,
    }


def windows(raw: object, limit: int, source: str) -> list[dict[str, Any]]:
    """The windows the text backs, in the model's order, that save together:
    a window that would overlap an earlier one of its day and kind is left out."""
    kept: list[dict[str, Any]] = []
    for item in raw if isinstance(raw, list) else []:
        window = _one(item, source)
        if window is None or window in kept or len(kept) >= limit:
            continue
        try:
            OrderWindowsIn.model_validate({"windows": [*kept, window]})
        except ValidationError:
            continue
        kept.append(window)
    return kept
