from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from bs4 import BeautifulSoup


@dataclass(frozen=True)
class MyntraPrice:
    mrp: float | None
    selling_price: float | None
    discount_percent: float | None


def extract_myntra_price(
    soup: BeautifulSoup,
    page_url: str,
    product_sku: str | None,
) -> MyntraPrice | None:
    hostname = (urlsplit(page_url).hostname or "").lower()
    if hostname != "myntra.com" and not hostname.endswith(".myntra.com"):
        return None

    expected_sku = product_sku or ""
    if not expected_sku:
        match = re.search(r"/(\d+)/(?:buy|?$)", urlsplit(page_url).path)
        expected_sku = match.group(1) if match else ""
    if not expected_sku:
        return None

    for script in soup.find_all("script"):
        source = script.string or script.get_text()
        if "window.__myx" not in source:
            continue
        match = re.fullmatch(
            r"\s*window\.__myx\s*=\s*(\{.*\})\s*;?\s*",
            source,
            re.DOTALL,
        )
        if not match:
            continue
        try:
            state = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(state, dict):
            continue
        product = state.get("pdpData")
        if not isinstance(product, dict) or str(product.get("id", "")) != expected_sku:
            continue

        price = product.get("price")
        if not isinstance(price, dict):
            price = {}
        discounts = product.get("discounts")
        discount_percent = None
        if isinstance(discounts, list):
            discount_percent = next(
                (
                    value
                    for entry in discounts
                    if isinstance(entry, dict)
                    for value in [_nonnegative_number(entry.get("discountPercent"))]
                    if value is not None and value <= 100
                ),
                None,
            )
        return MyntraPrice(
            mrp=_nonnegative_number(product.get("mrp", price.get("mrp"))),
            selling_price=_nonnegative_number(price.get("discounted")),
            discount_percent=discount_percent,
        )
    return None


def _nonnegative_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number < 0:
        return None
    return number
