from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from bs4 import BeautifulSoup


@dataclass(frozen=True)
class AmazonField:
    value: Any
    source_locator: str


def extract_amazon_fields(
    soup: BeautifulSoup,
    page_url: str,
) -> dict[str, AmazonField] | None:
    hostname = (urlsplit(page_url).hostname or "").lower()
    if hostname not in {"amazon.in", "www.amazon.in"}:
        return None

    url_asin = _url_asin(page_url)
    page_asin = _page_asin(soup)
    if not url_asin or page_asin != url_asin:
        return None

    fields: dict[str, AmazonField] = {}
    title = _text(soup.select_one("#productTitle"))
    if title:
        fields["product_title"] = AmazonField(title, "#productTitle")

    images = _product_images(soup, url_asin)
    if images:
        fields["product_images"] = AmazonField(images, "#landingImage, #altImages")

    brand = _brand(soup)
    if brand:
        fields["brand"] = AmazonField(brand, "#bylineInfo")

    description = _description(soup)
    if description:
        fields["description"] = AmazonField(
            description,
            "#feature-bullets, #productDescription",
        )

    breadcrumbs = _breadcrumbs(soup)
    if breadcrumbs:
        fields["category"] = AmazonField(
            breadcrumbs[0],
            "#wayfinding-breadcrumbs_feature_div li",
        )
        if len(breadcrumbs) > 1:
            fields["subcategory"] = AmazonField(
                breadcrumbs[-1],
                "#wayfinding-breadcrumbs_feature_div li",
            )

    price_container = soup.select_one("#corePriceDisplay_desktop_feature_div")
    if not _asin_matches(price_container, url_asin):
        price_container = soup.select_one("#apex_desktop")
        if not _asin_matches(price_container, url_asin):
            price_container = None

    if price_container:
        selling_price = _selling_price(price_container)
        if selling_price is not None:
            fields["selling_price_inr"] = AmazonField(
                selling_price,
                "#corePriceDisplay_desktop_feature_div .apex-pricetopay-value",
            )
        mrp = _mrp(price_container)
        if mrp is not None:
            fields["mrp_inr"] = AmazonField(
                mrp,
                "#corePriceDisplay_desktop_feature_div .apex-basisprice-value (M.R.P.)",
            )

    seller = _text(
        soup.select_one(
            "#merchantInfoFeature_feature_div #sellerProfileTriggerId"
        )
    )
    if seller:
        fields["merchant"] = AmazonField(
            seller,
            "#merchantInfoFeature_feature_div #sellerProfileTriggerId",
        )

    rating = _rating(soup)
    if rating is not None:
        fields["rating"] = AmazonField(rating, "#acrPopover[title]")

    review_count = _review_count(soup)
    if review_count is not None:
        fields["review_count"] = AmazonField(
            review_count,
            "#acrCustomerReviewText",
        )

    return fields


def _url_asin(page_url: str) -> str | None:
    match = re.search(r"/dp/([A-Z0-9]{10})(?:/|$)", urlsplit(page_url).path, re.I)
    return match.group(1).upper() if match else None


def _page_asin(soup: BeautifulSoup) -> str | None:
    asin_input = soup.select_one('input#ASIN[name="ASIN"]')
    if asin_input and asin_input.get("value"):
        return str(asin_input["value"]).upper()
    product_root = soup.select_one("#dp[data-asin]")
    if product_root and product_root.get("data-asin"):
        return str(product_root["data-asin"]).upper()
    return None


def _asin_matches(container: Any, expected_asin: str) -> bool:
    if container is None:
        return False
    container_asin = container.get("data-csa-c-asin")
    return container_asin is None or str(container_asin).upper() == expected_asin


def _text(element: Any) -> str | None:
    if element is None:
        return None
    text = re.sub(r"\s+", " ", element.get_text(" ", strip=True)).strip()
    return text or None


