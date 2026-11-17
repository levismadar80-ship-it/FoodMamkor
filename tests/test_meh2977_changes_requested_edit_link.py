"""MEH-2977 — the changes-requested email links the host to her edit page.

The workshop is in changes_requested when this mail goes out, so it is not
public: /experiences/<id> answers a real 404 since MEH-2977's middleware check
(the page's own fetch is anonymous). The «לעריכה» link must open the edit page
in her dashboard instead.
"""
from app.config import settings
from app.services import experience_notifications


def test_changes_requested_mail_links_to_the_dashboard_edit_page(monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(
        experience_notifications, "_send_email",
        lambda to, subject, body, test_cause=False: sent.append(body),
    )
    experience_notifications.notify_host_changes_requested(
        "her@example.com", "סדנת לחם", "exp-1", "נא להוסיף תמונה"
    )
    assert len(sent) == 1
    edit = f"{settings.frontend_url}/producer/dashboard/experiences/exp-1/edit"
    assert f"לעריכה: {edit}\n" in sent[0]
    assert f"{settings.frontend_url}/experiences/exp-1\n" not in sent[0]
