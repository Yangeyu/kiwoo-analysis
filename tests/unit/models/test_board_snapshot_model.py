from __future__ import annotations

import pytest
from pydantic import ValidationError

from models.board_snapshot import BoardSnapshot


def _base_snapshot() -> dict:
    return {
        "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
        "title": "Demo Board",
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
    }


def test_board_snapshot_validates_successfully() -> None:
    model = BoardSnapshot.model_validate(_base_snapshot())
    assert len(model.nodes) == 2


def test_board_snapshot_rejects_duplicate_node_ids() -> None:
    payload = _base_snapshot()
    payload["nodes"][1]["id"] = "n1"

    with pytest.raises(ValidationError):
        BoardSnapshot.model_validate(payload)


def test_board_snapshot_rejects_unknown_edge_node_reference() -> None:
    payload = _base_snapshot()
    payload["edges"][0]["targetNodeId"] = "n3"

    with pytest.raises(ValidationError):
        BoardSnapshot.model_validate(payload)
