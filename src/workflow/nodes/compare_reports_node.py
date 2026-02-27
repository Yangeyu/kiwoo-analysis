from __future__ import annotations

from analyzers.comparison.report_comparison_analyzer import ReportComparisonAnalyzer
from models.analysis_report import AnalysisReport
from reporting.renderer.consistency_checker import ConsistencyChecker


class CompareReportsNode:
    def __init__(
        self,
        analyzer: ReportComparisonAnalyzer,
        consistency_checker: ConsistencyChecker,
    ) -> None:
        self._analyzer = analyzer
        self._consistency_checker = consistency_checker

    def run(self, base: AnalysisReport, target: AnalysisReport) -> dict:
        comparison = self._analyzer.compare(base, target)
        consistency_issues = self._consistency_checker.check(target)
        if consistency_issues:
            comparison["impactSummary"] = (
                comparison["impactSummary"] + "; consistency issues: " + ", ".join(consistency_issues)
            )
        return comparison
