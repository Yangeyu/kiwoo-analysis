from __future__ import annotations

from models.board_snapshot import BoardSnapshot


class TopologyAnalyzer:
    def analyze(self, snapshot: BoardSnapshot) -> dict:
        node_count = len(snapshot.nodes)
        edge_count = len(snapshot.edges)

        max_edges = node_count * (node_count - 1) if node_count > 1 else 1
        density = edge_count / max_edges

        target_nodes = {edge.targetNodeId for edge in snapshot.edges}
        source_nodes = {edge.sourceNodeId for edge in snapshot.edges}
        isolated = [
            node.id
            for node in snapshot.nodes
            if node.id not in target_nodes and node.id not in source_nodes
        ]

        findings = [
            f"Node count: {node_count}",
            f"Edge count: {edge_count}",
            f"Density: {density:.4f}",
        ]
        if isolated:
            findings.append(f"Isolated nodes: {', '.join(sorted(isolated))}")

        return {
            "metrics": {
                "node_count": node_count,
                "edge_count": edge_count,
                "density": density,
            },
            "findings": findings,
            "isolated_nodes": isolated,
        }
