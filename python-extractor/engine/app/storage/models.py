from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def new_id() -> str:
    return str(uuid4())


class ExtractionJob(Base):
    __tablename__ = "extraction_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    batch_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("bulk_batches.id"), nullable=True, index=True
    )
    submitted_url: Mapped[str] = mapped_column(Text, nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="queued")
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    load_result: Mapped[str | None] = mapped_column(String(80), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(String(80))

    history: Mapped[list[ExtractionHistory]] = relationship(back_populates="job")
    provenance: Mapped[list[FieldProvenanceRecord]] = relationship(back_populates="job")

    __table_args__ = (
        Index("ix_extraction_jobs_status_created", "status", "started_at"),
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    canonical_url: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    product_title: Mapped[str | None] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(String(500))
    selling_price_inr: Mapped[float | None] = mapped_column(Float)
    mrp_inr: Mapped[float | None] = mapped_column(Float)
    schema_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")
    last_checked: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    history: Mapped[list[ExtractionHistory]] = relationship(back_populates="product")


class ExtractionHistory(Base):
    __tablename__ = "extraction_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False, index=True
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("extraction_jobs.id"), nullable=False, index=True
    )
    canonical_payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    product: Mapped[Product] = relationship(back_populates="history")
    job: Mapped[ExtractionJob] = relationship(back_populates="history")


class FieldProvenanceRecord(Base):
    __tablename__ = "field_provenance"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("extraction_jobs.id"), nullable=False, index=True
    )
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    value_json: Mapped[Any] = mapped_column(JSON, nullable=True)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False)
    source_locator: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    job: Mapped[ExtractionJob] = relationship(back_populates="provenance")


class WebsiteRegistry(Base):
    __tablename__ = "website_registry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    platform: Mapped[str | None] = mapped_column(String(100))
    adapter_name: Mapped[str | None] = mapped_column(String(100))
    adapter_version: Mapped[str | None] = mapped_column(String(50))
    enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    rate_limit_config_json: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BulkBatch(Base):
    __tablename__ = "bulk_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_filename: Mapped[str | None] = mapped_column(String(500))
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accepted_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="created")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
