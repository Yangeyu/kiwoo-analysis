from __future__ import annotations

from analyzers.topology.topology_analyzer import TopologyAnalyzer
from models.board_snapshot import BoardSnapshot


def test_topology_analyzer_returns_expected_metrics() -> None:
    snapshot = BoardSnapshot.model_validate(
        {
            "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
            "title": "Topology Demo",
            "creatorId": "u_1",
            "nodes": [
                {
                    "id": "n1",
                    "type": "note",
                    "pos": {"x": 0, "y": 0},
                    "size": {"x": 100, "y": 80},
                },
                {
                    "id": "n2",
                    "type": "note",
                    "pos": {"x": 10, "y": 10},
                    "size": {"x": 100, "y": 80},
                },
                {
                    "id": "n3",
                    "type": "note",
                    "pos": {"x": 20, "y": 20},
                    "size": {"x": 100, "y": 80},
                },
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "n1", "targetNodeId": "n2"},
                {"id": "e2", "sourceNodeId": "n2", "targetNodeId": "n1"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "updatedAt": "2026-02-27T10:00:00Z",
        }
    )

    result = TopologyAnalyzer().analyze(snapshot)

    assert result["metrics"]["node_count"] == 3
    assert result["metrics"]["edge_count"] == 2
    assert "n3" in result["isolated_nodes"]
