from __future__ import annotations

import asyncio
import os
import re
import sys
from urllib.parse import urlsplit

from playwright.async_api import (
    Error as PlaywrightError,
    Route,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

from app.fetch import FetchResult, MAX_HTML_BYTES, MAX_REDIRECTS
from app.schemas import PageFetchError, UnsafeUrlError
from app.url_safety import validate_public_url


async def _fetch_page_playwright(url: str) -> FetchResult:
    validate_public_url(url)
    rejected_requests: list[str] = []
    unsafe_navigation = False
    excessive_navigation_redirects = False

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=os.environ.get("EXTRACTOR_HEADLESS", "").casefold() in {"1", "true", "yes"}
            )
            try:
                context = await browser.new_context()
                page = await context.new_page()

                async def validate_request(route: Route) -> None:
                    nonlocal unsafe_navigation, excessive_navigation_redirects
                    request = route.request
                    redirect_count = 0
                    redirected_from = request.redirected_from
                    while redirected_from is not None:
                        redirect_count += 1
                        redirected_from = redirected_from.redirected_from
                    if redirect_count > MAX_REDIRECTS:
                        rejected_requests.append(request.url)
                        excessive_navigation_redirects |= request.is_navigation_request()
                        await route.abort()
                        return
                    if request.resource_type in {"font", "media"}:
                        await route.abort()
                        return
                    try:
                        validate_public_url(request.url)
                    except UnsafeUrlError:
                        rejected_requests.append(request.url)
                        unsafe_navigation |= request.is_navigation_request()
                        await route.abort()
                        return
                    await route.continue_()

                await page.route("**/*", validate_request)
                response = await page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=45_000,
                )
                if excessive_navigation_redirects:
                    raise PageFetchError(
                        f"The page exceeded the {MAX_REDIRECTS}-redirect limit.",
                        load_result="too_many_redirects",
                    )
                if unsafe_navigation:
                    raise UnsafeUrlError(
                        "A browser navigation redirected to a non-public URL."
                    )
                if response is None:
                    raise PageFetchError(
                        "The browser navigation produced no HTTP response.",
                        load_result="navigation_error",
                    )

                if response.status < 400:
                    hostname = (urlsplit(url).hostname or "").casefold()
                    is_ajio = hostname == "ajio.com" or hostname.endswith(".ajio.com")
                    is_ambrane = hostname == "ambraneindia.com" or hostname.endswith(
                        ".ambraneindia.com"
                    )
                    if is_ajio:
                        try:
                            await page.locator("h1.prod-name").wait_for(
                                state="visible",
                                timeout=8_000,
                            )
                        except PlaywrightTimeoutError:
                            pass
                        product_code_match = re.search(
                            r"/p/(\d+)(?:_|/|$)", urlsplit(url).path
                        )
                        if product_code_match:
                            try:
                                await page.wait_for_function(
                                    """(productCode) => [...document.querySelectorAll(
                                        'img[alt^="Product image of"]'
                                    )].some((image) =>
                                        (image.currentSrc || image.src || image.dataset.src || "")
                                            .includes(productCode)
                                    )""",
                                    arg=product_code_match.group(1),
                                    timeout=5_000,
                                )
                            except PlaywrightTimeoutError:
                                pass
                    elif is_ambrane:
                        try:
                            await page.locator("h1").first.wait_for(
                                state="visible",
                                timeout=8_000,
                            )
                        except PlaywrightTimeoutError:
                            pass
                        try:
                            await page.wait_for_function(
                                """() => [...document.scripts].some((script) =>
                                    script.textContent.includes("BspdCurrentProduct")
                                )""",
                                timeout=5_000,
                            )
                        except PlaywrightTimeoutError:
                            pass
                    else:
                        try:
                            await page.locator("h1").first.wait_for(
                                state="visible",
                                timeout=8_000,
                            )
                        except PlaywrightTimeoutError:
                            pass
                    try:
                        await page.wait_for_load_state("networkidle", timeout=1_500)
                    except PlaywrightTimeoutError:
                        pass

                await page.evaluate(
                    """() => {
                        for (const element of document.body?.querySelectorAll("*") ?? []) {
                            const text = element.textContent?.trim() ?? "";
                            if (!text || text.length > 80 || !/\\d/.test(text)) continue;
                            const decoration = getComputedStyle(element).textDecorationLine;
                            if (decoration.split(/\\s+/).includes("line-through")) {
                                element.setAttribute("data-extractor-struck-price", "true");
                            }
                        }
                    }"""
                )
                final_url = page.url
                validate_public_url(final_url)
                html = await page.content()
                if len(html.encode("utf-8")) > MAX_HTML_BYTES:
                    raise PageFetchError(
                        "The rendered page exceeds the 10 MB HTML limit.",
                        load_result="response_too_large",
                        http_status=response.status,
                    )

                notes = []
                if final_url != url:
                    notes.append(f"Browser navigation finished at {final_url}.")
                if rejected_requests:
                    notes.append(
                        f"{len(rejected_requests)} unsafe or over-limit browser subrequest(s) were blocked."
                    )
                return FetchResult(
                    html=html,
                    submitted_url=url,
                    final_url=final_url,
                    http_status=response.status,
                    notes=notes,
                    fetch_method="playwright",
                )
            finally:
                await browser.close()
    except UnsafeUrlError:
        raise
    except PageFetchError:
        raise
    except PlaywrightTimeoutError as exc:
        if unsafe_navigation:
            raise UnsafeUrlError(
                "A browser navigation redirected to a non-public URL."
            ) from exc
        if excessive_navigation_redirects:
            raise PageFetchError(
                f"The page exceeded the {MAX_REDIRECTS}-redirect limit.",
                load_result="too_many_redirects",
            ) from exc
        raise PageFetchError(
            "The browser page load timed out.",
            load_result="timeout",
        ) from exc
    except PlaywrightError as exc:
        if unsafe_navigation:
            raise UnsafeUrlError(
                "A browser navigation redirected to a non-public URL."
            ) from exc
        if excessive_navigation_redirects:
            raise PageFetchError(
                f"The page exceeded the {MAX_REDIRECTS}-redirect limit.",
                load_result="too_many_redirects",
            ) from exc
        raise PageFetchError(
            f"Browser page request failed: {exc.__class__.__name__}.",
            load_result="navigation_error",
        ) from exc


def fetch_page_playwright(url: str) -> FetchResult:
    if sys.platform.startswith("win"):
        loop = asyncio.ProactorEventLoop()
        try:
            return loop.run_until_complete(_fetch_page_playwright(url))
        finally:
            loop.close()
    return asyncio.run(_fetch_page_playwright(url))
