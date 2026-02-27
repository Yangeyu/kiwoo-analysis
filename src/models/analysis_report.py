from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class LanguageSource(str, Enum):
    REQUEST = "request"
    USER_CONTEXT = "user_context"
    CONTENT_INFERENCE = "content_inference"
    DEFAULT = "default"


class EvidenceSourceType(str, Enum):
    NODE = "node"
    EDGE = "edge"
    REFERENCE_TEXT = "reference_text"
    DERIVED_METRIC = "derived_metric"


class EvidenceReference(BaseModel):
    evidenceId: str
    sourceType: EvidenceSourceType
    sourceId: str
    excerpt: str | None = None
    confidence: float


class ReportSection(BaseModel):
    key: str
    title: str
    content: str


class AnalysisReport(BaseModel):
    report_id: UUID = Field(default_factory=uuid4)
    board_id: UUID
    language: str
    language_source: LanguageSource
    sections: list[ReportSection]
    summary: str
    markdown: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    evidence_index: list[EvidenceReference]
