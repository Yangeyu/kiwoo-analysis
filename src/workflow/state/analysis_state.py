from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from models.analysis_report import AnalysisReport, EvidenceReference, LanguageSource
from models.board_snapshot import BoardSnapshot


@dataclass
class AnalysisState:
    job_id: UUID
    dimensions: list[str]
    board_snapshot_payload: dict
    context_hints: dict[str, str] = field(default_factory=dict)
    requested_language: str | None = None

    board_snapshot: BoardSnapshot | None = None
    analysis_outputs: dict[str, dict] = field(default_factory=dict)
    evidence_index: list[EvidenceReference] = field(default_factory=list)
    resolved_language: str | None = None
    language_source: LanguageSource | None = None
    report: AnalysisReport | None = None
