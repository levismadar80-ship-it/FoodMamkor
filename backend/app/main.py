from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, auth, favorites, home_products, producer_me, producers, recipes, reports, upload


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and seed on startup
    from app.database import Base, engine
    from app.models import models  # noqa: F401 — ensure models are registered

    Base.metadata.create_all(bind=engine)

    from seed_data import seed

    seed()
    yield


app = FastAPI(title="מהמקור - MeHaMakor API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(producers.router)
app.include_router(favorites.router)
app.include_router(producer_me.router)
app.include_router(admin.router)
app.include_router(recipes.router)
app.include_router(home_products.router)
app.include_router(reports.router)
app.include_router(upload.router)


@app.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}
