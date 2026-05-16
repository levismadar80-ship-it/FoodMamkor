from fastapi import FastAPI

from app.logging_config import configure_logging
from app.middleware import install_middlewares
from app.router_registry import register_routers
from app.sentry import init_sentry
from app.startup import lifespan

configure_logging()
# MEH-500: must run BEFORE FastAPI() so any exception during app
# construction is captured. Fail-open when BACKEND_SENTRY_DSN unset.
init_sentry()

app = FastAPI(title="מהמקור - MeHaMakor API", version="1.0.0", lifespan=lifespan)
install_middlewares(app)
register_routers(app)
