from __future__ import annotations

import time

from fastapi.testclient import TestClient

from api.routes.analysis_jobs import build_app


def test_standard_board_performance_budget() -> None:
    client = TestClient(build_app())
    payload = {
        "dimensions": ["topology", "content-quality", "theme-cluster"],
        "contextHints": {"userLocale": "en-US"},
        "boardSnapshot": {
            "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
            "title": "Perf board",
            "creatorId": "u_1",
            "nodes": [
                {
                    "id": f"n{i}",
                    "type": "note",
                    "pos": {"x": i * 5, "y": i * 3},
                    "size": {"x": 100, "y": 80},
                    "content": "performance sample",
                }
                for i in range(30)
            ],
            "edges": [
                {
                    "id": f"e{i}",
                    "sourceNodeId": f"n{i}",
                    "targetNodeId": f"n{i+1}",
                }
                for i in range(29)
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "updatedAt": "2026-02-27T10:00:00Z",
        },
    }

    started = time.perf_counter()
    response = client.post("/analysis-jobs", json=payload)
    elapsed = time.perf_counter() - started

    assert response.status_code == 202
    assert elapsed < 60
