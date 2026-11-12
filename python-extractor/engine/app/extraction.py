from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup

from app.adapters.sites.ajio import extract_ajio_fields
from app.adapters.sites.ambrane import extract_ambrane_fields
from app.browser.fetch import fetch_page_playwright
from app.adapters.sites.amazon import extract_amazon_fields
from app.adapters.sites.bajaj import extract_bajaj_fields
from app.adapters.sites.duroflex import extract_duroflex_fields
from app.adapters.sites.myntra import extract_myntra_price
from app.fetch import FetchResult, fetch_page
from app.source_archive import archive_page_source
from app.schemas import (
    CanonicalProduct,
    ExtractionStatus,
    FieldProvenance,
    PageFetchError,
    UnsafeUrlError,
)


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = re.sub(r"\s+", " ", value).strip()
    return text or None


def _jsonld_values(value: Any):
    if isinstance(value, list):
        for item in value:
            yield from _jsonld_values(item)
    elif isinstance(value, dict):
        yield value
        for key in ("@graph", "mainEntity", "mainEntityOfPage", "hasVariant"):
            if key in value:
                yield from _jsonld_values(value[key])


def _has_type(node: dict[str, Any], expected: str) -> bool:
    types = node.get("@type", [])
    if isinstance(types, str):
        types = [types]
    return any(str(value).rsplit("/", 1)[-1].rsplit("#", 1)[-1] == expected for value in types)


def _recover_malformed_product_jsonld(raw: str) -> Any | None:
    normalized: list[str] = []
    in_string = False
    escaped = False
    for character in raw:
        if in_string and ord(character) < 0x20:
            normalized.append(f"\\u{ord(character):04x}")
        else:
            normalized.append(character)
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
        elif character == '"':
            in_string = True

    text = "".join(normalized)
    start = len(text) - len(text.lstrip())
    try:
        value, end = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError:
        return None
    if text[end:].strip() != "}":
        return None
    if not any(_has_type(node, "Product") for node in _jsonld_values(value)):
        return None
    return value


def _load_jsonld(soup: BeautifulSoup, warnings: list[str]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for index, script in enumerate(soup.select('script[type="application/ld+json"]'), start=1):
        raw = script.string or script.get_text()
        try:
            value = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            value = _recover_malformed_product_jsonld(raw)
            if value is None:
                warnings.append(f"Could not parse JSON-LD block {index}.")
                continue
            warnings.append(
                f"Recovered the Product data from malformed JSON-LD block {index}; "
                "the source contains unescaped control characters and one extra closing brace."
            )
        nodes.extend(_jsonld_values(value))
    return nodes


def _meta(soup: BeautifulSoup, *selectors: str) -> tuple[str | None, str | None]:
    for selector in selectors:
        element = soup.select_one(selector)
        if element:
            value = _clean_text(element.get("content"))
            if value:
                return value, selector
    return None, None


def _product_title(soup: BeautifulSoup) -> tuple[str | None, str | None, str | None]:
    for selector in (
        "#productTitle",
        "[data-product-title]",
        "[itemtype*='Product'] [itemprop='name']",
    ):
        element = soup.select_one(selector)
        if element:
            value = _clean_text(element.get("content") or element.get_text(" ", strip=True))
            if value:
                return value, "html_dom", selector

    title, locator = _meta(
        soup,
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="title"]',
    )
    if title:
        return title, "metadata", locator

    if soup.title:
        title = _clean_text(soup.title.get_text(" ", strip=True))
        if title:
            return title, "metadata", "title"

    for heading in soup.select("h1"):
        title = _clean_text(heading.get_text(" ", strip=True))
        if title and title.casefold() not in {
            "add to your order",
            "access denied",
            "page not found",
        }:
            return title, "html_dom", "h1"
    return None, None, None


def _schema_name(value: Any) -> str | None:
    if isinstance(value, str):
        return _clean_text(value)
    if isinstance(value, dict):
        return _clean_text(value.get("name")) or _clean_text(value.get("legalName"))
    return None


def _image_values(value: Any, page_url: str) -> list[str]:
    if isinstance(value, str):
        candidates = [value]
    elif isinstance(value, list):
        candidates = []
        for item in value:
            if isinstance(item, str):
                candidates.append(item)
            elif isinstance(item, dict):
                candidates.extend(
                    entry
                    for entry in (item.get("url"), item.get("contentUrl"))
                    if isinstance(entry, str)
                )
    elif isinstance(value, dict):
        candidates = [
            entry
            for entry in (value.get("url"), value.get("contentUrl"))
            if isinstance(entry, str)
        ]
    else:
        candidates = []

    images: list[str] = []
    for candidate in candidates:
        absolute = urljoin(page_url, candidate.strip())
        if urlsplit(absolute).scheme in {"http", "https"} and absolute not in images:
            images.append(absolute)
    return images[:50]


def _dom_product_images(
    soup: BeautifulSoup,
    page_url: str,
    product_title: str | None,
) -> tuple[list[str], str | None]:
    title = _clean_text(product_title)
    if not title:
        return [], None
    primary_title = re.split(r"\s*[|–—]\s*", title, maxsplit=1)[0].strip()
    title_aliases = {title.casefold(), primary_title.casefold()}
    images: list[str] = []
    locators: list[str] = []
    for element in soup.find_all(("img", "source")):
        evidence = [
            _clean_text(element.get("alt")),
            _clean_text(element.get("title")),
        ]
        ancestor = element.parent
        while ancestor is not None:
            evidence.extend(
                (
                    _clean_text(ancestor.get("aria-label")),
                    _clean_text(ancestor.get("title")),
                )
            )
            ancestor = ancestor.parent
        if not any(
            item
            and (
                item.casefold() in title_aliases
                or any(alias in item.casefold() for alias in title_aliases)
            )
            for item in evidence
        ):
            continue

        candidates: list[str] = []
        for attribute in (
            "src",
            "data-src",
            "data-lazy-src",
            "data-original",
            "data-zoom-image",
            "data-large_image",
        ):
            value = element.get(attribute)
            if isinstance(value, str) and value.strip():
                candidates.append(value.strip())
        srcset = element.get("srcset") or element.get("data-srcset")
        if not candidates and isinstance(srcset, str):
            for candidate in srcset.split(","):
                image_url = candidate.strip().split()
                if image_url:
                    candidates.append(image_url[0])

        for candidate in candidates:
            for image_url in _image_values(candidate, page_url):
                if image_url not in images:
                    images.append(image_url)
                    locators.append(element.name or "img")
        if len(images) >= 50:
            break
    return images[:50], ", ".join(dict.fromkeys(locators)) or None


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
    if not number.is_finite() or number < 0:
        return None
    converted = float(number)
    return converted if math.isfinite(converted) else None


