from __future__ import annotations

from analyzers.dimension_registry import DimensionRegistry
from models.board_snapshot import BoardSnapshot


def test_dimension_registry_registers_and_runs_analyzer() -> None:
    snapshot = BoardSnapshot.model_validate(
        {
            "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
            "title": "Dimension Demo",
            "creatorId": "u_1",
            "nodes": [
                {
                    "id": "n1",
                    "type": "note",
                    "pos": {"x": 0, "y": 0},
                    "size": {"x": 100, "y": 80},
                    "content": "topic one",
                }
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "updatedAt": "2026-02-27T10:00:00Z",
        }
    )
    registry = DimensionRegistry()
    registry.register("custom", lambda _: {"findings": ["ok"]})

    result = registry.run("custom", snapshot)

    assert result == {"findings": ["ok"]}
