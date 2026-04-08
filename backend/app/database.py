from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# connect_args only applies to psycopg2 — skip it for sqlite (tests/local).
# connect_timeout=10 means a broken DB host raises OperationalError in 10s
# instead of hanging for the OS TCP timeout (~2 minutes), so lifespan can
# catch it and the app still comes up.
_connect_args = {}
if settings.database_url.startswith(("postgresql", "postgres")):
    _connect_args["connect_timeout"] = 10

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,  # drop dead connections from the pool transparently
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
