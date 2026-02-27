from __future__ import annotations

from analyzers.comparison.report_comparison_analyzer import ReportComparisonAnalyzer
from models.analysis_report import AnalysisReport, LanguageSource, ReportSection


def test_report_comparison_detects_added_and_removed_findings() -> None:
    base = AnalysisReport(
        board_id="8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
        language="en-US",
        language_source=LanguageSource.REQUEST,
        sections=[
            ReportSection(key="overview", title="Overview", content=""),
            ReportSection(key="dimension_analysis", title="Dimension Analysis", content="- A\n- B"),
            ReportSection(key="key_findings", title="Key Findings", content="- A\n- B"),
            ReportSection(
                key="risks_recommendations", title="Risks and Recommendations", content="none"
            ),
        ],
        summary="base",
        markdown="# base",
        evidence_index=[],
    )
    target = AnalysisReport(
        board_id="8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
        language="en-US",
        language_source=LanguageSource.REQUEST,
        sections=[
            ReportSection(key="overview", title="Overview", content=""),
            ReportSection(key="dimension_analysis", title="Dimension Analysis", content="- A\n- C"),
            ReportSection(key="key_findings", title="Key Findings", content="- A\n- C"),
            ReportSection(
                key="risks_recommendations", title="Risks and Recommendations", content="none"
            ),
        ],
        summary="target",
        markdown="# target",
        evidence_index=[],
    )

    result = ReportComparisonAnalyzer().compare(base, target)

    assert "C" in result["addedFindings"]
    assert "B" in result["removedFindings"]
