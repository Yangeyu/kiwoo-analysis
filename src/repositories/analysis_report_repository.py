from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from models.analysis_report import AnalysisReport


class AnalysisReportRepository:
    def __init__(self) -> None:
        self._reports: dict[UUID, AnalysisReport] = {}
        self._board_index: dict[UUID, list[UUID]] = defaultdict(list)

    def save(self, report: AnalysisReport) -> None:
        self._reports[report.report_id] = report
        self._board_index[report.board_id].append(report.report_id)

    def get(self, report_id: UUID) -> AnalysisReport | None:
        return self._reports.get(report_id)
