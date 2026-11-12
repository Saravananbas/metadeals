from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag


@dataclass(frozen=True)
class AjioField:
    value: Any
    source_locator: str
    confidence: float
    note: str | None = None


@dataclass(frozen=True)
class AjioExtraction:
    fields: dict[str, AjioField]
    warnings: list[str]


def _text(element: Tag | None) -> str | None:
    if element is None:
        return None
    text = re.sub(r"\s+", " ", element.get_text(" ", strip=True)).strip()
    return text or None


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    text = re.sub(r"[^\d,.\-]", "", str(value)).replace(",", "")
    if not text:
        return None
    try:
        number = Decimal(text)
    except InvalidOperation:
        return None
    return float(number) if number.is_finite() and number >= 0 else None


def _product_code(page_url: str) -> str | None:
    match = re.search(r"/p/(\d+)(?:_|/|$)", urlsplit(page_url).path)
    return match.group(1) if match else None


def _image_urls(soup: BeautifulSoup, page_url: str, product_code: str) -> list[str]:
    candidates: list[str] = []
    for image in soup.select('img[alt^="Product image of"]'):
        values = [
            image.get("src"),
            image.get("data-src"),
            image.get("data-original"),
        ]
        for attribute in ("srcset", "data-srcset"):
            srcset = image.get(attribute)
            if isinstance(srcset, str):
                values.extend(
                    entry.strip().split()[0]
                    for entry in srcset.split(",")
                    if entry.strip()
                )
        for value in values:
            if not isinstance(value, str) or not value.strip():
                continue
            absolute = urljoin(page_url, value.strip())
            parsed = urlsplit(absolute)
            if (
                parsed.scheme in {"http", "https"}
                and re.search(rf"(?<!\d){re.escape(product_code)}(?!\d)", parsed.path)
                and absolute not in candidates
            ):
                candidates.append(absolute)

    full_size = [url for url in candidates if "-473Wx593H" in url]
    return (full_size or candidates)[:50]


def _category_fields(
    soup: BeautifulSoup, product_title: str | None
) -> dict[str, AjioField]:
    breadcrumbs = [
        name
        for link in soup.select('nav[aria-label="Breadcrumb"] a')
        if (name := _text(link))
        and name.casefold() not in {"home", "women", "men", "kids"}
        and name != product_title
    ]
    fields: dict[str, AjioField] = {}
    if breadcrumbs:
        category = breadcrumbs[-2] if len(breadcrumbs) > 1 else breadcrumbs[0]
        fields["category"] = AjioField(
            category,
            'nav[aria-label="Breadcrumb"] a',
            0.88,
        )
    if len(breadcrumbs) > 1:
        fields["subcategory"] = AjioField(
            breadcrumbs[-1],
            'nav[aria-label="Breadcrumb"] a',
            0.86,
        )
    return fields


def _selected_variant_text(soup: BeautifulSoup, selector: str) -> str | None:
    selected = soup.select_one(selector)
    if selected is None:
        return None
    for attribute in ("aria-label", "title"):
        value = selected.get(attribute)
        if isinstance(value, str) and value:
            return value
    return _text(selected)


