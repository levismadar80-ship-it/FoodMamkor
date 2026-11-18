"""
Module:   whatsapp_template_bodies
Purpose:  The exact body text of each WhatsApp template as submitted to Meta,
          one entry per template name. A new template gets its entry here
          BEFORE the Chrome submit prompt is written:
          tests/test_whatsapp_template_lint.py then checks it against Meta's
          rejection rules and against its class in whatsapp_templates.py.
Touches:  nothing.
Does NOT: send (services/whatsapp.py) or build parameters (each template
          class's fields, in {{n}} order).
History:  MEH-3296 — order templates, copy approved by Sapir 18/11/2026
          (2, 4, 5, 6 at 19:48Z; 1 and 3 reworded at 20:23Z after Meta
          blocked them).
"""

from __future__ import annotations

SIGNATURE = "צוות מהמקור"

META_BODIES: dict[str, str] = {
    "product_order_new_v1": (
        "שלום, התקבלה הזמנה חדשה דרך האתר מהמקור.\n"
        "שם הלקוח: {{1}}\n"
        "מספר פריטים: {{2}}\n"
        "סכום לתשלום: {{3}} ₪\n"
        "אופן קבלה: {{4}}\n"
        "מועד: {{5}}, בין השעות {{6}} ל-{{7}}\n"
        "כדי לאשר או לדחות את ההזמנה, היכנסו ללוח הבקרה באתר: {{8}}\n"
        "תודה, צוות מהמקור"
    ),
    "product_order_waiting_v1": (
        "הזמנה מחכה לתשובה כבר {{1}} שעות. אם לא תענו עד {{2}}, היא תתבטל. "
        "לתשובה: {{3}}\n" + SIGNATURE
    ),
    "product_order_confirmed_v1": (
        "שלום, ההזמנה שלכם מבית העסק {{1}} אושרה.\n"
        "אופן קבלה: {{2}}\n"
        "מועד: {{3}}, בין השעות {{4}} ל-{{5}}\n"
        "סכום לתשלום: {{6}} ₪. התשלום נעשה ישירות מול בית העסק, לא דרך האתר.\n"
        "לכל פרטי ההזמנה: {{7}}\n"
        "תודה, צוות מהמקור"
    ),
    "product_order_change_v1": (
        "בית העסק {{1}} מציע שינוי בהזמנה שלכם. לצפייה ולאישור: {{2}}\n" + SIGNATURE
    ),
    "product_order_closed_v1": "ההזמנה מ{{1}} בוטלה. פרטים: {{2}}\n" + SIGNATURE,
    "product_order_tomorrow_v1": (
        "תזכורת: מחר {{1}} מ{{2}}, בשעות {{3}} עד {{4}}. "
        "לא מסתדר? אפשר לבטל כאן: {{5}}\n" + SIGNATURE
    ),
}
