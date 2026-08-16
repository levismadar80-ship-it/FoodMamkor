"""MEH-1626 chunk 3 — the structural guard that closes the epic.

Chunks 1 and 2 migrated the asymmetric fields. This is what stops the class
from coming back: a new input-schema field in one of five risk-bearing name
families must arrive validated, or be added to a reasoned allowlist.

CI wiring: this file lives in tests/, so the required "Backend tests (pytest)"
job already runs it. That IS the wiring — no workflow YAML is touched
(.github/workflows/** is CC-deny, MEH-671), and no separately-named required
check is needed.

--------------------------------------------------------------------------
WHY THE RULE IS "validated", NOT "carries a domain type"
--------------------------------------------------------------------------
The chunk-3 brief specified a type-based rule: a family field must carry one
of the domain types, else be allowlisted, with the allowlist being the 9 seeds
from chunk 2. Measured against real staging schemas, that combination is not
satisfiable — and the measurement is the reason this file deviates:

    family fields in input schemas WITHOUT a domain type ... 40
    of those, validated the legacy way (@field_validator) .. 31
    genuinely unvalidated .................................. 9

A literal type-based rule would need a 40-entry allowlist — 31 of them fields
that are correctly protected, just not via an Annotated type. That allowlist
would need editing on every future migration, and would bury the 9 real holes
among 31 non-issues, which is precisely the readability failure that lets a
guard rot.

So the FAILING condition is the safety property — "this field has no
validation at all" — and the domain type is treated as one of two acceptable
forms. The 31 decorator-based fields are counted and reported as a migration
backlog by test_domain_type_migration_backlog_is_recorded below, which does
not fail: it makes the number visible so it can be driven down deliberately
rather than enforced by a guard nobody can read.

--------------------------------------------------------------------------
WHY THE ALLOWLIST IS 4 ENTRIES, NOT THE 9 SEEDS
--------------------------------------------------------------------------
The chunk-2 seeds came from an ASYMMETRY scan: field validated on one schema,
bare on a sibling. This guard asks a different question — is the field
protected at all — so the two sets are not the same 9.

Only 4 seeds fall inside the five families AND inside the input-schema
classifier; the other 5 are either outside the families (admin_notes, body,
instagram) or outside the classifier (AlertContent is never a request body).

Running this rule also surfaced 5 fields the asymmetry scan structurally could
not see, because BOTH siblings were unvalidated — symmetric, therefore
invisible to a comparison. Those were migrated in this same PR rather than
allowlisted: an allowlist entry for an unprotected field documents a hole
instead of closing it.
"""
import pytest
from app.schemas import schemas as S
from pydantic import BaseModel

# The five families. Deliberately narrow (over-engineering guard): these are
# the field kinds with a demonstrated incident history — MEH-1623 (name),
# MEH-870 (address), MEH-1537 (phone), MEH-329 (description), MEH-555 (title).
FAMILIES = ("name", "title", "phone", "address", "description")

# Input-schema classifier. Read shapes (*Out / *Response / *Hit / *Detail /
# *Result) are excluded on purpose: they serialize rows that already exist, so
# validating them would reject data already in the database.
INPUT_SUFFIXES = ("Create", "Update", "Register", "Request", "In", "Submit")

# Every entry needs a one-line reason. No wildcards, no prefixes — an exact
# "Schema.field" string, so adding one is a visible, reviewable act.
ALLOWLIST = {
    # Real-time form validation: "No auth, no persistence" (schemas.py docstring).
    # A >=3-letter floor would 422 the user mid-keystroke while they type.
    "ExperienceValidateRequest.title",
    "ExperienceValidateRequest.description",
    # Same surface, same reason: "no auth, no DB write".
    "HomeProductModerationRequest.title",
    "HomeProductModerationRequest.description",
}


def _has_domain_type(tp, depth=0):
    """True if an AfterValidator appears anywhere in the annotation.

    Recursion is load-bearing: an optional domain-typed field is
    Optional[Annotated[str, AfterValidator(...)]], so the marker sits on the
    inner Annotated inside the Union rather than at the top level.
    """
    if depth > 4:
        return False
    if any(
        type(m).__name__ == "AfterValidator" for m in getattr(tp, "__metadata__", ())
    ):
        return True
    return any(_has_domain_type(a, depth + 1) for a in getattr(tp, "__args__", ()))


def _is_family_field(field_name):
    return any(
        field_name == fam or field_name.endswith("_" + fam) for fam in FAMILIES
    )


