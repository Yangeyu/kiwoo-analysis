from __future__ import annotations

from models.analysis_report import AnalysisReport

EXPECTED_SECTION_ORDER = [
    "overview",
    "dimension_analysis",
    "key_findings",
    "risks_recommendations",
]


class ConsistencyChecker:
    def check(self, report: AnalysisReport) -> list[str]:
        issues: list[str] = []
        section_order = [section.key for section in report.sections]
        if section_order != EXPECTED_SECTION_ORDER:
            issues.append("section order mismatch")
        if len(set(section_order)) != len(section_order):
            issues.append("duplicate section keys")
        return issues