def _product_images(soup: BeautifulSoup, expected_asin: str) -> list[str]:
    images: list[str] = []
    for script in soup.find_all("script"):
        source = script.string or script.get_text()
        if "ImageBlockATF" not in source:
            continue
        asin_match = re.search(
            r"""['"]asin['"]\s*:\s*['"]([A-Z0-9]{10})['"]""",
            source,
            re.I,
        )
        if not asin_match or asin_match.group(1).upper() != expected_asin:
            continue
        for match in re.finditer(r"parseJSON\('((?:\\.|[^'])*)'\)", source):
            try:
                gallery = json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
            if not isinstance(gallery, list):
                continue
            for image in gallery:
                if not isinstance(image, dict):
                    continue
                candidate = image.get("hiRes")
                if (
                    isinstance(candidate, str)
                    and candidate.startswith("https://")
                    and candidate not in images
                ):
                    images.append(candidate)
            if images:
                return images[:50]

    image_nodes = []
    landing_image = soup.select_one("#landingImage")
    if landing_image:
        image_nodes.append(landing_image)
    image_nodes.extend(soup.select("#altImages [data-old-hires]"))

    for node in image_nodes:
        high_resolution = node.get("data-old-hires")
        if isinstance(high_resolution, str) and high_resolution.startswith("https://"):
            if high_resolution not in images:
                images.append(high_resolution)
        dynamic_images = node.get("data-a-dynamic-image")
        if not high_resolution and isinstance(dynamic_images, str):
            try:
                candidates = json.loads(dynamic_images)
            except json.JSONDecodeError:
                candidates = {}
            if isinstance(candidates, dict):
                candidate = _best_dynamic_image(candidates)
                if candidate and candidate not in images:
                    images.append(candidate)
        if not high_resolution and not dynamic_images:
            candidate = node.get("src")
            if isinstance(candidate, str) and candidate.startswith("https://"):
                if candidate not in images:
                    images.append(candidate)
    return images[:50]


def _best_dynamic_image(candidates: dict[str, Any]) -> str | None:
    sized_candidates: list[tuple[int, str]] = []
    for url, dimensions in candidates.items():
        if not isinstance(url, str) or not url.startswith("https://"):
            continue
        if (
            isinstance(dimensions, list)
            and len(dimensions) == 2
            and all(isinstance(dimension, int) and dimension > 0 for dimension in dimensions)
        ):
            sized_candidates.append((dimensions[0] * dimensions[1], url))
    if not sized_candidates:
        return None
    return max(sized_candidates)[1]


def _brand(soup: BeautifulSoup) -> str | None:
    brand_text = _text(soup.select_one("#bylineInfo"))
    if not brand_text:
        return None
    match = re.fullmatch(r"Visit the\s+(.+?)\s+Store", brand_text, re.I)
    if match:
        return match.group(1).strip()
    match = re.fullmatch(r"Brand:\s*(.+)", brand_text, re.I)
    return match.group(1).strip() if match else brand_text


def _description(soup: BeautifulSoup) -> str | None:
    bullet_items = [
        _text(item)
        for item in soup.select("#feature-bullets li .a-list-item")
    ]
    bullets = [
        item
        for item in bullet_items
        if item and item.casefold() not in {"see more", "see less"}
    ]
    description = " ".join(bullets)
    if not description:
        description = _text(soup.select_one("#productDescription"))
    return description[:5000] if description else None


def _breadcrumbs(soup: BeautifulSoup) -> list[str]:
    values: list[str] = []
    for element in soup.select("#wayfinding-breadcrumbs_feature_div li a"):
        value = _text(element)
        if value and value not in values:
            values.append(value)
    return values


def _price_amount(element: Any) -> float | None:
    if element is None:
        return None
    offscreen = element.select_one(".a-offscreen")
    visible = _text(offscreen)
    if not visible:
        visible = "".join(
            part.get_text("", strip=True)
            for part in element.select(".a-price-symbol, .a-price-whole, .a-price-fraction")
        )
    if not visible or "₹" not in visible:
        return None
    match = re.search(r"\d[\d,]*(?:\.\d{1,2})?", visible)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _selling_price(container: Any) -> float | None:
    price = container.select_one(".a-price.apex-pricetopay-value")
    if price is None:
        return None
    return _price_amount(price)


def _mrp(container: Any) -> float | None:
    for price in container.select(".a-price.a-text-price[data-a-strike='true']"):
        parent_text = _text(price.parent) or ""
        if re.search(r"\bM\.?\s*R\.?\s*P\.?\b", parent_text, re.I):
            amount = _price_amount(price)
            if amount is not None:
                return amount
    return None


def _rating(soup: BeautifulSoup) -> float | None:
    element = soup.select_one("#acrPopover[title]")
    title = str(element.get("title", "")) if element else ""
    match = re.search(r"(\d+(?:\.\d+)?)\s+out of 5", title, re.I)
    if not match:
        return None
    try:
        value = float(match.group(1))
    except ValueError:
        return None
    return value if 0 <= value <= 5 else None


def _review_count(soup: BeautifulSoup) -> int | None:
    element = soup.select_one("#acrCustomerReviewText")
    if element is None:
        return None
    aria_label = str(element.get("aria-label", ""))
    match = re.search(r"([\d,]+)\s+Reviews?\b", aria_label, re.I)
    if not match:
        match = re.search(r"([\d,]+)", _text(element) or "")
    return int(match.group(1).replace(",", "")) if match else None
