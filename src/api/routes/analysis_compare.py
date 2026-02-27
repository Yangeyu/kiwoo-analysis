from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.dependencies import service

router = APIRouter()


class CompareReportsRequest(BaseModel):
    baseReportId: UUID
    targetReportId: UUID


@router.post("/analysis-compare")
def compare_analysis_reports(request: CompareReportsRequest) -> dict:
    try:
        result = service.compare_reports(request.baseReportId, request.targetReportId)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "comparisonId": str(uuid4()),
        "addedFindings": result["addedFindings"],
        "removedFindings": result["removedFindings"],
        "changedFindings": result["changedFindings"],
        "impactSummary": result["impactSummary"],
    }
