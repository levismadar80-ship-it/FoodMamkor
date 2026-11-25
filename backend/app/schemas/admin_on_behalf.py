"""
Module:   schemas/admin_on_behalf
Purpose:  Request bodies for an admin writing a business's events and
          experiences: the owner's own create/update shapes plus one required
          field, `owner_consent`, that the business agreed in writing.
Does NOT: Store the consent anywhere. The route records it on the admin audit
          row (services/admin_audit.note, MEH-3306), which already holds who
          and when.
Related:  routers/admin_business_content.py, schemas/events.py EventCreate /
          EventUpdate, schemas/experiences.py ExperienceCreate / ExperienceUpdate.
History:  MEH-3873 (creation — Sapir 25/11: «בהסכמת בית העסק», option A on the
          card: a confirmation on every save, no standing consent column).
"""

from typing import Any, Literal

from pydantic import BaseModel

from app.schemas.events import EventCreate, EventUpdate
from app.schemas.experiences import ExperienceCreate, ExperienceUpdate

# DO NOT relax to `bool` — False would pass validation and the save would go
# through without the business's consent (MEH-3873).
OwnerConsent = Literal[True]


class _OwnerConsentMixin(BaseModel):
    owner_consent: OwnerConsent


def without_consent(data: BaseModel) -> dict[str, Any]:
    """The fields the caller actually sent, minus `owner_consent` — so the
    owner shape rebuilt from it keeps the same `model_fields_set` (an update
    applies only what was sent)."""
    return data.model_dump(exclude_unset=True, exclude={"owner_consent"})


class AdminEventCreate(EventCreate, _OwnerConsentMixin):
    pass


class AdminEventUpdate(EventUpdate, _OwnerConsentMixin):
    pass


class AdminExperienceCreate(ExperienceCreate, _OwnerConsentMixin):
    pass


class AdminExperienceUpdate(ExperienceUpdate, _OwnerConsentMixin):
    pass
