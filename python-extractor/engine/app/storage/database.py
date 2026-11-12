from __future__ import annotations

from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import NoSuchModuleError

from app.core.config import get_settings


def database_url_dialect(database_url: str) -> str:
    return make_url(database_url).get_backend_name()


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    settings = get_settings()
    url = make_url(settings.database_url)
    connect_args = {"check_same_thread": False} if url.get_backend_name() == "sqlite" else {}
    try:
        return create_engine(
            url,
            connect_args=connect_args,
            pool_pre_ping=True,
        )
    except (ModuleNotFoundError, NoSuchModuleError) as exc:
        raise RuntimeError(
            f"No SQLAlchemy driver is installed for database dialect "
            f"'{url.get_backend_name()}'. The approved dependency list does not "
            "include a PostgreSQL driver; request approval before adding one."
        ) from exc