def _all_product_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [node for node in nodes if _has_type(node, "Product")]


def _select_product(
    products: list[dict[str, Any]],
    soup: BeautifulSoup,
    page_url: str,
    warnings: list[str],
) -> dict[str, Any] | None:
    if not products:
        return None
    hostname = (urlsplit(page_url).hostname or "").casefold()
    if hostname == "ajio.com" or hostname.endswith(".ajio.com"):
        product_code_match = re.search(r"/p/(\d+)(?:_|/|$)", urlsplit(page_url).path)
        if product_code_match:
            product_code = product_code_match.group(1)
            code_matched_products = [
                product
                for product in products
                if (
                    (sku := _clean_text(product.get("sku")))
                    and sku.startswith(product_code)
                )
                or any(
                    isinstance(candidate_url, str)
                    and product_code
                    in (urlsplit(urljoin(page_url, candidate_url)).path)
                    for candidate_url in (
                        product.get("url"),
                        *(
                            offer.get("url")
                            for offer in _offer_records(product)
                        ),
                    )
                )
            ]
            if not code_matched_products:
                warnings.append(
                    "AJIO structured Product records did not match the product code in the URL; "
                    "product-specific page DOM data was used instead."
                )
                return None
            selected_size = soup.select_one(
                ".size-variant-item.selected, .size-swatch[aria-checked='true']"
            )
            selected_size_text = (
                _clean_text(selected_size.get_text(" ", strip=True))
                if selected_size
                else None
            )
            size_matched_products = [
                product
                for product in code_matched_products
                if selected_size_text
                and _clean_text(product.get("size")) == selected_size_text
            ]
            if size_matched_products:
                code_matched_products = size_matched_products
            products = code_matched_products
    if len(products) == 1:
        return products[0]

    h1_element = soup.select_one("h1")
    h1 = _clean_text(h1_element.get_text(" ", strip=True)) if h1_element else None
    title_meta, _ = _meta(soup, 'meta[property="og:title"]', "meta[name='title']")
    reference_title = (h1 or title_meta or "").casefold()
    current_url = urlsplit(page_url)
    url_matches: list[dict[str, Any]] = []
    for product in products:
        candidate_urls = [product.get("url")]
        candidate_urls.extend(
            offer.get("url") for offer in _offer_records(product)
        )
        matched_url = False
        for candidate_url in candidate_urls:
            if not isinstance(candidate_url, str):
                continue
            absolute = urljoin(page_url, candidate_url)
            parsed_candidate = urlsplit(absolute)
            if (
                parsed_candidate.hostname == current_url.hostname
                and parsed_candidate.path.rstrip("/") == current_url.path.rstrip("/")
            ):
                url_matches.append(product)
                matched_url = True
                break
        if matched_url:
            continue

    if url_matches:
        unique_url_matches = {
            (
                _clean_text(product.get("name")),
                _clean_text(product.get("sku")),
                _clean_text(product.get("url"))
                or next(
                    (
                        _clean_text(offer.get("url"))
                        for offer in _offer_records(product)
                        if _clean_text(offer.get("url"))
                    ),
                    None,
                ),
            ): product
            for product in url_matches
        }
        if len(unique_url_matches) == 1:
            return next(iter(unique_url_matches.values()))
        warnings.append(
            "Multiple Product records matched the page URL and the primary product could not be identified confidently."
        )
        return None

    matching = []
    for product in products:
        name = _clean_text(product.get("name"))
        if name and reference_title and name.casefold() in reference_title:
            matching.append(product)

    unique_matches = {
        (
            _clean_text(product.get("name")),
            _clean_text(product.get("sku")),
            _clean_text(product.get("url")),
        ): product
        for product in matching
    }
    if len(unique_matches) == 1:
        return next(iter(unique_matches.values()))
    warnings.append(
        "Multiple Product records were found and the primary product could not be identified confidently."
    )
    return None


def _offer_records(product: dict[str, Any]) -> list[dict[str, Any]]:
    offers = product.get("offers", [])
    if isinstance(offers, dict):
        offers = [offers]
    if not isinstance(offers, list):
        return []
    return [offer for offer in offers if isinstance(offer, dict)]


def _explicit_list_price(
    product: dict[str, Any], offers: list[dict[str, Any]]
) -> float | None:
    specifications: list[Any] = []
    product_specs = product.get("priceSpecification", [])
    specifications.extend(product_specs if isinstance(product_specs, list) else [product_specs])
    for offer in offers:
        offer_specs = offer.get("priceSpecification", [])
        specifications.extend(offer_specs if isinstance(offer_specs, list) else [offer_specs])
    accepted_types = {"listprice", "msrp"}
    prices: set[float] = set()
    for specification in specifications:
        if not isinstance(specification, dict):
            continue
        price_type = str(specification.get("priceType", "")).lower().rsplit("/", 1)[-1]
        currency = str(specification.get("priceCurrency", "")).upper()
        if price_type in accepted_types and currency == "INR":
            price = _number(specification.get("price"))
            if price is not None:
                prices.add(price)
    return next(iter(prices)) if len(prices) == 1 else None


