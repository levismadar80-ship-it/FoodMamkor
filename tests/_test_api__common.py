"""Shared helpers, constants and fixtures of `tests/test_api.py`.

Moved here verbatim by the MEH-3540 mechanical split. Not collected by
pytest (no `test_` prefix); `tests/test_api.py` is the module pytest runs.
"""

import pytest
from app.models.models import AdminSetting, ContactClick, ContactMessage, Producer, ProducerReview, ProducerWhatsAppClick, StaticPage, User
from app.utils.clock import israel_today
from conftest import (
    auth_header,
    make_category,
    make_producer,
    make_submit_ready_producer,
    make_user,
    valid_producer_register_payload,
    valid_review_payload,
)
from app.utils.clock import utc_now


# ---------- Auth ----------

_REGISTER_ACK_DETAIL = (
    "אם האימייל פנוי, שלחנו אליו הודעת אימות. כדאי לבדוק את תיבת הדואר."
)



def _signup_cookie_shape(resp):
    """(name, value length, attributes) of the reply's ONLY Set-Cookie.

    MEH-3087 — used by the register anti-enumeration tests: the marker's
    value is random-looking by design, everything else must be identical.
    """
    cookies = resp.headers.get_list("set-cookie")
    assert len(cookies) == 1, cookies
    pair, _, attrs = cookies[0].partition(";")
    name, _, value = pair.partition("=")
    return name, len(value), attrs.lower()
