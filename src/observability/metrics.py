from __future__ import annotations


class MetricsCollector:
    def __init__(self) -> None:
        self._counters: dict[str, int] = {}

    def inc(self, key: str, amount: int = 1) -> None:
        self._counters[key] = self._counters.get(key, 0) + amount

    def get(self, key: str) -> int:
        return self._counters.get(key, 0)


metrics_collector = MetricsCollector()