def _flipkart_description_list_price(
    product: dict[str, Any], page_url: str, selling_price: float
) -> float | None:
    hostname = (urlsplit(page_url).hostname or "").casefold()
    if hostname != "flipkart.com" and not hostname.endswith(".flipkart.com"):
        return None

    product_id = parse_qs(urlsplit(page_url).query).get("pid", [])
    sku = _clean_text(product.get("sku"))
    if len(product_id) != 1 or not sku or product_id[0] != sku:
        return None

    description = _clean_text(product.get("description"))
    if not description:
        return None
    match = re.search(
        r"\bonly\s+for\s+(?:₹|INR\b|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)",
        description,
        flags=re.IGNORECASE,
    )
    amount = _number(match.group(1)) if match else None
    return amount if amount is not None and amount > selling_price else None


_CURRENCY_PRICE = re.compile(
    r"(?:₹|\bINR\b|\bRs\.?)\s*([\d,]+(?:\.\d{1,2})?)",
    flags=re.IGNORECASE,
)


def _currency_price_amounts(text: str) -> set[float]:
    return {
        amount
        for match in _CURRENCY_PRICE.finditer(text)
        if (amount := _number(match.group(1))) is not None
    }


def _single_price_amount(text: str) -> float | None:
    normalized = re.sub(
        r"(?:₹|\bINR\b|\bRs\.?)",
        "",
        text,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"\s+", "", normalized)
    if not re.fullmatch(r"[\d,]+(?:\.\d{1,2})?", normalized):
        return None
    return _number(normalized)


def _dom_price_pair(
    soup: BeautifulSoup,
    preferred_selling_price: float | None = None,
) -> tuple[float, float, str] | None:
    pairs: dict[tuple[float, float], str] = {}
    list_price_markers = (
        "mrp",
        "listprice",
        "originalprice",
        "oldprice",
        "compareatprice",
        "regularprice",
        "pricewas",
        "wasprice",
    )
    sale_price_markers = (
        "currentprice",
        "saleprice",
        "sellingprice",
        "offerprice",
        "discountedprice",
        "finalprice",
        "spnprice",
    )
    for element in soup.find_all(True):
        text = _clean_text(element.get_text(" ", strip=True))
        if not text:
            continue
        raw_classes = element.get("class")
        class_tokens = (
            [str(value) for value in raw_classes]
            if isinstance(raw_classes, list)
            else [raw_classes] if isinstance(raw_classes, str) else []
        )
        classes = re.sub(r"[^a-z0-9]", "", " ".join(class_tokens).casefold())
        attributes = re.sub(
            r"[^a-z0-9]",
            "",
            " ".join(
                (element.name or "",)
                + tuple(
                    str(element.get(name, ""))
                    for name in (
                        "id",
                        "data-testid",
                        "data-test-id",
                        "aria-label",
                        "itemprop",
                    )
                )
            ).casefold(),
        )
        is_marked_list_price = (
            element.name in {"del", "s"}
            or str(element.get("data-a-strike", "")).casefold() == "true"
            or str(element.get("data-extractor-struck-price", "")).casefold()
            == "true"
            or "line-through" in str(element.get("style", "")).casefold()
            or "strike" in classes
            or "linethrough" in classes
            or any(
                marker in classes or marker in attributes
                for marker in list_price_markers
            )
        )
        element_prices = _currency_price_amounts(text)
        if not element_prices and is_marked_list_price:
            amount = _single_price_amount(text)
            if amount is not None:
                element_prices = {amount}
        if len(element_prices) != 1:
            continue
        mrp = next(iter(element_prices))
        if not is_marked_list_price:
            continue

        locator = f"{element.name}.{'.'.join(class_tokens)}".rstrip(".")
        for ancestor in element.parents:
            scope_text = _clean_text(ancestor.get_text(" ", strip=True))
            if not scope_text or len(scope_text) > 500:
                continue
            scope_prices = _currency_price_amounts(scope_text)
            if len(scope_prices) == 2 and mrp in scope_prices:
                sale_prices = {price for price in scope_prices if price < mrp}
            else:
                sale_prices = set()
                for candidate in ancestor.find_all(True):
                    if candidate is element:
                        continue
                    candidate_classes = candidate.get("class")
                    candidate_class_tokens = (
                        [str(value) for value in candidate_classes]
                        if isinstance(candidate_classes, list)
                        else [candidate_classes]
                        if isinstance(candidate_classes, str)
                        else []
                    )
                    candidate_attributes = re.sub(
                        r"[^a-z0-9]",
                        "",
                        " ".join(
                            (candidate.name or "",)
                            + tuple(
                                str(candidate.get(name, ""))
                                for name in (
                                    "id",
                                    "data-testid",
                                    "data-test-id",
                                    "aria-label",
                                    "itemprop",
                                )
                            )
                        ).casefold(),
                    )
                    candidate_classes_compact = re.sub(
                        r"[^a-z0-9]",
                        "",
                        " ".join(candidate_class_tokens).casefold(),
                    )
                    if not any(
                        marker in candidate_classes_compact
                        or marker in candidate_attributes
                        for marker in sale_price_markers
                    ):
                        continue
                    candidate_text = _clean_text(
                        candidate.get_text(" ", strip=True)
                    )
                    if candidate_text:
                        sale_price = _single_price_amount(candidate_text)
                        if sale_price is not None and sale_price < mrp:
                            sale_prices.add(sale_price)
            if preferred_selling_price in sale_prices:
                sale_price = preferred_selling_price
            elif len(sale_prices) == 1:
                sale_price = next(iter(sale_prices))
            else:
                continue
            pairs[(sale_price, mrp)] = locator
            break

    if len(pairs) == 1:
        (selling_price, mrp), locator = next(iter(pairs.items()))
        return selling_price, mrp, locator
    preferred_pairs = [
        pair
        for pair in pairs
        if preferred_selling_price is not None
        and preferred_selling_price in pair
    ]
    if len(preferred_pairs) == 1:
        pair = preferred_pairs[0]
        return pair[0], pair[1], pairs[pair]
    return None


