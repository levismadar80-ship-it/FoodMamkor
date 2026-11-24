from fastapi import FastAPI

from app.routers import (
    admin,
    admin_decisions,
    admin_experiences,
    admin_checklist,
    admin_extra,
    admin_kashrut,
    admin_outreach,
    admin_producer_locations,
    admin_product_import,
    admin_product_organize,
    admin_recipes,
    admin_test_business,
    admin_whatsapp,
    alerts,
    admin_passkey,
    auth,
    auth_register_producer,
    auth_google_code,
    business_suggestions,
    category_requests,
    chat,
    cities,
    events,
    experiences,
    favorites,
    google_rating,
    group_buys,
    group_buy_capacity,
    group_buy_mine,
    my_orders_any,
    health,
    holiday_mode,
    marketing,
    organizers,
    producer_claim,
    producer_draft_preview,
    producer_me,
    producer_me_analytics,
    producer_me_locations,
    producer_me_review,
    producer_me_weekly_summary,
    producer_name_check,
    producer_name_requests,
    producer_owner_invite,
    producer_owner_invite_existing,
    producer_owner_detach,
    producer_recipes,
    billing,
    product_organize,
    producer_google_profile,
    product_describe,
    menu_import,
    page_fill,
    form_fill,
    product_order_business,
    product_order_buyer,
    product_order_offer,
    product_variants,
    product_orders,
    rescue,
    rescue_pilot,
    producers,
    registrations,
    page_freshness,
    report_info,
    reports,
    reviews,
    review_reply_suggest,
    saved_items,
    search,
    system,
    upload,
    users_me,
    resend_webhook,
    whatsapp_webhook,
)


def _include_producer_me(app: FastAPI) -> None:
    """One /producers/me prefix, four files by area so each can be read whole."""
    app.include_router(producer_me.router)
    app.include_router(producer_me_analytics.router)
    app.include_router(producer_me_review.router)
    app.include_router(producer_me_locations.router)
    app.include_router(producer_me_weekly_summary.router)  # MEH-3212
    app.include_router(menu_import.router)  # MEH-3430: /producers/me/menu-import
    # MEH-3479: owner + admin «הצעת תיאור» (no /producers/me prefix on the router)
    app.include_router(product_describe.router)
    # MEH-3480: owner «הצעת תשובה» to a review (/reviews/{id}/reply/suggest),
    # here beside its sibling AI suggestion to keep register_routers short.
    app.include_router(review_reply_suggest.router)
    # MEH-3483: «ספרו לנו על העסק» — owner + admin draft of the page fields
    app.include_router(page_fill.router)
    # MEH-3740: «יש לכם מתכון כתוב?» — one draft route for every dashboard form
    app.include_router(form_fill.router)
    # MEH-3641: «הפרופיל שלכם בגוגל» — /producers/me/google-profile
    app.include_router(producer_google_profile.router)


def _include_owner_links(app: FastAPI) -> None:
    """The routers a business owner reaches from a signed link in a message."""
    # MEH-2322: owner-claim link (admin claim-link, public preview, claim).
    app.include_router(producer_claim.router)
    # MEH-3377: read-only preview link for an ownerless draft, and the admin's
    # «פרסום בהסכמה» for it.
    app.include_router(producer_draft_preview.router)
    # MEH-2974: two routers, one module — the admin half carries
    # `require_admin`, the public half is reached with the invite token alone.
    # Same split, same reason, as admin_outreach's `prefill_router` below.
    app.include_router(producer_owner_invite.router)
    app.include_router(producer_owner_invite.public_router)
    app.include_router(producer_owner_invite_existing.router)  # MEH-3256
    app.include_router(producer_owner_detach.router)  # MEH-3256 (D9)
    # MEH-3212: the List-Unsubscribe one-click target of the weekly summary.
    app.include_router(producer_me_weekly_summary.one_click_router)
    # Page freshness: the «כן, הכול נכון» link in the monthly owner email.
    app.include_router(page_freshness.router)


def _include_admin(app: FastAPI) -> None:
    """admin_decisions FIRST: its static GET /admin/producers/pending and
    /admin/producers/rejection-presets must match before admin.router's
    GET /admin/producers/{producer_id} (the order they had in one file)."""
    app.include_router(admin_decisions.router)
    app.include_router(admin.router)
    # MEH-3472: admin product groups + order (drafts included); same rules
    # as the owner's routes via services/product_organize.py. Here, not in
    # register_routers, to keep that function under the statement limit.
    app.include_router(admin_product_organize.router)
    # MEH-2952 chunk 4: the «עסק בדיקה» switch. Here for the same reason.
    app.include_router(admin_test_business.router)
    # MEH-3690: POST /auth/google/code, our own Google button's code swap.
    # Here only to keep register_routers under the statement limit.
    app.include_router(auth_google_code.router)


