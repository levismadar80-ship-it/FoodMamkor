"""MEH-2351: JSON schemas for the moderation calls' structured outputs.

Passed as ``ai_fast_request_kwargs(json_schema=...)``. With structured
outputs the API constrains the reply to these schemas, so ``status`` is
always one of the three verdicts on a completed response. Truncation
(``max_tokens``) and refusals are the two cases the schema cannot cover;
both keep their explicit handling at each call site.

No length limits here: ``minLength``/``maxLength`` are not supported by
structured outputs. Reasons are bounded by the prompt and ``max_tokens``.
"""

from __future__ import annotations

VERDICTS = ["APPROVED", "FLAGGED", "REJECTED"]

#: Experience + recipe pre-moderation: verdict, reason, optional suggestion.
MODERATION_VERDICT_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": VERDICTS},
        "reason": {"type": "string"},
        "suggestion": {"anyOf": [{"type": "string"}, {"type": "null"}]},
    },
    "required": ["status", "reason", "suggestion"],
    "additionalProperties": False,
}

#: Review moderation: verdict + reason (no suggestion is shown to anyone).
REVIEW_VERDICT_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": VERDICTS},
        "reason": {"type": "string"},
    },
    "required": ["status", "reason"],
    "additionalProperties": False,
}

#: Producer risk score (admin-only signal). Range 0-100 stays clamped in
#: code — numeric bounds are not supported by structured outputs.
RISK_SCORE_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "score": {"type": "integer"},
        "reasoning": {"type": "string"},
    },
    "required": ["score", "reasoning"],
    "additionalProperties": False,
}
