from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlsplit

from bs4 import BeautifulSoup


@dataclass(frozen=True)
class DuroflexField:
    value: Any
    source_locator: str
    confidence: float
    note: str | None = None


@dataclass(frozen=True)
class DuroflexExtraction:
    fields: dict[str, DuroflexField]
    warnings: list[str]


def _text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    cleaned = re.sub(r"[^\d,.\-]", "", str(value)).replace(",", "")
    if not cleaned:
        return None
    try:
        number = float(cleaned)
    except ValueError:
        return None
    return number if number >= 0 else None


def _inr_offer_price(product: dict[str, Any]) -> float | None:
    offers = product.get("offers", [])
    if isinstance(offers, dict):
        offers = [offers]
    if not isinstance(offers, list):
        return None
    prices = {
        price
        for offer in offers
        if isinstance(offer, dict)
        and str(offer.get("priceCurrency", "")).upper() == "INR"
        for price in [_number(offer.get("price"))]
        if price is not None
    }
    return next(iter(prices)) if len(prices) == 1 else None


def _selected_variant(
    variants: Any, page_url: str
) -> dict[str, Any] | None:
    if not isinstance(variants, list) or not variants:
        return None
    if len(variants) == 1 and isinstance(variants[0], dict):
        return variants[0]
    requested_variants = parse_qs(urlsplit(page_url).query).get("variant", [])
    if len(requested_variants) != 1:
        return None
    matches = [
        variant
        for variant in variants
        if isinstance(variant, dict)
        and str(variant.get("id", "")) == requested_variants[0]
    ]
    return matches[0] if len(matches) == 1 else None


def extract_duroflex_fields(
    soup: BeautifulSoup,
    page_url: str,
    product: dict[str, Any] | None,
) -> DuroflexExtraction | None:
    hostname = (urlsplit(page_url).hostname or "").casefold()
    if hostname != "duroflexworld.com" and not hostname.endswith(".duroflexworld.com"):
        return None

    fields: dict[str, DuroflexField] = {}
    warnings: list[str] = []
    product_container = soup.select_one("#product")
    deal_sections = (
        product_container.select(".dfx-deal-price")
        if product_container
        else soup.select(".dfx-deal-price")
    )
    coupon_codes = {
        match.group(1).upper()
        for section in deal_sections
        for match in re.finditer(
            r"\busing\s+coupon\s+([A-Z0-9][A-Z0-9_-]{2,30})\b",
            section.get_text(" ", strip=True),
            flags=re.IGNORECASE,
        )
    }
    if len(coupon_codes) == 1:
        fields["coupon_code"] = DuroflexField(
            value=next(iter(coupon_codes)),
            source_locator="#product .dfx-deal-price (using coupon)",
            confidence=0.9,
        )

    product_handle = urlsplit(page_url).path.rstrip("/").rsplit("/", 1)[-1]
    script = soup.select_one('script#stape-product-data[type="application/json"]')
    if not script:
        warnings.append("The Duroflex product-state JSON was not found; site-specific fields were skipped.")
        return DuroflexExtraction(fields, warnings)

    raw_state = script.string or script.get_text()
    try:
        state = json.loads(raw_state)
    except json.JSONDecodeError:
        warnings.append("The Duroflex product-state JSON could not be parsed.")
        return DuroflexExtraction(fields, warnings)
    if not isinstance(state, dict) or state.get("handle") != product_handle:
        warnings.append("Duroflex product-state handle did not match the requested product URL.")
        return DuroflexExtraction(fields, warnings)

    vendor = _text(state.get("vendor"))
    if vendor:
        fields["merchant"] = DuroflexField(
            value=vendor,
            source_locator="#stape-product-data.vendor",
            confidence=0.84,
            note="The Duroflex store's selected product record identifies this vendor.",
        )

    category = _text(state.get("category"))
    tags = state.get("tags")
    if not category and isinstance(tags, list) and "Furniture" in tags:
        category = "Furniture"
    if category:
        fields["category"] = DuroflexField(
            value=category,
            source_locator="#stape-product-data.category or tags",
            confidence=0.8,
        )

    subcategory = _text(state.get("type"))
    if subcategory:
        fields["subcategory"] = DuroflexField(
            value=subcategory,
            source_locator="#stape-product-data.type",
            confidence=0.86,
        )

    offer_price = _inr_offer_price(product) if product else None
    variants = state.get("variants")
    variant = _selected_variant(variants, page_url)
    if variant:
        state_price = _number(variant.get("price"))
        if state_price is None:
            state_price = _number(state.get("price"))
        comparison_price = _number(variant.get("compare_at_price"))
    elif not isinstance(variants, list) or len(variants) <= 1:
        state_price = _number(state.get("price"))
        comparison_price = _number(state.get("compare_at_price"))
    else:
        state_price = None
        comparison_price = None
    price_scale = None
    if offer_price is not None and state_price is not None:
        if state_price == offer_price:
            price_scale = 1.0
        elif state_price / 100 == offer_price:
            price_scale = 0.01
    if (
        offer_price is not None
        and comparison_price is not None
        and price_scale is not None
        and comparison_price * price_scale > offer_price
    ):
        fields["mrp_inr"] = DuroflexField(
            value=comparison_price * price_scale,
            source_locator="#stape-product-data.compare_at_price",
            confidence=0.97,
            note=(
                "Matched the selected product handle and variant comparison price "
                "to the verified INR Product offer."
            ),
        )
    elif comparison_price is not None and offer_price is not None:
        warnings.append(
            "Duroflex comparison price was not applied because its variant or currency did not match the Product offer."
        )

    return DuroflexExtraction(fields, warnings)
