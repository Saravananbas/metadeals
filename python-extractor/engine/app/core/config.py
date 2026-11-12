from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = ROOT_DIR / "data" / "extractor.sqlite3"
load_dotenv(ROOT_DIR / ".env", override=False)


@dataclass(frozen=True)
class Settings:
    database_url: str
    api_base_url: str
    log_level: str


def get_settings() -> Settings:
    database_url = os.environ.get(
        "DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"
    )
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url.removeprefix("postgres://")
    return Settings(
        database_url=database_url,
        api_base_url=os.environ.get("EXTRACTOR_API_URL", "http://127.0.0.1:8000"),
        log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    )