def _dom_explicit_mrp(
    soup: BeautifulSoup,
    selling_price: float,
) -> tuple[float, str] | None:
    mrp_pattern = re.compile(
        r"\b(?:m\s*\.?\s*r\s*\.?\s*p\s*\.?|maximum\s+retail\s+price)\b"
        r"\s*(?:[:\-]\s*)?(?:₹|INR\b|Rs\.?\s*)?\s*"
        r"([\d,]+(?:\.\d{1,2})?)",
        flags=re.IGNORECASE,
    )
    candidates: dict[float, str] = {}
    for element in soup.find_all(True):
        text = _clean_text(element.get_text(" ", strip=True))
        if not text or len(text) > 500:
            continue
        direct_text = _clean_text(
            " ".join(
                str(child)
                for child in element.find_all(string=True, recursive=False)
            )
        ) or ""
        direct_amounts = {
            amount
            for match in re.finditer(r"[\d,]+(?:\.\d{1,2})?", direct_text)
            if (amount := _number(match.group(0))) is not None
        }
        amounts = {
            amount
            for match in mrp_pattern.finditer(text)
            if (amount := _number(match.group(1))) is not None
            and amount in direct_amounts
            and amount >= selling_price
        }
        if len(amounts) == 1:
            amount = next(iter(amounts))
            classes = element.get("class")
            class_tokens = (
                [str(value) for value in classes]
                if isinstance(classes, list)
                else [classes] if isinstance(classes, str) else []
            )
            locator = f"{element.name}.{'.'.join(class_tokens)}".rstrip(".")
            candidates[amount] = locator
    if len(candidates) == 1:
        amount = next(iter(candidates))
        return amount, candidates[amount]
    return None


def _dom_list_price(
    soup: BeautifulSoup,
    selling_price: float,
    preferred_price: float | None = None,
) -> tuple[float, str, float, bool] | None:
    candidates: dict[float, tuple[str, float]] = {}
    for element in soup.find_all(True):
        text = _clean_text(element.get_text(" ", strip=True))
        if not text:
            continue
        element_prices = _currency_price_amounts(text)
        if len(element_prices) == 1:
            amount = next(iter(element_prices))
        else:
            amount_text = re.sub(
                r"(?:₹|\bINR\b|\bRs\.?)", "", text, flags=re.IGNORECASE
            ).strip()
            amount_text = re.sub(r"\s+", "", amount_text)
            if not re.fullmatch(r"[\d,]+(?:\.\d{1,2})?", amount_text):
                continue
            amount = _number(amount_text)
            if amount is None:
                continue
        if amount <= selling_price:
            continue

        raw_classes = element.get("class")
        class_tokens = (
            [str(value) for value in raw_classes]
            if isinstance(raw_classes, list)
            else [raw_classes] if isinstance(raw_classes, str) else []
        )
        classes = " ".join(class_tokens).casefold()
        compact_classes = re.sub(r"[^a-z0-9]", "", classes)
        is_explicit_list_price = bool(
            re.search(
                r"(?:mrp|listprice|originalprice|oldprice|compareatprice|regularprice|pricewas|wasprice)",
                compact_classes,
            )
        )
        style = str(element.get("style", "")).casefold()
        has_line_through_style = bool(
            re.search(
                r"text-decoration(?:-line)?\s*:[^;]*(?:line-through|strike)",
                style,
            )
        )
        is_struck = (
            element.name in {"del", "s"}
            or str(element.get("data-a-strike", "")).casefold() == "true"
            or str(element.get("data-extractor-struck-price", "")).casefold()
            == "true"
            or has_line_through_style
            or "strike" in compact_classes
            or "linethrough" in compact_classes
        )
        if not (is_explicit_list_price or is_struck):
            continue

        paired_with_selling_price = False
        for ancestor in element.parents:
            scope_text = _clean_text(ancestor.get_text(" ", strip=True))
            if not scope_text or len(scope_text) > 1000:
                continue
            price_tokens = re.findall(
                r"(?:₹|\bINR\b|\bRs\.?)\s*([\d,]+(?:\s[\d,]+)*(?:\.\d{1,2})?)",
                scope_text,
                flags=re.IGNORECASE,
            )
            distinct_prices = {_number(token) for token in price_tokens}
            other_prices = {
                price for price in distinct_prices if price is not None and price != amount
            }
            if other_prices:
                paired_with_selling_price = selling_price in other_prices
                break
        if not paired_with_selling_price:
            continue

        confidence = 0.9 if is_explicit_list_price else 0.84
        locator = f"{element.name}.{'.'.join(class_tokens)}".rstrip(".")
        candidates[amount] = (locator, confidence)

    if len(candidates) == 1:
        amount = next(iter(candidates))
        locator, confidence = candidates[amount]
        return amount, locator, confidence, False
    if preferred_price is not None and preferred_price in candidates:
        locator, _ = candidates[preferred_price]
        return preferred_price, locator, 0.86, True
    return None


def _detect_block_page(fetch: FetchResult, soup: BeautifulSoup) -> bool:
    if fetch.http_status in {401, 403, 407, 429, 503}:
        return True
    title = _clean_text(soup.title.get_text(" ", strip=True)) if soup.title else ""
    visible_text = soup.get_text(" ", strip=True)[:5000].casefold()
    indicators = (
        "verify you are human",
        "unusual traffic",
        "access denied",
        "complete the security check",
        "captcha",
        "robot check",
        "checking your browser",
    )
    return any(marker in (title or "").casefold() or marker in visible_text for marker in indicators)


def _empty_result(
    url: str,
    *,
    status: ExtractionStatus,
    load_result: str,
    note: str,
) -> CanonicalProduct:
    now = datetime.now(timezone.utc)
    return CanonicalProduct(
        product_url=url,
        extraction_status=status,
        load_result=load_result,
        last_checked=now,
        notes=[note],
        field_provenance=_url_provenance(url, url, now),
    )


def _url_provenance(
    canonical_url: str, submitted_url: str, observed_at: datetime
) -> dict[str, list[FieldProvenance]]:
    return {
        "product_url": [
            FieldProvenance(
                field="product_url",
                value=canonical_url,
                source_type="user_input",
                source_locator="Product URL input",
                source_url=canonical_url,
                observed_at=observed_at,
                confidence=1.0,
                notes=f"Submitted URL: {submitted_url}",
            )
        ]
    }


