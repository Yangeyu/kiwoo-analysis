from __future__ import annotations

from analyzers.content.content_quality_analyzer import ContentQualityAnalyzer
from analyzers.content.theme_cluster_analyzer import ThemeClusterAnalyzer
from analyzers.dimension_registry import DimensionRegistry
from analyzers.topology.topology_analyzer import TopologyAnalyzer
from config.settings import get_settings
from reporting.renderer.markdown_renderer import LanguageResolver, MarkdownRenderer
from reporting.renderer.quality_guard import ReportQualityGuard
from reporting.renderer.section_composer import SectionComposer
from repositories.analysis_job_repository import AnalysisJobRepository
from repositories.analysis_report_repository import AnalysisReportRepository
from services.analysis_workflow_service import AnalysisWorkflowService, default_compare_node
from workflow.graph.builder import AnalysisWorkflowBuilder
from workflow.nodes.collect_evidence_node import CollectEvidenceNode
from workflow.nodes.generate_report_node import GenerateReportNode
from workflow.nodes.parse_snapshot_node import ParseSnapshotNode
from workflow.nodes.run_dimensions_node import RunDimensionsNode


def create_service() -> AnalysisWorkflowService:
    settings = get_settings()
    quality_guard = ReportQualityGuard(low_confidence_threshold=settings.low_confidence_threshold)
    registry = DimensionRegistry()
    registry.register("content-quality", ContentQualityAnalyzer().analyze)
    registry.register("theme-cluster", ThemeClusterAnalyzer().analyze)

    workflow_builder = AnalysisWorkflowBuilder(
        settings=settings,
        parse_snapshot_node=ParseSnapshotNode(),
        topology_analyzer=TopologyAnalyzer(),
        run_dimensions_node=RunDimensionsNode(registry),
        collect_evidence_node=CollectEvidenceNode(),
        generate_report_node=GenerateReportNode(
            renderer=MarkdownRenderer(),
            quality_guard=quality_guard,
            section_composer=SectionComposer(),
        ),
        language_resolver=LanguageResolver(),
        dimension_registry=registry,
    )
    return AnalysisWorkflowService(
        AnalysisJobRepository(),
        AnalysisReportRepository(),
        workflow_builder,
        default_compare_node(),
    )


service = create_service()
