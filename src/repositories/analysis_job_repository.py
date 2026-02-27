from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from models.analysis_job import AnalysisJob, AnalysisJobStatus
from models.analysis_report import AnalysisReport


class AnalysisJobRepository:
    def __init__(self) -> None:
        self._jobs: dict[UUID, AnalysisJob] = {}
        self._reports_by_job: dict[UUID, AnalysisReport] = {}

    def create(self, job: AnalysisJob) -> AnalysisJob:
        self._jobs[job.job_id] = job
        return job

    def get(self, job_id: UUID) -> AnalysisJob | None:
        return self._jobs.get(job_id)

    def update_status(
        self,
        job_id: UUID,
        *,
        status: AnalysisJobStatus,
        progress: int,
        message: str | None = None,
    ) -> AnalysisJob | None:
        job = self._jobs.get(job_id)
        if not job:
            return None
        updated = job.model_copy(
            update={
                "status": status,
                "progress": progress,
                "message": message,
                "updated_at": datetime.now(tz=UTC),
            }
        )
        self._jobs[job_id] = updated
        return updated

    def save_report(self, job_id: UUID, report: AnalysisReport) -> None:
        self._reports_by_job[job_id] = report

    def get_report(self, job_id: UUID) -> AnalysisReport | None:
        return self._reports_by_job.get(job_id)
