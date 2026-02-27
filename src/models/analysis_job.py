from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class AnalysisJobStatus(str, Enum):
    DRAFT = "DRAFT"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    RETRYING = "RETRYING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class AnalysisJob(BaseModel):
    job_id: UUID = Field(default_factory=uuid4)
    board_id: UUID
    status: AnalysisJobStatus = AnalysisJobStatus.DRAFT
    progress: int = 0
    message: str | None = None
    dimensions: list[str] = Field(default_factory=list)
    board_snapshot_payload: dict = Field(default_factory=dict)
    requested_language: str | None = None
    context_hints: dict[str, str] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
