from __future__ import annotations

from typing import Any, TypedDict, cast

from langgraph.graph import END, START, StateGraph

from analyzers.dimension_registry import DimensionRegistry
from analyzers.topology.topology_analyzer import TopologyAnalyzer
from config.settings import Settings
from reporting.renderer.markdown_renderer import LanguageResolver
from workflow.nodes.collect_evidence_node import CollectEvidenceNode
from workflow.nodes.generate_report_node import GenerateReportNode
from workflow.nodes.parse_snapshot_node import ParseSnapshotNode
from workflow.nodes.run_dimensions_node import RunDimensionsNode
from workflow.state.analysis_state import AnalysisState


class WorkflowGraphState(TypedDict):
    state: AnalysisState


class AnalysisWorkflowBuilder:
    """LangGraph-based orchestration for analysis workflow."""

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
        self._graph = self._build_graph()

    def _build_graph(self) -> Any:
        graph = StateGraph(WorkflowGraphState)
        graph.add_node("parse_snapshot", self._parse_snapshot)
        graph.add_node("run_dimensions", self._run_dimensions)
        graph.add_node("resolve_language", self._resolve_language)
        graph.add_node("collect_evidence", self._collect_evidence)
        graph.add_node("generate_report", self._generate_report)

        graph.add_edge(START, "parse_snapshot")
        graph.add_edge("parse_snapshot", "run_dimensions")
        graph.add_edge("run_dimensions", "resolve_language")
        graph.add_edge("resolve_language", "collect_evidence")
        graph.add_edge("collect_evidence", "generate_report")
        graph.add_edge("generate_report", END)
        return graph.compile()

    def _parse_snapshot(self, graph_state: WorkflowGraphState) -> WorkflowGraphState:
        state = self._parse_snapshot_node.run(graph_state["state"])
        return {"state": state}

    def _run_dimensions(self, graph_state: WorkflowGraphState) -> WorkflowGraphState:
        state = graph_state["state"]
        self._dimension_registry.register("topology", self._topology_analyzer.analyze)
        state = self._run_dimensions_node.run(state)
        if "topology" not in state.analysis_outputs:
            state.analysis_outputs["topology"] = {"findings": ["Topology dimension not selected"]}
        return {"state": state}

    def _resolve_language(self, graph_state: WorkflowGraphState) -> WorkflowGraphState:
        state = graph_state["state"]
        if state.board_snapshot is None:
            raise ValueError("board_snapshot is required before language resolution")

        resolved_language, language_source = self._language_resolver.resolve(
            request_language=state.requested_language,
            context_hints=state.context_hints,
            snapshot=state.board_snapshot,
            default_language=self._settings.default_language,
        )
        state.resolved_language = resolved_language
        state.language_source = language_source
        return {"state": state}

    def _collect_evidence(self, graph_state: WorkflowGraphState) -> WorkflowGraphState:
        state = self._collect_evidence_node.run(graph_state["state"])
        return {"state": state}

    def _generate_report(self, graph_state: WorkflowGraphState) -> WorkflowGraphState:
        state = self._generate_report_node.run(graph_state["state"])
        return {"state": state}

    def run(self, state: AnalysisState) -> AnalysisState:
        result = cast(WorkflowGraphState, self._graph.invoke({"state": state}))
        return result["state"]
