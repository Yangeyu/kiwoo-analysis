from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, FastAPI, HTTPException

from api.dependencies import service
from api.dto.create_analysis_job_request import CreateAnalysisJobRequest
from api.middleware.error_handler import install_error_handlers
from api.middleware.request_logging import RequestLoggingMiddleware

router = APIRouter()


@router.post("/analysis-jobs", status_code=202)
def create_analysis_job(request: CreateAnalysisJobRequest) -> dict:
    job = service.create_job(
        board_id=request.board_snapshot.boardId,
        dimensions=request.dimensions,
        board_snapshot_payload=request.board_snapshot.model_dump(mode="json"),
        requested_language=request.language,
        context_hints=request.context_hints,
    )
    service.run_job(job.job_id)
    return {"jobId": str(job.job_id), "status": "QUEUED"}


@router.get("/analysis-jobs/{job_id}")
def get_analysis_job_status(job_id: UUID) -> dict:
    job = service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "jobId": str(job.job_id),
        "status": job.status.value,
        "progress": job.progress,
        "message": job.message,
    }


@router.get("/analysis-jobs/{job_id}/report")
def get_analysis_report(job_id: UUID) -> dict:
    job = service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status.value != "SUCCEEDED":
        raise HTTPException(status_code=409, detail="Job not completed")

    report = service.get_report(job_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "reportId": str(report.report_id),
        "boardId": str(report.board_id),
        "language": report.language,
        "languageSource": report.language_source.value,
        "markdown": report.markdown,
        "sections": [section.key for section in report.sections],
        "evidenceIndex": [item.model_dump(mode="json") for item in report.evidence_index],
    }


def build_app() -> FastAPI:
    from api.routes.analysis_compare import router as compare_router

    app = FastAPI(title="Canvas Analysis Workflow API")
    app.add_middleware(RequestLoggingMiddleware)
    app.include_router(router)
    app.include_router(compare_router)
    install_error_handlers(app)
    return app
