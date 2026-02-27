from __future__ import annotations

from models.analysis_report import AnalysisReport, ReportSection
from reporting.renderer.markdown_renderer import MarkdownRenderer
from reporting.renderer.quality_guard import ReportQualityGuard
from reporting.renderer.section_composer import SectionComposer
from workflow.state.analysis_state import AnalysisState


class GenerateReportNode:
    def __init__(
        self,
        renderer: MarkdownRenderer,
        quality_guard: ReportQualityGuard,
        section_composer: SectionComposer,
    ) -> None:
        self._renderer = renderer
        self._quality_guard = quality_guard
        self._section_composer = section_composer

    def run(self, state: AnalysisState) -> AnalysisState:
        if not state.board_snapshot:
            raise ValueError("board_snapshot is required before report generation")
        if not state.resolved_language or not state.language_source:
            raise ValueError("language must be resolved before report generation")

        findings = self._section_composer.compose_dimension_lines(state.analysis_outputs)
        recommendations = [
            "Review isolated nodes and improve linkage.",
            "Validate low confidence findings with domain experts.",
        ]
        low_confidence_notes = self._quality_guard.build_low_confidence_notes(state.evidence_index)
        recommendations.extend(low_confidence_notes)

        markdown = self._renderer.render(
            board_title=state.board_snapshot.title,
            language=state.resolved_language,
            dimension_lines=findings,
            key_findings=findings,
            recommendations=recommendations,
        )

        sections = [
            ReportSection(key="overview", title="Overview", content="Board overview"),
            ReportSection(
                key="dimension_analysis",
                title="Dimension Analysis",
                content="\n".join(findings),
            ),
            ReportSection(key="key_findings", title="Key Findings", content="\n".join(findings)),
            ReportSection(
                key="risks_recommendations",
                title="Risks and Recommendations",
                content="\n".join(recommendations),
            ),
        ]
        self._quality_guard.ensure_required_sections([section.key for section in sections])

        state.report = AnalysisReport(
            board_id=state.board_snapshot.boardId,
            language=state.resolved_language,
            language_source=state.language_source,
            sections=sections,
            summary=findings[0],
            markdown=markdown,
            evidence_index=state.evidence_index,
        )
        return state
