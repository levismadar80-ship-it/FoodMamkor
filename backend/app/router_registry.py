from fastapi import FastAPI

from app.routers import (
    admin,
    admin_experiences,
    admin_extra,
    admin_kashrut,
    admin_outreach,
    alerts,
    auth,
    category_requests,
    chat,
    cities,
    events,
    experiences,
    favorites,
    group_buys,
    health,
    holiday_mode,
    home_products,
    marketing,
    producer_me,
    producers,
    recipes,
    referrals,
    reports,
    reviews,
    search,
    system,
    upload,
    users_me,
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
    app.include_router(recipes.router)
    app.include_router(home_products.router)
    app.include_router(reports.router)
    app.include_router(upload.router)
    app.include_router(marketing.router)
    app.include_router(events.router)
    app.include_router(experiences.router)
    app.include_router(admin_experiences.router)
    app.include_router(reviews.router)
    app.include_router(search.router)
    app.include_router(users_me.router)
    app.include_router(admin_outreach.router)
    app.include_router(admin_outreach.prefill_router)
    app.include_router(chat.router)
    app.include_router(category_requests.router)
    app.include_router(referrals.router)
    app.include_router(group_buys.router)
    app.include_router(group_buys.admin_router)
    app.include_router(alerts.router)
    app.include_router(admin_kashrut.router)
    app.include_router(health.router)
    app.include_router(system.router)
    app.include_router(holiday_mode.router)
