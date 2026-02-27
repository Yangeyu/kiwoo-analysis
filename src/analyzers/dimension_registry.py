from __future__ import annotations

from collections.abc import Callable

from models.board_snapshot import BoardSnapshot

AnalyzerCallable = Callable[[BoardSnapshot], dict]


class DimensionRegistry:
    def __init__(self) -> None:
        self._registry: dict[str, AnalyzerCallable] = {}

    def register(self, dimension_id: str, analyzer: AnalyzerCallable) -> None:
        self._registry[dimension_id] = analyzer

    def get(self, dimension_id: str) -> AnalyzerCallable | None:
        return self._registry.get(dimension_id)

    def run(self, dimension_id: str, snapshot: BoardSnapshot) -> dict | None:
        analyzer = self.get(dimension_id)
        if analyzer is None:
            return None
        return analyzer(snapshot)
