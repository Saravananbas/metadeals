from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, unquote, urljoin, urlsplit

from bs4 import BeautifulSoup


@dataclass(frozen=True)
class AmbraneField:
    value: Any
    source_locator: str
    confidence: float
    note: str | None = None


@dataclass(frozen=True)
class AmbraneExtraction:
    fields: dict[str, AmbraneField]
    warnings: list[str]


_PRODUCT_STATE = re.compile(r"\bvar\s+BspdCurrentProduct\s*=\s*")
_RUPEE_AMOUNT = re.compile(r"(?:₹|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)


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


def _product_states(soup: BeautifulSoup) -> list[dict[str, Any]]:
    decoder = json.JSONDecoder()
    states: list[dict[str, Any]] = []
    for script in soup.find_all("script"):
        content = script.string or script.get_text()
        match = _PRODUCT_STATE.search(content)
        if not match:
            continue
        try:
            state, _ = decoder.raw_decode(content, match.end())
        except json.JSONDecodeError:
            continue
        if isinstance(state, dict):
            states.append(state)
    return states


def _selected_variant(
    variants: Any, requested_variant: str | None
) -> dict[str, Any] | None:
    if not isinstance(variants, list) or not variants:
        return None
    if requested_variant:
        matches = [
            variant
            for variant in variants
            if isinstance(variant, dict)
            and str(variant.get("id", "")) == requested_variant
        ]
        return matches[0] if len(matches) == 1 else None
    if len(variants) == 1 and isinstance(variants[0], dict):
        return variants[0]
    return None


def _visible_rupee_amounts(soup: BeautifulSoup) -> list[float]:
    price_container = soup.select_one(
        ".t4s-product__price-review, .ct-price, .t4s-product-price"
    )
    if not price_container:
        return []
    return [
        amount
        for match in _RUPEE_AMOUNT.finditer(price_container.get_text(" ", strip=True))
        if (amount := _number(match.group(1))) is not None
    ]


def _state_price(value: Any, scale: float) -> float | None:
    amount = _number(value)
    return amount * scale if amount is not None else None


def _option_value(
    product: dict[str, Any], variant: dict[str, Any], option_names: set[str]
) -> str | None:
    options = product.get("options")
    if not isinstance(options, list):
        return None
    for index, option in enumerate(options, start=1):
        if isinstance(option, dict):
            name = _text(option.get("name"))
        else:
            name = _text(option)
        if name and name.casefold() in option_names:
            value = _text(variant.get(f"option{index}"))
            if value and value.casefold() != "default title":
                return value
    return None


def extract_ambrane_fields(
    soup: BeautifulSoup,
    page_url: str,
    selling_price: float | None,
) -> AmbraneExtraction | None:
    hostname = (urlsplit(page_url).hostname or "").casefold()
    if hostname != "ambraneindia.com" and not hostname.endswith(".ambraneindia.com"):
        return None

    warnings: list[str] = []
    product_handle = unquote(urlsplit(page_url).path.rstrip("/").rsplit("/", 1)[-1])
    matching_products = [
        state
        for state in _product_states(soup)
        if state.get("handle") == product_handle
    ]
    if len(matching_products) != 1:
        warnings.append(
            "Ambrane product-state data was missing or did not uniquely match the requested product handle."
        )
        return AmbraneExtraction({}, warnings)

    product = matching_products[0]
    requested_variants = parse_qs(urlsplit(page_url).query).get("variant", [])
    requested_variant = requested_variants[0] if len(requested_variants) == 1 else None
    variant = _selected_variant(product.get("variants"), requested_variant)
    fields: dict[str, AmbraneField] = {}

    title = _text(product.get("title"))
    if title:
        fields["product_title"] = AmbraneField(
            title, "BspdCurrentProduct.title", 0.97
        )

    vendor = _text(product.get("vendor"))
    if vendor:
        fields["brand"] = AmbraneField(
            vendor, "BspdCurrentProduct.vendor", 0.94
        )
        fields["merchant"] = AmbraneField(
            vendor, "BspdCurrentProduct.vendor", 0.9
        )

    description = _text(
        BeautifulSoup(str(product.get("description", "")), "lxml").get_text(" ")
    )
    if description:
        fields["description"] = AmbraneField(
            description, "BspdCurrentProduct.description", 0.92
        )

    image_values = product.get("images", [])
    if isinstance(image_values, list):
        images = list(
            dict.fromkeys(
                absolute
                for image in image_values
                if isinstance(image, str)
                and (absolute := urljoin(page_url, image.strip()))
            )
        )
        if images:
            fields["product_images"] = AmbraneField(
                images, "BspdCurrentProduct.images", 0.94
            )

    if variant is None:
        warnings.append(
            "Ambrane selected variant did not uniquely match the requested variant ID; variant-specific values were skipped."
        )
        return AmbraneExtraction(fields, warnings)

    fields["selected_color"] = (
        AmbraneField(
            color,
            "BspdCurrentProduct.variants[].optionN",
            0.92,
        )
        if (color := _option_value(product, variant, {"color", "colour"}))
        else None
    )
    fields["selected_size"] = (
        AmbraneField(
            size,
            "BspdCurrentProduct.variants[].optionN",
            0.92,
        )
        if (size := _option_value(product, variant, {"size"}))
        else None
    )
    fields = {name: field for name, field in fields.items() if field is not None}

    visible_prices = _visible_rupee_amounts(soup)
    variant_price = _number(variant.get("price"))
    scales = [
        scale
        for scale in (1.0, 0.01)
        if variant_price is not None
        and any(abs(variant_price * scale - amount) < 0.01 for amount in visible_prices)
    ]
    if len(scales) != 1:
        warnings.append(
            "Ambrane selected variant price could not be matched uniquely to the visible INR price."
        )
        return AmbraneExtraction(fields, warnings)

    scale = scales[0]
    selected_price = _state_price(variant.get("price"), scale)
    if selected_price is None:
        return AmbraneExtraction(fields, warnings)
    if selling_price is not None and abs(selling_price - selected_price) >= 0.01:
        warnings.append(
            "Ambrane selected variant price conflicted with the extracted selling price; variant prices were skipped."
        )
        return AmbraneExtraction(fields, warnings)

    fields["selling_price_inr"] = AmbraneField(
        selected_price,
        "BspdCurrentProduct.variants[].price matched to visible INR price",
        0.98,
    )
    comparison_price = _state_price(variant.get("compare_at_price"), scale)
    if (
        comparison_price is not None
        and comparison_price > selected_price
        and any(abs(comparison_price - amount) < 0.01 for amount in visible_prices)
    ):
        fields["mrp_inr"] = AmbraneField(
            comparison_price,
            "BspdCurrentProduct.variants[].compare_at_price matched to visible INR price",
            0.98,
        )
    return AmbraneExtraction(fields, warnings)
