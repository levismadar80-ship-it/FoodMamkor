---
paths:
  - "backend/app/services/whatsapp*.py"
  - "backend/app/services/*notification*.py"
  - "backend/app/services/*email*.py"
  - "backend/app/services/push.py"
  - "backend/app/services/product_order_outbox.py"
  - "backend/app/services/rescue_digest.py"
  - "backend/app/services/rating_dispatcher.py"
  - "backend/app/services/auto_reply_watchdog.py"
  - "backend/app/routers/alerts.py"
  - "backend/app/routers/admin_kashrut.py"
  - "backend/app/routers/producer_me_review.py"
---

# Notification channels: who gets WhatsApp and who gets email (MEH-3596)

Sapir's decision of 21/11/2026. Use this file when you add a message, move one
to another channel, or propose a WhatsApp template. Do not ask Sapir again.

## The channel table

| Who receives it | What it is | Channel |
|---|---|---|
| A customer or a business owner | About something they did themselves, and urgent (an order, a code, an approval they are waiting for) | WhatsApp + email |
| A customer or a business owner | A summary, a record, a reminder, anything not urgent | Email only |
| The admin | Anything | Email only |

- **Admin alerts are email only.** Meta reads an internal message to the
  admin as Marketing, because it is not about the recipient's own order or
  account. `admin_update_v1` was flagged as Marketing in both wordings on
  21/11 and was never submitted.
- **The one exemption** is `admin_business_pending_v1` (MEH-3147), which
  predates the decision. Whether it moves to email too is Sapir's call. Until
  then it is the only entry in `ADMIN_WHATSAPP_EXEMPT` in
  `tests/test_meh3596_channel_policy.py`, with its reason. Adding an
  exemption means editing both that list and `ALLOWED_TEMPLATE` in
  `tests/test_meh3589_admin_whatsapp.py`; the first test fails if they differ.
- WhatsApp outside Meta's 24-hour window must be an approved template.
  Free-text `send_text` there is dropped (131047).

## Before you propose a new WhatsApp template

1. **Check the map first.** The list of every send site with its channels is
   `docs/NOTIFICATIONS.md` (MEH-3594, generated from code). Until that file
   is on staging, grep `backend/app` for `send_template(`, `send_text(` and
   `send_email(`. An existing template or the email may already cover it.
2. **State its Meta category and why it qualifies.** UTILITY is for a
   message about the recipient's own existing order, booking or account.
   AUTHENTICATION is for a one-time code. Anything else reads as MARKETING,
   which costs more and gets a stricter review. If the honest answer is
   "it is not about their own order or account", it is not UTILITY.
3. **Set `meta_category` on the class** in
   `backend/app/services/whatsapp_templates.py` to what WhatsApp Manager
   shows, not to what you submitted. Meta can reclassify a template after
   approval. A class without it fails `test_every_template_states_its_meta_category`.

## What is checked, and what is not

- `tests/test_meh3589_admin_whatsapp.py` fails on any send to
  `admin_whatsapp_to` other than the exempt template.
- `tests/test_meh3596_channel_policy.py` fails on a template class without a
  valid `meta_category`, and on an exemption that is not listed with a reason.
- Nothing checks the customer and business-owner rows. Whether a message is
  urgent is a judgment. The reviewer (rule 5a) checks it against this table.
