from __future__ import annotations

from fastapi.testclient import TestClient

from api.routes.analysis_jobs import build_app


def test_us2_dimensions_contract() -> None:
    client = TestClient(build_app())
    response = client.post(
        "/analysis-jobs",
        json={
            "dimensions": ["topology", "content-quality", "theme-cluster"],
            "language": "en-US",
            "contextHints": {"userLocale": "zh-CN"},
            "boardSnapshot": {
                "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
                "title": "US2 Contract",
                "creatorId": "u_1",
                "nodes": [
                    {
                        "id": "n1",
                        "type": "note",
                        "pos": {"x": 0, "y": 0},
                        "size": {"x": 100, "y": 80},
                        "content": "architecture plan",
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
                "updatedAt": "2026-02-27T10:00:00Z",
            },
        },
    )
    assert response.status_code == 202
    job_id = response.json()["jobId"]

    report_resp = client.get(f"/analysis-jobs/{job_id}/report")
    assert report_resp.status_code == 200
    body = report_resp.json()
    assert body["language"] == "en-US"
    assert body["languageSource"] == "request"
