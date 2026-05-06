"""PII masking helpers for log/error output."""


def mask_phone(phone: str | None) -> str:
    """Return a masked phone safe for logs: last 4 digits only.

    None / empty -> '<missing>'. Fewer than 4 digits -> '***'.
    Strips non-digits before slicing so '050-123-4567', '+972501234567',
    and '0501234567' all yield '***4567'.
    """
    if not phone:
        return "<missing>"
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 4:
        return "***"
    return f"***{digits[-4:]}"
