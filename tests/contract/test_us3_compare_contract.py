from __future__ import annotations

from fastapi.testclient import TestClient

from api.routes.analysis_jobs import build_app


def _job_payload(title: str) -> dict:
    return {
        "dimensions": ["topology", "content-quality"],
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
                    "content": title,
                }
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "updatedAt": "2026-02-27T10:00:00Z",
        },
    }


def test_us3_compare_contract() -> None:
    client = TestClient(build_app())

    j1 = client.post("/analysis-jobs", json=_job_payload("baseline")).json()["jobId"]
    j2 = client.post("/analysis-jobs", json=_job_payload("baseline changed")).json()["jobId"]

    r1 = client.get(f"/analysis-jobs/{j1}/report").json()["reportId"]
    r2 = client.get(f"/analysis-jobs/{j2}/report").json()["reportId"]

    comparison = client.post(
        "/analysis-compare",
        json={"baseReportId": r1, "targetReportId": r2},
    )
    assert comparison.status_code == 200
    body = comparison.json()
    assert {"comparisonId", "impactSummary"} <= set(body)
