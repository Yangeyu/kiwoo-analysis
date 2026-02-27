from __future__ import annotations

from analyzers.dimension_registry import DimensionRegistry
from analyzers.topology.topology_analyzer import TopologyAnalyzer
from config.settings import Settings
from reporting.renderer.markdown_renderer import LanguageResolver
from workflow.nodes.collect_evidence_node import CollectEvidenceNode
from workflow.nodes.generate_report_node import GenerateReportNode
from workflow.nodes.parse_snapshot_node import ParseSnapshotNode
from workflow.nodes.run_dimensions_node import RunDimensionsNode
from workflow.state.analysis_state import AnalysisState


class AnalysisWorkflowBuilder:
    """LangGraph-compatible orchestration surface.

    The current implementation keeps the node boundaries explicit so it can be
    upgraded to a real LangGraph state graph without changing business logic.
    """

    def __init__(
        self,
        *,
        settings: Settings,
        parse_snapshot_node: ParseSnapshotNode,
        topology_analyzer: TopologyAnalyzer,
        run_dimensions_node: RunDimensionsNode,
        collect_evidence_node: CollectEvidenceNode,
        generate_report_node: GenerateReportNode,
        language_resolver: LanguageResolver,
        dimension_registry: DimensionRegistry,
    ) -> None:
        self._settings = settings
        self._parse_snapshot_node = parse_snapshot_node
        self._topology_analyzer = topology_analyzer
        self._run_dimensions_node = run_dimensions_node
        self._collect_evidence_node = collect_evidence_node
        self._generate_report_node = generate_report_node
        self._language_resolver = language_resolver
        self._dimension_registry = dimension_registry

    def run(self, state: AnalysisState) -> AnalysisState:
        state = self._parse_snapshot_node.run(state)
        assert state.board_snapshot is not None
        snapshot = state.board_snapshot

        self._dimension_registry.register("topology", self._topology_analyzer.analyze)
        state = self._run_dimensions_node.run(state)
        if "topology" not in state.analysis_outputs:
            state.analysis_outputs["topology"] = {"findings": ["Topology dimension not selected"]}

        resolved_language, language_source = self._language_resolver.resolve(
            request_language=state.requested_language,
            context_hints=state.context_hints,
            snapshot=snapshot,
            default_language=self._settings.default_language,
        )
        state.resolved_language = resolved_language
        state.language_source = language_source

        state = self._collect_evidence_node.run(state)
        state = self._generate_report_node.run(state)
        return state
