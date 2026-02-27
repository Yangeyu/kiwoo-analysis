from __future__ import annotations

from models.board_snapshot import BoardSnapshot


class ContentQualityAnalyzer:
    def analyze(self, snapshot: BoardSnapshot) -> dict:
        text_nodes = [node for node in snapshot.nodes if node.content]
        total_chars = sum(len(node.content or "") for node in text_nodes)
        avg_chars = (total_chars / len(text_nodes)) if text_nodes else 0.0

        findings = [
            f"Text nodes: {len(text_nodes)}",
            f"Average node length: {avg_chars:.1f}",
        ]
        return {
            "metrics": {"text_nodes": len(text_nodes), "average_node_length": avg_chars},
            "findings": findings,
        }
