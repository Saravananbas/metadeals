from __future__ import annotations

import re
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from app.adapters.sites.amazon import AmazonField

_VIEW_ITEM = re.compile(
    r"gtag\(\s*['\"]event['\"]\s*,\s*['\"]view_item['\"].*?"
    r"items\s*:\s*\[\s*\{(?P<item>[^{}]*)\}\s*\]",
    re.DOTALL,
)
_PRICE = re.compile(r"\bprice\s*:\s*(?:parseFloat\(\s*)?(\d+(?:\.\d+)?)")


def extract_bajaj_fields(soup: BeautifulSoup, page_url: str) -> dict[str, AmazonField] | None:
    """Selling price only, from the page's own single-item analytics event.

    The visible price is loaded by script and never appears in the HTML; MRP is not published.
    """
    hostname = (urlsplit(page_url).hostname or "").lower()
    if hostname != "bajajelectronics.com" and not hostname.endswith(".bajajelectronics.com"):
        return None
    for script in soup.find_all("script"):
        match = _VIEW_ITEM.search(script.string or script.get_text())
        price = _PRICE.search(match.group("item")) if match else None
        if price and float(price.group(1)) > 0:
            return {
                "selling_price_inr": AmazonField(
                    float(price.group(1)), "gtag view_item items[0].price"
                )
            }
    return None