def _parse_loaded_page(fetch: FetchResult) -> CanonicalProduct:
    now = datetime.now(timezone.utc)
    soup = BeautifulSoup(fetch.html, "html.parser")
    warnings = list(fetch.notes)
    nodes = _load_jsonld(soup, warnings)

    if any(_has_type(node, "Event") for node in nodes):
        return CanonicalProduct(
            product_url=fetch.final_url,
            extraction_status="unsupported_page_type",
            http_status=fetch.http_status,
            load_result="loaded",
            extraction_method=["json_ld"],
            last_checked=now,
            notes=["The page contains Event structured data, not a retail Product."],
            metadata={
                "page_type": "event",
                "source_snapshot_path": fetch.source_snapshot_path,
            },
            field_provenance=_url_provenance(
                fetch.final_url, fetch.submitted_url, now
            ),
        )
    if _detect_block_page(fetch, soup):
        if fetch.fetch_method == "playwright":
            block_note = (
                f"Playwright received HTTP {fetch.http_status}, but the page content "
                "is an access challenge or restriction, not product data; no bypass "
                "was attempted."
            )
        else:
            block_note = (
                "The site returned an access challenge or restriction; no bypass "
                "was attempted."
            )
        return CanonicalProduct(
            product_url=fetch.final_url,
            extraction_status="blocked",
            http_status=fetch.http_status,
            load_result="blocked",
            extraction_method=[fetch.fetch_method],
            last_checked=now,
            notes=[block_note],
            metadata={
                "page_type": "unknown",
                "source_snapshot_path": fetch.source_snapshot_path,
            },
            field_provenance=_url_provenance(
                fetch.final_url, fetch.submitted_url, now
            ),
        )
    if fetch.http_status >= 400:
        return CanonicalProduct(
            product_url=fetch.final_url,
            extraction_status="failed",
            http_status=fetch.http_status,
            load_result="http_error",
            last_checked=now,
            notes=[f"The server returned HTTP {fetch.http_status}; page data was not extracted."],
            metadata={
                "page_type": "unknown",
                "source_snapshot_path": fetch.source_snapshot_path,
            },
            field_provenance=_url_provenance(
                fetch.final_url, fetch.submitted_url, now
            ),
        )

    product_nodes = _all_product_nodes(nodes)
    product = _select_product(product_nodes, soup, fetch.final_url, warnings)
    methods = ["playwright"] if fetch.fetch_method == "playwright" else []
    if product:
        methods.append("json_ld")
    adapter_name: str | None = None
    provenance = _url_provenance(fetch.final_url, fetch.submitted_url, now)
    values: dict[str, Any] = {}

    def assign(
        field: str,
        value: Any,
        *,
        source_type: str,
        locator: str,
        confidence: float,
        note: str | None = None,
    ) -> None:
        if value is None or value == "" or value == []:
            return
        values[field] = value
        provenance[field] = [
            FieldProvenance(
                field=field,
                value=value,
                source_type=source_type,
                source_locator=locator,
                source_url=fetch.final_url,
                observed_at=now,
                confidence=confidence,
                notes=note,
            )
        ]

    if product:
        assign(
            "product_title",
            _clean_text(product.get("name")),
            source_type="json_ld",
            locator="Product.name",
            confidence=0.98,
        )
        assign(
            "description",
            _clean_text(product.get("description")),
            source_type="json_ld",
            locator="Product.description",
            confidence=0.95,
        )
        images = _image_values(product.get("image"), fetch.final_url)
        assign(
            "product_images",
            images,
            source_type="json_ld",
            locator="Product.image",
            confidence=0.95,
        )
        assign(
            "brand",
            _schema_name(product.get("brand")),
            source_type="json_ld",
            locator="Product.brand.name",
            confidence=0.95,
        )
        assign(
            "category",
            _clean_text(product.get("category")),
            source_type="json_ld",
            locator="Product.category",
            confidence=0.9,
        )
        aggregate = product.get("aggregateRating", product.get("AggregateRating"))
        if isinstance(aggregate, dict):
            assign(
                "rating",
                _number(aggregate.get("ratingValue")),
                source_type="json_ld",
                locator="Product.aggregateRating.ratingValue",
                confidence=0.95,
            )
            reviews = _number(aggregate.get("reviewCount"))
            assign(
                "review_count",
                int(reviews) if reviews is not None and reviews.is_integer() else None,
                source_type="json_ld",
                locator="Product.aggregateRating.reviewCount",
                confidence=0.93,
            )

        offers = _offer_records(product)
        inr_prices: set[float] = set()
        sellers: set[str] = set()
        verified_inr_offer = False
        for offer in offers:
            currency = str(offer.get("priceCurrency", "")).upper()
            if currency == "INR":
                verified_inr_offer = True
                price = _number(offer.get("price"))
                if price is not None:
                    inr_prices.add(price)
            seller = _schema_name(offer.get("seller"))
            if seller:
                sellers.add(seller)
        if len(inr_prices) == 1:
            assign(
                "selling_price_inr",
                next(iter(inr_prices)),
                source_type="json_ld",
                locator="Product.offers.price (priceCurrency=INR)",
                confidence=0.96,
            )
        elif len(inr_prices) > 1:
            warnings.append(
                "Multiple INR offer prices were found; price was left null because no offer/variant was selected."
            )
        if len(sellers) == 1:
            assign(
                "merchant",
                next(iter(sellers)),
                source_type="json_ld",
                locator="Product.offers.seller.name",
                confidence=0.9,
            )
        elif len(sellers) > 1:
            warnings.append("Multiple offer sellers were found; merchant was left null.")
        list_price = _explicit_list_price(product, offers)
        if list_price is not None:
            assign(
                "mrp_inr",
                list_price,
                source_type="json_ld",
                locator="Product.priceSpecification (explicit INR list/MSRP type)",
                confidence=0.92,
            )

        myntra_price = extract_myntra_price(
            soup,
            fetch.final_url,
            _clean_text(product.get("sku")),
        )
        if myntra_price is not None:
            if not verified_inr_offer:
                warnings.append(
                    "Myntra embedded price was not used because INR currency could not be verified."
                )
            else:
                if myntra_price.selling_price is not None:
                    current_price = values.get("selling_price_inr")
                    if (
                        current_price is not None
                        and current_price != myntra_price.selling_price
                    ):
                        warnings.append(
                            "Myntra JSON-LD and embedded-state selling prices conflict; embedded price was not applied."
                        )
                    else:
                        assign(
                            "selling_price_inr",
                            myntra_price.selling_price,
                            source_type="embedded_state",
                            locator="window.__myx.pdpData.price.discounted",
                            confidence=0.97,
                        )
                        if "embedded_state" not in methods:
                            methods.append("embedded_state")
                if myntra_price.mrp is not None:
                    current_mrp = values.get("mrp_inr")
                    if current_mrp is not None and current_mrp != myntra_price.mrp:
                        warnings.append(
                            "Myntra JSON-LD and embedded-state MRP values conflict; MRP was left null."
                        )
                        values.pop("mrp_inr", None)
                        provenance.pop("mrp_inr", None)
                    elif values.get("selling_price_inr") is None or (
                        myntra_price.mrp >= values["selling_price_inr"]
                    ):
                        assign(
                            "mrp_inr",
                            myntra_price.mrp,
                            source_type="embedded_state",
                            locator="window.__myx.pdpData.mrp",
                            confidence=0.97,
                            note="Explicit MRP from the selected product's matching embedded page state.",
                        )
                        if "embedded_state" not in methods:
                            methods.append("embedded_state")
                    else:
                        warnings.append(
                            "Myntra embedded MRP was lower than the selling price; MRP was left null."
                        )
                if myntra_price.discount_percent is not None:
                    assign(
                        "discount_percent",
                        myntra_price.discount_percent,
                        source_type="embedded_state",
                        locator="window.__myx.pdpData.discounts[].discountPercent",
                        confidence=0.97,
                    )
                    if "embedded_state" not in methods:
                        methods.append("embedded_state")

    bajaj_fields = extract_bajaj_fields(soup, fetch.final_url)
    if bajaj_fields and values.get("selling_price_inr") is None:
        assign(
            "selling_price_inr",
            bajaj_fields["selling_price_inr"].value,
            source_type="site_adapter",
            locator=bajaj_fields["selling_price_inr"].source_locator,
            confidence=0.8,
            note="Taken from the page's analytics view_item event; the visible price is not in the HTML, so verify it.",
        )
        warnings.append("Bajaj price comes from an analytics event; verify it. MRP is not published.")
        if "site_adapter" not in methods:
            methods.append("site_adapter")

    amazon_fields = extract_amazon_fields(soup, fetch.final_url)
    if amazon_fields:
        adapter_name = "amazon.in"
        for field, extracted in amazon_fields.items():
            if values.get(field) is None or values.get(field) == []:
                assign(
                    field,
                    extracted.value,
                    source_type="site_adapter",
                    locator=extracted.source_locator,
                    confidence=0.96 if field in {"mrp_inr", "selling_price_inr"} else 0.92,
                )
        if "amazon_html" not in methods:
            methods.append("amazon_html")

    ajio_result = extract_ajio_fields(soup, fetch.final_url)
    if ajio_result:
        warnings.extend(ajio_result.warnings)
        if ajio_result.fields:
            adapter_name = "ajio.com"
            for field, extracted in ajio_result.fields.items():
                current_provenance = provenance.get(field, [])
                prefer_adapter_value = (
                    current_provenance
                    and extracted.confidence > current_provenance[0].confidence
                )
                if values.get(field) is None or values.get(field) == [] or prefer_adapter_value:
                    if (
                        values.get(field) is not None
                        and values[field] != extracted.value
                    ):
                        warnings.append(
                            f"AJIO page DOM and structured data conflicted for {field}; the product-code-matched DOM value was preferred."
                        )
                    assign(
                        field,
                        extracted.value,
                        source_type="site_adapter",
                        locator=extracted.source_locator,
                        confidence=extracted.confidence,
                        note=extracted.note,
                    )
            if "ajio_dom" not in methods:
                methods.append("ajio_dom")

    if not values.get("product_title"):
        title, source_type, locator = _product_title(soup)
        if title and source_type and locator:
            assign(
                "product_title",
                title,
                source_type=source_type,
                locator=locator,
                confidence=0.9 if source_type == "html_dom" else 0.78,
            )
            if source_type not in methods:
                methods.append(source_type)

    if not values.get("description"):
        description, locator = _meta(
            soup,
            'meta[property="og:description"]',
            'meta[name="description"]',
        )
        if description:
            assign(
                "description",
                description,
                source_type="metadata",
                locator=locator or "meta description",
                confidence=0.68,
            )
            if "metadata" not in methods:
                methods.append("metadata")

    if not values.get("product_images"):
        image, locator = _meta(
            soup,
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
        )
        images = _image_values(image, fetch.final_url)
        if images:
            assign(
                "product_images",
                images,
                source_type="metadata",
                locator=locator or "og:image",
                confidence=0.68,
            )
            if "metadata" not in methods:
                methods.append("metadata")
        else:
            images, image_locator = _dom_product_images(
                soup,
                fetch.final_url,
                values.get("product_title"),
            )
            if images:
                assign(
                    "product_images",
                    images,
                    source_type="html_dom",
                    locator=f"product-title-matched gallery images: {image_locator}",
                    confidence=0.9,
                    note="Image alt text or its gallery control matched the product title.",
                )
                if "html_dom" not in methods:
                    methods.append("html_dom")

    if values.get("selling_price_inr") is None:
        price, price_locator = _meta(
            soup,
            'meta[property="product:price:amount"]',
            'meta[property="og:price:amount"]',
        )
        currency, currency_locator = _meta(
            soup,
            'meta[property="product:price:currency"]',
            'meta[property="og:price:currency"]',
        )
        amount = _number(price)
        if amount is not None and (currency or "").upper() == "INR":
            assign(
                "selling_price_inr",
                amount,
                source_type="metadata",
                locator=f"{price_locator}; {currency_locator}",
                confidence=0.72,
            )
            if "metadata" not in methods:
                methods.append("metadata")

    dom_price_pair = _dom_price_pair(
        soup,
        preferred_selling_price=values.get("selling_price_inr"),
    )
    if dom_price_pair:
        dom_selling_price, dom_mrp, locator = dom_price_pair
        for field, amount, description in (
            ("selling_price_inr", dom_selling_price, "sale"),
            ("mrp_inr", dom_mrp, "list"),
        ):
            existing_records = provenance.get(field, [])
            existing_source = (
                existing_records[0].source_type if existing_records else None
            )
            if existing_source in {"site_adapter", "embedded_state"}:
                continue
            if values.get(field) is not None and values[field] != amount:
                warnings.append(
                    "Structured or metadata pricing conflicted with the paired product-page sale and list prices; the paired DOM prices were preferred."
                )
            assign(
                field,
                amount,
                source_type="html_dom",
                locator=(
                    f"{description} price paired with the other product price: {locator}"
                ),
                confidence=0.96,
                note="Both prices were read from the same product price group.",
            )
        if "html_dom" not in methods:
            methods.append("html_dom")

    if values.get("mrp_inr") is None and values.get("selling_price_inr") is not None:
        explicit_mrp = _dom_explicit_mrp(soup, values["selling_price_inr"])
        if explicit_mrp is not None:
            amount, locator = explicit_mrp
            assign(
                "mrp_inr",
                amount,
                source_type="html_dom",
                locator=f"explicit MRP paired with verified INR selling price: {locator}",
                confidence=0.96,
                note="The MRP label and amount were read from the product page.",
            )
            if "html_dom" not in methods:
                methods.append("html_dom")
        else:
            preferred_price = (
                _flipkart_description_list_price(
                    product,
                    fetch.final_url,
                    values["selling_price_inr"],
                )
                if product
                else None
            )
            dom_list_price = _dom_list_price(
                soup,
                values["selling_price_inr"],
                preferred_price,
            )
            if dom_list_price is not None:
                amount, locator, confidence, disambiguated_by_product = dom_list_price
                assign(
                    "mrp_inr",
                    amount,
                    source_type="html_dom",
                    locator=f"struck/list price paired with verified INR selling price: {locator}",
                    confidence=confidence,
                    note=(
                        "The struck-through price matched the selected product's SKU-verified "
                        "structured description."
                        if disambiguated_by_product
                        else "The page did not label this value as MRP; it was selected from the "
                        "unique struck/list-price value paired with the verified INR selling price."
                    ),
                )
                if "html_dom" not in methods:
                    methods.append("html_dom")

    if product:
        breadcrumb_nodes = [node for node in nodes if _has_type(node, "BreadcrumbList")]
        breadcrumb_names: list[str] = []
        for breadcrumb in breadcrumb_nodes:
            elements = breadcrumb.get("itemListElement", [])
            if not isinstance(elements, list):
                continue
            for element in elements:
                if isinstance(element, dict):
                    name = _clean_text(element.get("name"))
                    if not name and isinstance(element.get("item"), dict):
                        name = _clean_text(element["item"].get("name"))
                    if name and name not in breadcrumb_names:
                        breadcrumb_names.append(name)
        if breadcrumb_names:
            hostname_labels = {
                label.casefold()
                for label in (urlsplit(fetch.final_url).hostname or "").split(".")
                if label.casefold() not in {"www", "store", "shop", "com", "in", "co", "org", "net"}
            }
            category_names = [
                name
                for name in breadcrumb_names
                if name.casefold() not in {"home", "homepage"}
                and name.casefold() not in hostname_labels
                and name != values.get("product_title")
            ]
            if category_names and values.get("category") is None:
                assign(
                    "category",
                    category_names[0],
                    source_type="json_ld",
                    locator="BreadcrumbList.itemListElement[0].name",
                    confidence=0.8,
                )
            if len(category_names) > 1 and values.get("subcategory") is None:
                assign(
                    "subcategory",
                    category_names[-1],
                    source_type="json_ld",
                    locator="BreadcrumbList.itemListElement[-2].name",
                    confidence=0.78,
                )

    duroflex_result = extract_duroflex_fields(soup, fetch.final_url, product)
    if duroflex_result:
        warnings.extend(duroflex_result.warnings)
        if duroflex_result.fields:
            adapter_name = "duroflexworld.com"
            for field, extracted in duroflex_result.fields.items():
                current_provenance = provenance.get(field, [])
                higher_confidence_mrp = (
                    field == "mrp_inr"
                    and current_provenance
                    and extracted.confidence > current_provenance[0].confidence
                )
                if values.get(field) is None or values.get(field) == [] or higher_confidence_mrp:
                    assign(
                        field,
                        extracted.value,
                        source_type="site_adapter",
                        locator=extracted.source_locator,
                        confidence=extracted.confidence,
                        note=extracted.note,
                    )
            if "duroflex_shopify" not in methods:
                methods.append("duroflex_shopify")

    ambrane_result = extract_ambrane_fields(
        soup,
        fetch.final_url,
        values.get("selling_price_inr"),
    )
    if ambrane_result:
        warnings.extend(ambrane_result.warnings)
        if ambrane_result.fields:
            adapter_name = "ambraneindia.com"
            for field, extracted in ambrane_result.fields.items():
                current_provenance = provenance.get(field, [])
                prefer_adapter_value = (
                    current_provenance
                    and extracted.confidence > current_provenance[0].confidence
                )
                if values.get(field) is None or values.get(field) == [] or prefer_adapter_value:
                    if values.get(field) is not None and values[field] != extracted.value:
                        warnings.append(
                            f"Ambrane product state and page data conflicted for {field}; the uniquely matched variant value was preferred."
                        )
                    assign(
                        field,
                        extracted.value,
                        source_type="site_adapter",
                        locator=extracted.source_locator,
                        confidence=extracted.confidence,
                        note=extracted.note,
                    )
            if "ambrane_shopify" not in methods:
                methods.append("ambrane_shopify")

    if values.get("mrp_inr") is not None and values.get("selling_price_inr") is not None:
        mrp = values["mrp_inr"]
        selling = values["selling_price_inr"]
        if "discount_percent" not in values:
            if mrp > 0 and selling <= mrp:
                discount = round((mrp - selling) / mrp * 100, 2)
                assign(
                    "discount_percent",
                    discount,
                    source_type="derived",
                    locator="(MRP - selling price) / MRP * 100",
                    confidence=min(
                        provenance["mrp_inr"][0].confidence,
                        provenance["selling_price_inr"][0].confidence,
                    ),
                    note="Calculated from independently sourced INR prices.",
                )
            else:
                warnings.append(
                    "MRP and selling price are inconsistent; discount was not calculated."
                )

    if not nodes:
        warnings.append("No JSON-LD structured data was found.")
    if values.get("selling_price_inr") is None:
        warnings.append("No verifiable INR selling price was found.")
    if values.get("mrp_inr") is None:
        warnings.append(
            "No verifiable INR MRP/list price was found; unlabelled struck-through prices "
            "were not uniquely paired with the selling price."
        )

    title = values.get("product_title")
    meaningful_fields = sum(
        values.get(field) is not None
        for field in (
            "product_images",
            "brand",
            "selling_price_inr",
            "mrp_inr",
            "rating",
            "review_count",
        )
    )
    if title and meaningful_fields >= 2:
        status = "success"
    elif values:
        status = "partial"
    else:
        status = "failed"
    if adapter_name == "ajio.com" and status == "success":
        required_ajio_fields = (
            "product_title",
            "product_images",
            "brand",
            "mrp_inr",
            "selling_price_inr",
        )
        missing_ajio_fields = [
            field for field in required_ajio_fields if not values.get(field)
        ]
        if missing_ajio_fields:
            status = "partial"
            warnings.append(
                "AJIO extraction is partial; selected product data is missing: "
                + ", ".join(missing_ajio_fields)
                + "."
            )
    if adapter_name == "ambraneindia.com" and status == "success":
        required_ambrane_fields = (
            "product_title",
            "product_images",
            "brand",
            "mrp_inr",
            "selling_price_inr",
        )
        missing_ambrane_fields = [
            field
            for field in required_ambrane_fields
            if values.get(field) is None or values.get(field) == []
        ]
        if missing_ambrane_fields:
            status = "partial"
            warnings.append(
                "Ambrane extraction is partial; selected product data is missing: "
                + ", ".join(missing_ambrane_fields)
                + "."
            )

    metadata = {
        "submitted_url": fetch.submitted_url,
        "domain": urlsplit(fetch.final_url).hostname,
        "page_type": "product" if product or values else "unknown",
        "currency": "INR"
        if values.get("selling_price_inr") is not None or values.get("mrp_inr") is not None
        else None,
        "rating_scale": None,
        "selected_variant": None,
        "field_confidence": {
            field: records[0].confidence for field, records in provenance.items()
        },
        "field_provenance": {
            field: [record.model_dump(mode="json") for record in records]
            for field, records in provenance.items()
        },
        "adapter_name": adapter_name,
        "adapter_version": "1.0" if adapter_name else None,
        "fetch_method": fetch.fetch_method,
        "source_snapshot_path": fetch.source_snapshot_path,
    }
    return CanonicalProduct(
        product_url=fetch.final_url,
        **values,
        extraction_status=status,
        http_status=fetch.http_status,
        load_result="loaded" if fetch.http_status < 400 else "http_error",
        extraction_method=methods,
        last_checked=now,
        notes=warnings,
        metadata=metadata,
        field_provenance=provenance,
    )


