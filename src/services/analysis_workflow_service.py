from __future__ import annotations

from uuid import UUID

from analyzers.comparison.report_comparison_analyzer import (
    ComparisonResult,
    ReportComparisonAnalyzer,
)
from models.analysis_job import AnalysisJob, AnalysisJobStatus
from models.analysis_report import AnalysisReport
from reporting.renderer.consistency_checker import ConsistencyChecker
from repositories.analysis_job_repository import AnalysisJobRepository
from repositories.analysis_report_repository import AnalysisReportRepository
from workflow.graph.builder import AnalysisWorkflowBuilder
from workflow.nodes.compare_reports_node import CompareReportsNode
from workflow.state.analysis_state import AnalysisState


class AnalysisWorkflowService:
    def __init__(
        self,
        repository: AnalysisJobRepository,
        report_repository: AnalysisReportRepository,
        workflow_builder: AnalysisWorkflowBuilder,
        compare_reports_node: CompareReportsNode,
    ) -> None:
        self._repository = repository
        self._report_repository = report_repository
        self._workflow_builder = workflow_builder
        self._compare_reports_node = compare_reports_node

    def create_job(
        self,
        *,
        board_id: UUID,
        dimensions: list[str],
        board_snapshot_payload: dict,
        requested_language: str | None,
        context_hints: dict[str, str] | None,
    ) -> AnalysisJob:
        job = AnalysisJob(
            board_id=board_id,
            status=AnalysisJobStatus.QUEUED,
            progress=0,
            dimensions=dimensions,
            board_snapshot_payload=board_snapshot_payload,
            requested_language=requested_language,
            context_hints=context_hints or {},
            message="Queued for analysis",
        )
        self._repository.create(job)
        return job

    def run_job(self, job_id: UUID) -> AnalysisReport:
        job = self._repository.get(job_id)
        if not job:
            raise KeyError(f"job {job_id} not found")

        snapshot_payload = job.board_snapshot_payload
        if not isinstance(snapshot_payload, dict):
            raise ValueError("job snapshot payload missing")

        self._repository.update_status(job_id, status=AnalysisJobStatus.RUNNING, progress=10)
        state = AnalysisState(
            job_id=job_id,
            dimensions=job.dimensions,
            board_snapshot_payload=snapshot_payload,
            context_hints=job.context_hints,
            requested_language=job.requested_language,
        )

        final_state = self._workflow_builder.run(state)
        if not final_state.report:
            raise ValueError("workflow did not produce report")

        self._repository.save_report(job_id, final_state.report)
        self._report_repository.save(final_state.report)
        self._repository.update_status(job_id, status=AnalysisJobStatus.SUCCEEDED, progress=100)
        return final_state.report

    def get_job(self, job_id: UUID) -> AnalysisJob | None:
        return self._repository.get(job_id)

    def get_report(self, job_id: UUID) -> AnalysisReport | None:
        return self._repository.get_report(job_id)

    def compare_reports(self, base_report_id: UUID, target_report_id: UUID) -> ComparisonResult:
        base = self._report_repository.get(base_report_id)
        target = self._report_repository.get(target_report_id)
        if not base or not target:
            raise KeyError("one or both reports not found")
        if base.board_id != target.board_id:
            raise ValueError("reports must belong to the same board")
        return self._compare_reports_node.run(base, target)


def default_compare_node() -> CompareReportsNode:
    return CompareReportsNode(
        analyzer=ReportComparisonAnalyzer(),
        consistency_checker=ConsistencyChecker(),
    )
