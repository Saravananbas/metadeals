from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urljoin

import httpx

from app.schemas import PageFetchError, UnsafeUrlError
from app.url_safety import validate_public_url


MAX_HTML_BYTES = 10_000_000
MAX_REDIRECTS = 5


@dataclass(frozen=True)
class FetchResult:
    html: str
    submitted_url: str
    final_url: str
    http_status: int
    notes: list[str]
    source_snapshot_path: str | None = None
    fetch_method: str = "http"


def _read_bounded_response(response: httpx.Response) -> str:
    content_length = response.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_HTML_BYTES:
                raise PageFetchError(
                    "The response exceeds the 10 MB HTML limit.",
                    load_result="response_too_large",
                    http_status=response.status_code,
                )
        except ValueError:
            pass

    body = bytearray()
    for chunk in response.iter_bytes():
        if len(body) + len(chunk) > MAX_HTML_BYTES:
            raise PageFetchError(
                "The response exceeds the 10 MB HTML limit.",
                load_result="response_too_large",
                http_status=response.status_code,
            )
        body.extend(chunk)
    return bytes(body).decode(response.encoding or "utf-8", errors="replace")


def fetch_page(url: str) -> FetchResult:
    current_url = url
    notes: list[str] = []
    timeout = httpx.Timeout(connect=8.0, read=18.0, write=8.0, pool=8.0)
    headers = {
        "User-Agent": "UniversalProductDataExtractor/0.1 (user-initiated local request)",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    }

    try:
        with httpx.Client(
            follow_redirects=False,
            timeout=timeout,
            trust_env=False,
            headers=headers,
        ) as client:
            for redirect_count in range(MAX_REDIRECTS + 1):
                validate_public_url(current_url)
                with client.stream("GET", current_url) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            raise PageFetchError(
                                "The server returned a redirect without a Location header.",
                                load_result="navigation_error",
                                http_status=response.status_code,
                            )
                        if redirect_count == MAX_REDIRECTS:
                            raise PageFetchError(
                                "The page exceeded the 5-redirect limit.",
                                load_result="too_many_redirects",
                                http_status=response.status_code,
                            )
                        current_url = urljoin(str(response.url), location)
                        notes.append(f"Redirected to {current_url}.")
                        continue

                    media_type = response.headers.get("content-type", "").split(";")[0]
                    if media_type and media_type not in {
                        "text/html",
                        "application/xhtml+xml",
                    }:
                        raise PageFetchError(
                            f"The response is not HTML (content type: {media_type}).",
                            load_result="unsupported_content_type",
                            http_status=response.status_code,
                        )
                    html = _read_bounded_response(response)
                    return FetchResult(
                        html=html,
                        submitted_url=url,
                        final_url=str(response.url),
                        http_status=response.status_code,
                        notes=notes,
                    )
    except UnsafeUrlError:
        raise
    except PageFetchError:
        raise
    except httpx.TimeoutException as exc:
        raise PageFetchError(
            "The page request timed out.",
            load_result="timeout",
        ) from exc
    except httpx.RequestError as exc:
        raise PageFetchError(
            f"Page request failed: {exc.__class__.__name__}.",
            load_result="navigation_error",
        ) from exc

    raise PageFetchError("The page could not be loaded.", load_result="navigation_error")
