from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import ROOT_DIR
from app.fetch import FetchResult


SOURCE_ARCHIVE_DIR = ROOT_DIR / "data" / "page_sources"


def archive_page_source(
    fetch: FetchResult,
    archive_dir: Path = SOURCE_ARCHIVE_DIR,
    root_dir: Path = ROOT_DIR,
) -> FetchResult:
    archive_dir.mkdir(parents=True, exist_ok=True)
    observed_at = datetime.now(timezone.utc)
    url_hash = hashlib.sha256(fetch.final_url.encode("utf-8")).hexdigest()[:16]
    file_name = f"{observed_at:%Y%m%dT%H%M%S.%fZ}_{url_hash}.html"
    destination = archive_dir / file_name
    temp_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            dir=archive_dir,
            prefix=".source-",
            suffix=".tmp",
            delete=False,
        ) as source_file:
            temp_path = Path(source_file.name)
            source_file.write(fetch.html)
            source_file.flush()
            os.fsync(source_file.fileno())
        os.replace(temp_path, destination)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()

    relative_path = destination.relative_to(root_dir).as_posix()
    saved_html = destination.read_text(encoding="utf-8")
    return replace(
        fetch,
        html=saved_html,
        source_snapshot_path=relative_path,
    )
