"""Private HTTP adapter around the approved deterministic Python extractor."""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import BoundedSemaphore
from typing import Any


ENGINE_ROOT = Path(__file__).resolve().parent / "engine"
sys.path.insert(0, str(ENGINE_ROOT))

from app.extraction import extract_product  # noqa: E402


MAX_BODY_BYTES = 8_192
MAX_CONCURRENT_EXTRACTIONS = 2
_slots = BoundedSemaphore(MAX_CONCURRENT_EXTRACTIONS)


class ExtractorHandler(BaseHTTPRequestHandler):
    server_version = "MetaDealsPythonExtractor/2.0"

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_error(404)
            return
        self._send_json(200, {"status": "ok", "engine": "universal_product_extractor"})

    def do_POST(self) -> None:
        if self.path != "/extract":
            self.send_error(404)
            return
        raw_length = self.headers.get("Content-Length", "")
        if not raw_length.isdigit() or int(raw_length) > MAX_BODY_BYTES:
            self.send_error(413)
            return
        if not _slots.acquire(blocking=False):
            self._send_json(503, {"error": "Extractor is busy; retry shortly."})
            return
        try:
            payload = json.loads(self.rfile.read(int(raw_length)))
            url = payload.get("url") if isinstance(payload, dict) else None
            if not isinstance(url, str) or not url.strip() or len(url) > 2_048:
                self.send_error(400)
                return
            # The engine validates public DNS/IP addresses, every redirect,
            # browser subrequest, and the final URL. Do not archive retailer
            # HTML in this service response path.
            result = extract_product(url.strip(), archive_source=False)
            self._send_json(200, result.model_dump(mode="json"))
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
            self.send_error(400)
        except Exception:
            # Never send exception details or retailer page contents to callers.
            self._send_json(502, {"error": "Product extraction failed safely."})
        finally:
            _slots.release()

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: Any) -> None:
        # URLs and product data can contain user-specific query parameters.
        return


if __name__ == "__main__":
    host = os.environ.get("EXTRACTOR_HOST", "127.0.0.1")
    port = int(os.environ.get("EXTRACTOR_PORT", "8765"))
    ThreadingHTTPServer((host, port), ExtractorHandler).serve_forever()
