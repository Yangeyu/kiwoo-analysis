from __future__ import annotations

from fastapi.testclient import TestClient

from api.routes.analysis_jobs import build_app


def test_us2_multi_dimension_workflow() -> None:
    client = TestClient(build_app())
    response = client.post(
        "/analysis-jobs",
        json={
            "dimensions": ["topology", "content-quality", "theme-cluster"],
            "contextHints": {"userLocale": "en-US"},
            "boardSnapshot": {
                "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
                "title": "US2 Integration",
                "creatorId": "u_1",
                "nodes": [
                    {
                        "id": "n1",
                        "type": "note",
                        "pos": {"x": 0, "y": 0},
                        "size": {"x": 100, "y": 80},
                        "content": "planning roadmap",
                    },
                    {
                        "id": "n2",
                        "type": "note",
                        "pos": {"x": 50, "y": 20},
                        "size": {"x": 100, "y": 80},
                        "content": "planning review",
                    },
                ],
                "edges": [{"id": "e1", "sourceNodeId": "n1", "targetNodeId": "n2"}],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
                "updatedAt": "2026-02-27T10:00:00Z",
            },
        },
    )
    assert response.status_code == 202
    report_resp = client.get(f"/analysis-jobs/{response.json()['jobId']}/report")
    assert report_resp.status_code == 200
    markdown = report_resp.json()["markdown"]

    assert "[content-quality]" in markdown
    assert "[theme-cluster]" in markdown
