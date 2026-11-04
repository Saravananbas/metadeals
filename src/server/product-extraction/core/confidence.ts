import type { ConfidenceLevel, ExtractionSource, FieldProvenance } from "./types";

export function createField<T>(
  value: T | null,
  source: ExtractionSource,
  confidence: ConfidenceLevel,
  note?: string,
  observedAt?: string
): FieldProvenance<T> {
  return {
    value,
    source,
    confidence: value === null || value === undefined ? "MISSING" : confidence,
    note,
    observedAt,
  };
}

export function missingField<T>(note?: string): FieldProvenance<T> {
  return {
    value: null,
    source: "manual_fallback",
    confidence: "MISSING",
    note,
  };
}

export function restrictedField<T>(note?: string): FieldProvenance<T> {
  return {
    value: null,
    source: "unauthorized_restricted",
    confidence: "RESTRICTED",
    note,
  };
}
