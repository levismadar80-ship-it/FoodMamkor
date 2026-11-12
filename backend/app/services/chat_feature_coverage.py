"""
Module:   chat_feature_coverage
Purpose:  For every tool in frontend/lib/business-features.js, say whether the
          site chat's knowledge covers it — so a new tool cannot ship while the
          chat still answers as if it did not exist (the MEH-3004 bug).
Touches:  nothing — pure data, read by tests/test_meh3012_chat_feature_coverage.py.
Does NOT: hold the chat's words (routers/chat.py SYSTEM_PROMPT and
          RESCUE_KNOWLEDGE_TEMPLATE do), or decide what a business may use
          (business-features.js and the code's flags do).
Related:  frontend/lib/business-features.js:63 (BUSINESS_FEATURES, the list
          this mirrors); frontend/__tests__/DashboardPlacementGuard.test.js
          (the same "registry must account for everything" pattern).
History:  MEH-3012 (creation, after MEH-3004).

HOW TO ADD A TOOL. When you add an entry to BUSINESS_FEATURES, add its id to
exactly one of the three maps below, or the guard test fails:
  COVERED       — the chat knows it: the value is a string that must appear
                  in the chat's knowledge (the anchor of its Q&A line).
  PENDING_COPY  — visitors will ask about it, and the chat's wording waits for
                  Sapir's word-for-word approval (workflow rule 22). The value
                  says why. Move it to COVERED when the copy lands.
  NOT_FOR_CHAT  — visitors don't ask the chat about it (a dashboard detail,
                  an insight only the owner sees). The value says why.
"""

COVERED: dict[str, str] = {
    "events": "איפה רואים שווקים ואירועים?",
    "multi_locations": "«דוכן שוק»",
    "primary_cta": "איך יוצרים קשר עם בית עסק?",
    "discovery": "איך מוצאים בתי עסק קרובים",
    "social_signup": "Google/Apple",
    "group_buys": "**מה זה קבוצת רכישה?**",
    # Only while the pilot is on (routers/chat.py _rescue_knowledge).
    "rescue_bags": "**מה זה סל הפתעה?**",
}

PENDING_COPY: dict[str, str] = {
    "experiences": "visitors ask how to sign up for a workshop or visit",
    "recipes": "visitors ask where the recipes are",
    "offer": "visitors ask about discounts / perks",
    "delivery_areas": "visitors ask whether a business delivers",
    "delivery_checker": "visitors ask how to check delivery to their town",
    "waitlist": "visitors ask what happens when there is no delivery yet",
    "save_share": "visitors ask how to save a business",
    "follower_updates": "visitors ask how to get updates from a business",
    "reviews_contacted": "visitors ask who may write a review",
    "verified_badge": "visitors ask what «מאומת» means",
    "kashrut_verified": "visitors ask about kashrut",
    "reservist_diet_tags": "visitors ask about the reservist / diet tags",
    "hours": "visitors ask about opening and ordering hours",
    "vacation_mode": "visitors ask why a business shows as on vacation",
}

_DASHBOARD = "business dashboard detail; the chat sends businesses to the dashboard"
_OWNER_INSIGHT = "an insight only the owner sees"
_ON_THE_PAGE = "self-explanatory where it appears; visitors don't ask the chat"

NOT_FOR_CHAT: dict[str, str] = {
    "gallery_story": _DASHBOARD,
    "product_details": _DASHBOARD,
    "top_product": _DASHBOARD,
    "map_precision": _DASHBOARD,
    "draft_claim": "admin-led claim flow, reached by a link we send",
    "ai_writer": _DASHBOARD,
    "guides": _DASHBOARD,
    "wa_approval": "automatic message, nothing to ask",
    "onboarding_emails": "automatic emails, nothing to ask",
    "vanity_link": _DASHBOARD,
    "similar_businesses": _ON_THE_PAGE,
    "share_cards": _DASHBOARD,
    "qr_code": _DASHBOARD,
    "structured_data": "search-engine markup, invisible to visitors",
    "wa_prefill": _ON_THE_PAGE,
    "product_wa": _ON_THE_PAGE,
    "faq_answers": _ON_THE_PAGE,
    "wa_group": _ON_THE_PAGE,
    "nav_buttons": _ON_THE_PAGE,
    "editor_pick": "editorial choice, not something a visitor or business requests",
    "review_request": _DASHBOARD,
    "views": _OWNER_INSIGHT,
    "search_impressions": _OWNER_INSIGHT,
    "contact_clicks": _OWNER_INSIGHT,
    "favorites_rating": _OWNER_INSIGHT,
    "top_cities": _OWNER_INSIGHT,
    "demand_cities": _OWNER_INSIGHT,
    "drop_point_hosts": _OWNER_INSIGHT,
    "email_alerts": "automatic emails to the owner",
    "completeness": _DASHBOARD,
}
