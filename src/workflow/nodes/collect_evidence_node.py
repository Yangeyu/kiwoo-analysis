from __future__ import annotations

from models.analysis_report import EvidenceReference, EvidenceSourceType
from workflow.state.analysis_state import AnalysisState


class CollectEvidenceNode:
    def run(self, state: AnalysisState) -> AnalysisState:
        evidence: list[EvidenceReference] = []
        topology = state.analysis_outputs.get("topology", {})
        for index, finding in enumerate(topology.get("findings", []), start=1):
            evidence.append(
                EvidenceReference(
                    evidenceId=f"ev-topology-{index}",
                    sourceType=EvidenceSourceType.DERIVED_METRIC,
                    sourceId="topology",
                    excerpt=finding,
                    confidence=0.8,
                )
            )
        state.evidence_index = evidence
        return state
