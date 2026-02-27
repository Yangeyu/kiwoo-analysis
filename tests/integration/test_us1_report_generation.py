from __future__ import annotations

from fastapi.testclient import TestClient

from api.routes.analysis_jobs import build_app


def test_us1_generates_context_aware_report_with_evidence() -> None:
    client = TestClient(build_app())
    response = client.post(
        "/analysis-jobs",
        json={
            "dimensions": ["topology"],
            "contextHints": {"userLocale": "en-US", "contentLocale": "zh-CN"},
            "boardSnapshot": {
                "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
                "title": "Integration Demo",
                "creatorId": "u_1",
                "nodes": [
                    {
                        "id": "n1",
                        "type": "note",
                        "pos": {"x": 0, "y": 0},
                        "size": {"x": 120, "y": 80},
                        "content": "需求分析",
                    },
                    {
                        "id": "n2",
                        "type": "note",
                        "pos": {"x": 200, "y": 40},
                        "size": {"x": 120, "y": 80},
                        "content": "architecture",
                    },
                ],
                "edges": [{"id": "e1", "sourceNodeId": "n1", "targetNodeId": "n2"}],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
                "updatedAt": "2026-02-27T10:00:00Z",
            },
        },
    )
    assert response.status_code == 202
    job_id = response.json()["jobId"]

    status = client.get(f"/analysis-jobs/{job_id}")
    assert status.status_code == 200
    assert status.json()["status"] == "SUCCEEDED"

    report = client.get(f"/analysis-jobs/{job_id}/report")
    assert report.status_code == 200
    body = report.json()
    assert body["language"] == "en-US"
    assert body["languageSource"] == "user_context"
    assert body["sections"] == [
        "overview",
        "dimension_analysis",
        "key_findings",
        "risks_recommendations",
    ]
    assert body["evidenceIndex"]
    assert "# Overview" in body["markdown"]