def _register_flagged_features(app: FastAPI) -> None:
    """Features behind a switch that is off by default. Split out of
    register_routers only to keep that function under the statement limit
    (MEH-3218); the order of registration carries no meaning."""
    # MEH-2646: the rescue-bags pilot. Every route inside answers 404 while
    # RESCUE_BAGS_ENABLED is off, which is its default — registering the
    # routers does not expose the feature.
    # Registered last simply to keep the pilot's two lines together; the
    # position carries no meaning. (It was briefly believed to shrink the
    # openapi.json diff — measured, it does not: the ~450 apparent deletions
    # there are JSON key reflow, and a semantic compare against HEAD shows
    # exactly 8 paths and 10 schemas added and nothing else changed.)
    app.include_router(rescue.router)
    app.include_router(rescue.admin_router)
    # MEH-2649: GET /producers/me/rescue/orders — the business's own counter
    # list, beside /producers/me/group-buys.
    app.include_router(rescue.me_router)
    # MEH-2921: which of the business's pickup points are in a pilot town.
    app.include_router(rescue_pilot.router)
    # MEH-3218: on-site ordering, stage 1 — the business's ordering settings.
    # Every route answers 404 while PRODUCT_ORDERS_ENABLED is off (the default).
    app.include_router(product_orders.me_router)
    app.include_router(product_orders.admin_router)
    # MEH-3262: stage 2a — the business's weekly windows, a product's ordering
    # fields, and the public order menu. Same flag, same 404 while off.
    app.include_router(product_order_offer.me_router)
    app.include_router(product_order_offer.public_router)
    # MEH-3617: a product's sizes or flavours (owner or admin). Not behind
    # the ordering flag: the business page shows them either way.
    app.include_router(product_variants.router)
    # MEH-3263: stage 2b — the order itself: the buyer sends and follows it,
    # the business acts on it. Same flag, same 404 while off.
    app.include_router(product_order_buyer.router)
    app.include_router(product_order_business.router)
    # MEH-3592: quantity edit, waitlist, the business's caps / stop switch.
    app.include_router(group_buy_capacity.router)
    # MEH-3609: «הקבוצות שלי», the caller's own group buys. Like MEH-3592's
    # line above, it has no flag: it sits here beside its group-buy siblings.
    app.include_router(group_buy_mine.router)
    # MEH-3698: does «ההזמנות שלי» have anything? One read for the menu gate.
    app.include_router(my_orders_any.router)


def _include_webhooks(app: FastAPI) -> None:
    """Inbound webhooks from outside services; each one checks a signature."""
    # MEH-509 PR2c: Meta WhatsApp webhook receiver. /webhook/whatsapp.
    app.include_router(whatsapp_webhook.router)
    # MEH-3839: Resend delivery events. /webhook/resend.
    app.include_router(resend_webhook.router)


def register_routers(app: FastAPI) -> None:
    """Register every router in the same order they appeared in main.py.

    Order is preserved to keep the diff small; FastAPI matches by path, not
    registration order, so order is not safety-critical. The two new routers
    (system, holiday_mode) are appended last to mirror the original layout
    where `/`, `/health`, `/push-vapid-key`, and `/holiday-mode` were defined
    inline AFTER the `app.include_router(...)` block.
    """
    app.include_router(auth.router)
    app.include_router(auth_register_producer.router)  # MEH-3293: split out of auth.py
    # MEH-3305: /auth/passkey/* — the admin second factor.
    app.include_router(admin_passkey.router)
    app.include_router(cities.router)
    app.include_router(producer_name_check.router)  # MEH-3086
    _include_producer_me(app)
    app.include_router(product_organize.router)  # MEH-3055
    app.include_router(billing.router)  # MEH-3181
    _include_owner_links(app)
    app.include_router(producers.router)
    app.include_router(organizers.router)  # MEH-2461
    app.include_router(favorites.router)
    app.include_router(saved_items.router)  # MEH-2557
    _include_admin(app)
    app.include_router(admin_extra.router)
    # MEH-3646 (MEH-796): the home_products router was deleted. It was unmounted
    # since MEH-1406 (brand LOCK: licensed businesses only) with two open
    # security defects (MEH-1739, MEH-1740; MEH-1743). Do not bring it back.
    # TestHomeProductsKillSwitch keeps every /home-products route a 404.
    app.include_router(reports.router)
    # MEH-1443: email-only "report wrong info" (distinct from the DB-backed
    # abuse reports above — see routers/report_info.py "Does NOT").
    app.include_router(report_info.router)
    app.include_router(upload.router)
    app.include_router(marketing.router)
    app.include_router(events.router)
    app.include_router(experiences.router)
    app.include_router(admin_experiences.router)
    # MEH-2763: on-site sign-ups for events + experiences.
    app.include_router(registrations.router)
    # MEH-589: producer recipes chunk 2/4
    app.include_router(producer_recipes.router)
    app.include_router(admin_recipes.router)
    # MEH-3333: admin CRUD for a business's locations (pickup points).
    app.include_router(admin_producer_locations.router)
    # MEH-2312: admin catalog import → drafts → approve.
    app.include_router(admin_product_import.router)
    app.include_router(reviews.router)
    # MEH-1490: live-fetch Google-rating trust line (read-only proxy; no
    # persistence). Registered near reviews — it's the external counterpart to
    # the native review block, but a separate router (ToS visual separation).
    app.include_router(google_rating.router)
    app.include_router(search.router)
    app.include_router(users_me.router)
    app.include_router(admin_outreach.router)
    app.include_router(admin_outreach.prefill_router)
    # MEH-771 Chunk C: admin view of undelivered WhatsApp sends.
    app.include_router(admin_whatsapp.router)
    app.include_router(chat.router)
    # MEH-2633: public community suggestions (POST /business-suggestions).
    app.include_router(business_suggestions.router)
    app.include_router(category_requests.router)
    # MEH-1872: the re-moderated name-change route. Deliberately NOT part of
    # producer_me — that router's writable-field set is what MEH-1851 closed.
    app.include_router(producer_name_requests.router)
    app.include_router(group_buys.router)
    app.include_router(group_buys.admin_router)
    # MEH-2437: GET /producers/me/group-buys.
    app.include_router(group_buys.me_router)
    app.include_router(alerts.router)
    app.include_router(admin_kashrut.router)
    app.include_router(admin_checklist.router)
    app.include_router(health.router)
    app.include_router(system.router)
    app.include_router(holiday_mode.router)
    _include_webhooks(app)
    _register_flagged_features(app)