def extract_ajio_fields(soup: BeautifulSoup, page_url: str) -> AjioExtraction | None:
    hostname = (urlsplit(page_url).hostname or "").casefold()
    if hostname != "ajio.com" and not hostname.endswith(".ajio.com"):
        return None

    product_code = _product_code(page_url)
    if not product_code:
        return None
    images = _image_urls(soup, page_url, product_code)
    if not images:
        return AjioExtraction(
            fields={},
            warnings=[
                "AJIO extraction was skipped because no product-gallery image matched the product code in the URL."
            ],
        )

    fields: dict[str, AjioField] = {
        "product_images": AjioField(
            images,
            'img[alt^="Product image of"] with URL matching the product code',
            0.98,
        )
    }
    title = _text(soup.select_one("h1.prod-name"))
    if title:
        fields["product_title"] = AjioField(title, "h1.prod-name", 0.98)

    brand = _text(soup.select_one(".brand-name"))
    if brand:
        fields["brand"] = AjioField(brand, ".brand-name", 0.95)
    fields["merchant"] = AjioField(
        "AJIO",
        "AJIO product page",
        0.9,
        "AJIO is the retailer; the marketplace seller was not independently verified.",
    )

    description_sections = soup.select(".prod-desc .pdpTabSub")
    description_parts: list[str] = []
    for section in description_sections:
        for detail in section.select(".detail-list"):
            value = _text(detail)
            if value and value not in description_parts:
                description_parts.append(value)
    if description_parts:
        fields["description"] = AjioField(
            " ".join(description_parts),
            ".prod-desc .pdpTabSub .tabName, .prod-desc .pdpTabSub .detail-list",
            0.88,
        )

    price_section = soup.select_one(".prod-price-section")
    selling_price = _number(_text(price_section.select_one(".prod-sp")) if price_section else None)
    if selling_price is not None:
        fields["selling_price_inr"] = AjioField(
            selling_price,
            ".prod-price-section .prod-sp",
        0.98,
        )

    mrp_label = soup.select_one('.prod-price-sec .prod-mrp[aria-label="MRP"]')
    if mrp_label:
        mrp_container = mrp_label.parent if isinstance(mrp_label.parent, Tag) else None
        mrp_element = mrp_container.select_one(".prod-cp") if mrp_container else None
        if mrp_element is None:
            mrp_section = soup.select_one(".prod-price-sec")
            mrp_element = mrp_section.select_one(".prod-cp") if mrp_section else None
        mrp = _number(_text(mrp_element))
        if mrp is not None and (selling_price is None or mrp >= selling_price):
            fields["mrp_inr"] = AjioField(
                mrp,
                '.prod-price-sec .prod-mrp[aria-label="MRP"] ~ .prod-cp',
                0.99,
                "Read from the price group explicitly labelled MRP.",
            )

    discount = _number(_text(price_section.select_one(".prod-discnt")) if price_section else None)
    if discount is not None and discount <= 100:
        fields["discount_percent"] = AjioField(
            discount,
            ".prod-price-section .prod-discnt",
            0.94,
        )

    rating = _number(_text(soup.select_one(".rating-popup ._3c5q0")))
    if rating is not None:
        fields["rating"] = AjioField(rating, ".rating-popup ._3c5q0", 0.97)

    review_text = _text(soup.select_one(".rating-label-star-count"))
    review_match = re.search(r"[\d,]+", review_text or "")
    review_count = _number(review_match.group(0)) if review_match else None
    if review_count is not None:
        fields["review_count"] = AjioField(
            int(review_count),
            ".rating-label-star-count",
            0.95,
        )

    selected_color = _text(soup.select_one(".prod-color")) or _selected_variant_text(
        soup, '.color-swatch .swatch-item[aria-checked="true"]'
    )
    if selected_color:
        fields["selected_color"] = AjioField(
            selected_color,
            'selected AJIO color swatch or ".prod-color"',
            0.99,
        )

    selected_size = _selected_variant_text(
        soup,
        ".size-variant-item.selected, .size-swatch[aria-checked='true']",
    )
    if selected_size:
        fields["selected_size"] = AjioField(
            selected_size,
            "selected AJIO size swatch",
            0.99,
        )

    fields.update(_category_fields(soup, title))
    coupon_codes = {
        match.group(1).upper()
        for match in re.finditer(
            r"\b(?:coupon(?:\s+code)?|use\s+code)\s*[:\-]?\s*([A-Z0-9][A-Z0-9_-]{3,20})\b",
            soup.get_text(" ", strip=True),
            flags=re.IGNORECASE,
        )
    }
    if len(coupon_codes) == 1:
        fields["coupon_code"] = AjioField(
            next(iter(coupon_codes)),
            "visible page coupon text",
            0.78,
        )

    return AjioExtraction(fields=fields, warnings=[])
