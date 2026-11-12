from __future__ import annotations

from dataclasses import dataclass

from playwright.async_api import Route, async_playwright

from app.schemas import UnsafeUrlError
from app.url_safety import validate_public_url


@dataclass(frozen=True)
class BrowserSmokeResult:
    final_url: str
    title: str
    http_status: int
    rejected_requests: tuple[str, ...]


async def run_browser_smoke(url: str = "https://example.com") -> BrowserSmokeResult:
    validate_public_url(url)
    rejected_requests: list[str] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            context = await browser.new_context()
            page = await context.new_page()

            async def validate_request(route: Route) -> None:
                request_url = route.request.url
                try:
                    validate_public_url(request_url)
                except UnsafeUrlError:
                    rejected_requests.append(request_url)
                    await route.abort()
                    return
                await route.continue_()

            await page.route("**/*", validate_request)
            response = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=45_000,
            )
            if response is None:
                raise RuntimeError("The browser navigation produced no HTTP response.")
            return BrowserSmokeResult(
                final_url=page.url,
                title=await page.title(),
                http_status=response.status,
                rejected_requests=tuple(rejected_requests),
            )
        finally:
            await browser.close()
