from __future__ import annotations

from collections import Counter

from models.board_snapshot import BoardSnapshot


class ThemeClusterAnalyzer:
    def analyze(self, snapshot: BoardSnapshot) -> dict:
        tokens: list[str] = []
        for node in snapshot.nodes:
            if not node.content:
                continue
            first = node.content.strip().split(" ")[0]
            if first:
                tokens.append(first.lower())

        cluster_counts = Counter(tokens)
        top_clusters = cluster_counts.most_common(3)
        findings = [f"Theme '{theme}' appears {count} times" for theme, count in top_clusters]

        return {
            "clusters": [{"theme": theme, "count": count} for theme, count in top_clusters],
            "findings": findings or ["No themes detected"],
        }