def extract_product(url: str, *, archive_source: bool = True) -> CanonicalProduct:
    try:
        try:
            hostname = (urlsplit(url).hostname or "").casefold()
        except ValueError:
            hostname = ""
        render_with_browser = any(
            hostname == domain or hostname.endswith(f".{domain}")
            for domain in ("ajio.com", "ambraneindia.com", "duroflexworld.com")
        )
        if render_with_browser:
            fetch = fetch_page_playwright(url)
        else:
            try:
                fetch = fetch_page(url)
            except PageFetchError as exc:
                if exc.http_status not in {401, 403, 407, 429, 503}:
                    raise
                fetch = fetch_page_playwright(url)
            else:
                if _detect_block_page(fetch, BeautifulSoup(fetch.html, "html.parser")):
                    fetch = fetch_page_playwright(url)
        initial_result = _parse_loaded_page(fetch)
        parsed_fetch = fetch
        if (
            not render_with_browser
            and fetch.fetch_method == "http"
            and (
                initial_result.selling_price_inr is None
                or initial_result.mrp_inr is None
            )
        ):
            fetch = fetch_page_playwright(url)
        if archive_source:
            fetch = archive_page_source(fetch)
    except UnsafeUrlError as exc:
        return _empty_result(
            url,
            status="failed",
            load_result="unsafe_url",
            note=f"URL rejected by safety validation: {exc}",
        )
    except PageFetchError as exc:
        now = datetime.now(timezone.utc)
        return CanonicalProduct(
            product_url=url,
            extraction_status="blocked" if exc.load_result == "blocked" else "failed",
            http_status=exc.http_status,
            load_result=exc.load_result,
            last_checked=now,
            notes=[str(exc)],
            field_provenance=_url_provenance(url, url, now),
        )
    except OSError as exc:
        now = datetime.now(timezone.utc)
        return CanonicalProduct(
            product_url=url,
            extraction_status="failed",
            load_result="source_snapshot_failed",
            last_checked=now,
            notes=[
                f"The page was loaded, but its source could not be saved locally; extraction was not run ({exc.__class__.__name__})."
            ],
            field_provenance=_url_provenance(url, url, now),
        )
    # Reuse the first parse when no browser re-render replaced the fetch result.
    return initial_result if fetch is parsed_fetch else _parse_loaded_page(fetch)
