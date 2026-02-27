from __future__ import annotations

from models.analysis_report import EvidenceReference

REQUIRED_SECTION_KEYS = (
    "overview",
    "dimension_analysis",
    "key_findings",
    "risks_recommendations",
)


class ReportQualityGuard:
    def __init__(self, low_confidence_threshold: float = 0.6) -> None:
        self._threshold = low_confidence_threshold

    def ensure_required_sections(self, section_keys: list[str]) -> None:
        missing = [key for key in REQUIRED_SECTION_KEYS if key not in section_keys]
        if missing:
            raise ValueError(f"missing required sections: {', '.join(missing)}")

    def build_low_confidence_notes(self, evidence_index: list[EvidenceReference]) -> list[str]:
        notes = []
        for evidence in evidence_index:
            if evidence.confidence < self._threshold:
                notes.append(
                    f"Low confidence evidence {evidence.evidenceId}: "
                    f"{evidence.confidence:.2f}"
                )
        return notes
