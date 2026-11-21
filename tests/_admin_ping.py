"""MEH-3589 test helper: read what ping_admin sent.

ping_admin sends AdminUpdateV1(topic, detail) through
app.services.admin_whatsapp.send_template. A test patches that name and reads
the two parameters back as one string, one line each — so a test that checks
the admin saw the business name, or that a crafted newline was flattened,
reads the same thing Meta would put in the message.
"""

from __future__ import annotations

TARGET = "app.services.admin_whatsapp.send_template"


def ping_text(mock) -> str:
    """'<topic>\\n<detail>' from the last call of a patched send_template."""
    template = mock.call_args.args[1]
    return f"{template.topic}\n{template.detail}"
