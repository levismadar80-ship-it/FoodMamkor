from fastapi import FastAPI

from app.routers import (
    admin,
    admin_experiences,
    admin_extra,
    admin_kashrut,
    admin_outreach,
    admin_recipes,
    admin_whatsapp,
    alerts,
    auth,
    category_requests,
    chat,
    cities,
    events,
    experiences,
    favorites,
    google_rating,
    group_buys,
    health,
    holiday_mode,
    marketing,
    producer_me,
    producer_name_requests,
    producer_recipes,
    producers,
    referrals,
    report_info,
    reports,
    reviews,
    search,
    system,
    upload,
    users_me,
    whatsapp_webhook,
)


def register_routers(app: FastAPI) -> None:
    """Register every router in the same order they appeared in main.py.

    Order is preserved to keep the diff small; FastAPI matches by path, not
    registration order, so order is not safety-critical. The two new routers
    (system, holiday_mode) are appended last to mirror the original layout
    where `/`, `/health`, `/push-vapid-key`, and `/holiday-mode` were defined
    inline AFTER the `app.include_router(...)` block.
    """
    app.include_router(auth.router)
    app.include_router(cities.router)
    app.include_router(producer_me.router)
    app.include_router(producers.router)
    app.include_router(favorites.router)
    app.include_router(admin.router)
    app.include_router(admin_extra.router)
    # MEH-1406: home_products.router disabled per brand LOCK (licensed
    # businesses only — the consumer home-cook / "from-the-neighbor's-kitchen"
    # surface was removed). Router/module/models/schemas/tables all retained
    # (no Alembic); this is a reversible unmount. To restore the live API,
    # BOTH steps are needed: re-add `home_products` to the import tuple above
    # AND uncomment the include line below.
    #
    # ⚠️ DO NOT remount without first fixing TWO known security defects in
    # this router. They are dormant only because nothing routes here; the
    # moment the include below is uncommented they become live, and both are
    # exploitable by any authenticated user. Found by audit P1 (MEH-1724),
    # `docs/audits/2026-07-full/p1-security-backend.md`.
    #
    #   1. Rating authorization boundary (F-1, OWASP A04 / CWE-840).
    #      `home_products.py` mints a fresh rating token on EVERY click, and
    #      uniqueness is `UniqueConstraint("click_id")` — per click, not per
    #      rater — so the `>= 3 negative ratings -> is_hidden` rule counts
    #      clicks, not people. One account can hide another user's listing.
    #      Fix: unique `(user_id, home_product_id)` + upsert on repeat rating,
    #      and auto-hide on `COUNT(DISTINCT user_id)`. Needs an Alembic
    #      revision, and existing duplicate rows must be resolved first.
    #      Ticket: MEH-1739 (Canceled — not-applicable while unmounted).
    #
    #   2. BOLA gate missing on the click route (F-2, OWASP A01 / CWE-639).
    #      `GET /home-products/{id}` gates hidden/deactivated listings behind
    #      an owner/admin check (MEH-386). `POST /home-products/{id}/
    #      whatsapp-click` does NOT, and returns the seller's phone number.
    #      Fix: apply the same gate before returning `whatsapp_url`.
    #      Ticket: MEH-1740 (Canceled — not-applicable while unmounted).
    #
    # Both tickets were Canceled BECAUSE the surface is unreachable, not
    # because the defects were fixed — nothing has been fixed. This comment
    # is the durable record; the tickets are not. Rationale + evidence:
    # MEH-1743.
    # app.include_router(home_products.router)
    app.include_router(reports.router)
    # MEH-1443: email-only "report wrong info" (distinct from the DB-backed
    # abuse reports above — see routers/report_info.py "Does NOT").
    app.include_router(report_info.router)
    app.include_router(upload.router)
    app.include_router(marketing.router)
    app.include_router(events.router)
    app.include_router(experiences.router)
    app.include_router(admin_experiences.router)
    # MEH-589: producer recipes chunk 2/4
    app.include_router(producer_recipes.router)
    app.include_router(admin_recipes.router)
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
    app.include_router(category_requests.router)
    # MEH-1872: the re-moderated name-change route. Deliberately NOT part of
    # producer_me — that router's writable-field set is what MEH-1851 closed.
    app.include_router(producer_name_requests.router)
    app.include_router(referrals.router)
    app.include_router(group_buys.router)
    app.include_router(group_buys.admin_router)
    app.include_router(alerts.router)
    app.include_router(admin_kashrut.router)
    app.include_router(health.router)
    app.include_router(system.router)
    app.include_router(holiday_mode.router)
    # MEH-509 PR2c: Meta WhatsApp webhook receiver. /webhook/whatsapp.
    app.include_router(whatsapp_webhook.router)
