from __future__ import annotations

from fastapi.testclient import TestClient

from api.routes.analysis_jobs import build_app


def _payload() -> dict:
    return {
        "dimensions": ["topology"],
        "contextHints": {"userLocale": "en-US", "contentLocale": "zh-CN"},
        "boardSnapshot": {
            "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
            "title": "Contract Demo",
            "creatorId": "u_1",
            "nodes": [
                {
                    "id": "n1",
                    "type": "note",
                    "pos": {"x": 0, "y": 0},
                    "size": {"x": 120, "y": 80},
                    "content": "hello",
                },
                {
                    "id": "n2",
                    "type": "note",
                    "pos": {"x": 200, "y": 40},
                    "size": {"x": 120, "y": 80},
                    "content": "world",
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "sourceNodeId": "n1",
                    "targetNodeId": "n2",
                }
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "updatedAt": "2026-02-27T10:00:00Z",
        },
    }


def test_analysis_jobs_contract_for_us1() -> None:
    client = TestClient(build_app())

    create_resp = client.post("/analysis-jobs", json=_payload())
    assert create_resp.status_code == 202
    accepted = create_resp.json()
    assert {"jobId", "status"} <= set(accepted)

    status_resp = client.get(f"/analysis-jobs/{accepted['jobId']}")
    assert status_resp.status_code == 200
    assert {"jobId", "status"} <= set(status_resp.json())

    report_resp = client.get(f"/analysis-jobs/{accepted['jobId']}/report")
    assert report_resp.status_code == 200
    body = report_resp.json()
    assert {"reportId", "boardId", "language", "languageSource", "markdown", "sections", "evidenceIndex"} <= set(body)
