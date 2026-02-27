from __future__ import annotations

from models.board_snapshot import BoardSnapshot
from workflow.state.analysis_state import AnalysisState


class ParseSnapshotNode:
    def run(self, state: AnalysisState) -> AnalysisState:
        snapshot = BoardSnapshot.model_validate(state.board_snapshot_payload)
        state.board_snapshot = snapshot
        return state