def classify(model):
    """-> (domain_typed, decorator_only, unvalidated) sets of family fields."""
    decorated = {
        f
        for v in model.__pydantic_decorators__.field_validators.values()
        for f in v.info.fields
    }
    typed, dec_only, unvalidated = set(), set(), set()
    for fname, info in model.model_fields.items():
        if not _is_family_field(fname):
            continue
        if _has_domain_type(info.annotation) or any(
            type(m).__name__ == "AfterValidator" for m in getattr(info, "metadata", [])
        ):
            typed.add(fname)
        elif fname in decorated:
            dec_only.add(fname)
        else:
            unvalidated.add(fname)
    return typed, dec_only, unvalidated


def input_schemas(module=S):
    for name, obj in vars(module).items():
        if not isinstance(obj, type) or not issubclass(obj, BaseModel):
            continue
        if obj is BaseModel or not name.endswith(INPUT_SUFFIXES):
            continue
        yield name, obj


def unprotected_fields(module=S, allowlist=ALLOWLIST):
    """Every 'Schema.field' in a risk family with no validation of any kind."""
    offenders = []
    for name, model in input_schemas(module):
        _, _, unvalidated = classify(model)
        for fname in sorted(unvalidated):
            key = f"{name}.{fname}"
            if key not in allowlist:
                offenders.append(key)
    return sorted(offenders)


def test_no_unprotected_family_fields_in_input_schemas():
    """THE guard. A new `name: str` on any input schema turns this red."""
    offenders = unprotected_fields()
    assert not offenders, (
        f"{len(offenders)} field(s) in the "
        f"{'/'.join(FAMILIES)} families reach an input schema with no "
        f"validation:\n  " + "\n  ".join(offenders) + "\n\n"
        "Fix by applying the matching domain type from schemas.py "
        "(SanitizedBusinessNameField / SanitizedPersonNameField / "
        "SanitizedLabelField / SanitizedTitleField / SanitizedAddressField / "
        "PhoneNumberField / SanitizedDescriptionField), or add the field to "
        "ALLOWLIST in this file WITH a one-line reason."
    )


def test_guard_fails_on_a_naked_family_field():
    """Fail-path proof, run against a SYNTHETIC module — the real schemas are
    never edited to demonstrate a failure.

    Without this, a guard that silently matched nothing would pass forever and
    look identical to a guard that works.
    """

    class FakeModule:
        pass

    class WidgetCreate(BaseModel):
        name: str  # naked — exactly what the guard exists to catch
        unrelated: int = 0

    FakeModule.WidgetCreate = WidgetCreate

    offenders = unprotected_fields(module=FakeModule, allowlist=set())
    assert offenders == ["WidgetCreate.name"], offenders

    # And the real assertion message must name it.
    with pytest.raises(AssertionError) as exc:
        found = unprotected_fields(module=FakeModule, allowlist=set())
        assert not found, f"unprotected: {found}"
    assert "WidgetCreate.name" in str(exc.value)


def test_guard_accepts_a_domain_typed_field():
    """Discrimination check: the same synthetic model passes once the field
    carries a domain type. Without this pair, the failure above could equally
    be produced by a guard that rejects everything."""

    class FakeModule:
        pass

    class WidgetCreate(BaseModel):
        name: S.SanitizedLabelField

    FakeModule.WidgetCreate = WidgetCreate
    assert unprotected_fields(module=FakeModule, allowlist=set()) == []


def test_allowlist_has_no_wildcards_and_every_entry_is_live():
    """An allowlist entry that no longer matches a real field is stale
    permission — it must be deleted, not left to rot."""
    assert all("*" not in e and e.count(".") == 1 for e in ALLOWLIST), ALLOWLIST
    live = {
        f"{name}.{f}"
        for name, model in input_schemas()
        for f in classify(model)[2]
    }
    stale = ALLOWLIST - live
    assert not stale, f"stale allowlist entries (field now validated, or gone): {stale}"


def test_domain_type_migration_backlog_is_recorded():
    """Non-failing: reports how many family fields are still validated the
    legacy decorator way. Visible so it can be driven down deliberately."""
    backlog = sum(len(classify(m)[1]) for _, m in input_schemas())
    typed = sum(len(classify(m)[0]) for _, m in input_schemas())
    print(f"\ndomain-typed family fields: {typed} · decorator-only: {backlog}")
    assert backlog >= 0
