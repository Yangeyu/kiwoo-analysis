from __future__ import annotations

from fastapi.testclient import TestClient

from api.routes.analysis_jobs import build_app


def _job_payload(title: str, content: str) -> dict:
    return {
        "dimensions": ["topology", "content-quality", "theme-cluster"],
        "contextHints": {"userLocale": "en-US"},
        "boardSnapshot": {
            "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
            "title": title,
            "creatorId": "u_1",
            "nodes": [
                {
                    "id": "n1",
                    "type": "note",
                    "pos": {"x": 0, "y": 0},
                    "size": {"x": 100, "y": 80},
                    "content": content,
                }
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "updatedAt": "2026-02-27T10:00:00Z",
        },
    }


def test_us3_report_comparison_integration() -> None:
    client = TestClient(build_app())

    first_job = client.post("/analysis-jobs", json=_job_payload("R1", "alpha plan")).json()["jobId"]
    second_job = client.post("/analysis-jobs", json=_job_payload("R2", "beta plan")).json()["jobId"]

    first_report = client.get(f"/analysis-jobs/{first_job}/report").json()["reportId"]
    second_report = client.get(f"/analysis-jobs/{second_job}/report").json()["reportId"]

    compare = client.post(
        "/analysis-compare",
        json={"baseReportId": first_report, "targetReportId": second_report},
    )

    assert compare.status_code == 200
    payload = compare.json()
    assert "addedFindings" in payload
    assert "removedFindings" in payload
    assert "changedFindings" in payload
    assert "impactSummary" in payload
