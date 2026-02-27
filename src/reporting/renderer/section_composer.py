from __future__ import annotations


class SectionComposer:
    def compose_dimension_lines(self, analysis_outputs: dict[str, dict]) -> list[str]:
        lines: list[str] = []
        for dimension_id, payload in analysis_outputs.items():
            findings = payload.get("findings", [])
            if not findings:
                continue
            lines.append(f"[{dimension_id}]")
            lines.extend(f"{item}" for item in findings)
        return lines or ["No dimension findings available"]
