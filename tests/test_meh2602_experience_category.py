"""MEH-2602: an experience category must be one of the form's values.

Staging sweep 29/10: POST /experiences stored «workshop» verbatim and the
experience page printed the raw word. The forms send Hebrew wire values
(frontend/lib/event-categories.js); events already reject anything else
(events.py VALID_CATEGORIES). Experiences now do too, at the schema.

DISCRIMINATION: on the pre-2602 schema the three "rejected" cases are red (the
model accepts any string); the "accepted" control passes on both.
"""

import pytest
from pydantic import ValidationError

from app.schemas.schemas import ExperienceUpdate


@pytest.mark.parametrize("value", ["workshop", "סדנאות", ""])
def test_unknown_category_is_rejected_on_update(value):
    with pytest.raises(ValidationError):
        ExperienceUpdate(category=value)


def test_control_form_values_and_absence_are_accepted():
    for value in ["בישול", "סדנה", "סיור אוכל", None]:
        assert ExperienceUpdate(category=value).category == value
