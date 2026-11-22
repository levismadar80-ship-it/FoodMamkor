"""
Module:   chat_site_knowledge
Purpose:  The prompt paragraph that tells the AI assistant which tools a
          business gets — built from the site's own tool registry, not
          written by hand, so a new tool reaches the assistant by itself.
Touches:  reads app/data/chat_business_features.json (no DB, no network).
Does NOT: own the list or its words: frontend/lib/business-features.js and
          messages/he.json `business_features` do. The JSON is generated from
          them by frontend/lib/chat-knowledge.js, and
          frontend/__tests__/ChatKnowledgeSync.test.js fails when it is stale.
Related:  app/routers/chat.py (`_base_system_prompt`) · app/site_pages.py.
History:  20/11 — Sapir: «why join» answered from a fixed text that missed
          tools added since.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from functools import cache
from pathlib import Path
from typing import Any

_FILE = Path(__file__).resolve().parent.parent / "data" / "chat_business_features.json"


@cache
def _load() -> dict[str, Any]:
    with _FILE.open(encoding="utf-8") as fh:
        data: dict[str, Any] = json.load(fh)
    return data


def business_tools_section(flag_on: Callable[[str], bool]) -> str:
    """One line per group. A tool behind a switch (`flag`) is listed only
    while `flag_on(flag)` says the visitor can reach it."""
    lines = []
    for group in _load()["groups"]:
        labels = [
            i["label"] for i in group["items"] if "flag" not in i or flag_on(i["flag"])
        ]
        if labels:
            lines.append(f"{group['label']}: " + "; ".join(labels) + ".")
    return (
        "**הכלים שבית עסק מקבל באתר**\n"
        "זו הרשימה המלאה והמעודכנת של הכלים, כפי שהיא מופיעה בעמוד /join. "
        "כשבית עסק שואל מה הוא מקבל או למה כדאי לו להצטרף, עני לפי הרשימה "
        "הזאת: בחרי את הכלים שהכי מתאימים לשאלה, אל תוסיפי כלים שאינם "
        "ברשימה, והפני לעמוד /join לרשימה המלאה. כל הכלים חינם בתקופת ההשקה.\n"
        + "\n".join(lines)
    )
