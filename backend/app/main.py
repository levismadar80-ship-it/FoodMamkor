from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, auth, favorites, producer_me, producers, recipes

app = FastAPI(title="מהמקור - MeHaMakor API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
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


@app.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}
