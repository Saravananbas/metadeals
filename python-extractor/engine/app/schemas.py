from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ExtractionStatus = Literal[
    "success",
    "partial",
    "failed",
    "blocked",
    "unsupported_page_type",
    "awaiting_manual_intervention",
]


class FieldProvenance(BaseModel):
    field: str
    value: Any
    source_type: str
    source_locator: str
    source_url: str
    observed_at: datetime
    confidence: float = Field(ge=0, le=1)
    notes: str | None = None


class ExtractionJobInput(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    force_refresh: bool = False
    manual_intervention: bool = False


class BulkBatchSummary(BaseModel):
    batch_id: str
    total_rows: int = Field(ge=0)
    accepted_jobs: int = Field(ge=0)
    rejected_rows: int = Field(ge=0)


class CanonicalProduct(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0.0"] = "1.0.0"
    product_url: str
    product_title: str | None = None
    product_images: list[str] = Field(default_factory=list)
    brand: str | None = None
    description: str | None = None
    category: str | None = None
    subcategory: str | None = None
    merchant: str | None = None
    selected_color: str | None = None
    selected_size: str | None = None
    mrp_inr: float | None = Field(default=None, ge=0)
    selling_price_inr: float | None = Field(default=None, ge=0)
    discount_percent: float | None = Field(default=None, ge=0, le=100)
    coupon_code: str | None = None
    rating: float | None = Field(default=None, ge=0)
    review_count: int | None = Field(default=None, ge=0)
    extraction_status: ExtractionStatus = "failed"
    http_status: int | None = None
    load_result: str = "not_started"
    extraction_method: list[str] = Field(default_factory=list)
    last_checked: datetime
    notes: list[str] = Field(default_factory=list)
    metadata: dict[str, object] = Field(default_factory=dict)
    field_provenance: dict[str, list[FieldProvenance]] = Field(default_factory=dict)


class ExtractionJobSummary(BaseModel):
    job_id: str
    status: str
    product: CanonicalProduct | None = None


class PageFetchError(Exception):
    def __init__(
        self,
        message: str,
        *,
        load_result: str,
        http_status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.load_result = load_result
        self.http_status = http_status


class UnsafeUrlError(ValueError):
    pass
