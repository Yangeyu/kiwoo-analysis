from __future__ import annotations

from analyzers.dimension_registry import DimensionRegistry
from workflow.state.analysis_state import AnalysisState


class RunDimensionsNode:
    def __init__(self, registry: DimensionRegistry) -> None:
        self._registry = registry

    def run(self, state: AnalysisState) -> AnalysisState:
        if not state.board_snapshot:
            raise ValueError("board_snapshot is required before running dimensions")

        for dimension_id in state.dimensions:
            result = self._registry.run(dimension_id, state.board_snapshot)
            if result is not None:
                state.analysis_outputs[dimension_id] = result
        return state
