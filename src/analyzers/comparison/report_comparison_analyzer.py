from __future__ import annotations

from typing import TypedDict

from models.analysis_report import AnalysisReport


class ComparisonResult(TypedDict):
    addedFindings: list[str]
    removedFindings: list[str]
    changedFindings: list[str]
    impactSummary: str


class ReportComparisonAnalyzer:
    def compare(self, base: AnalysisReport, target: AnalysisReport) -> ComparisonResult:
        base_findings = set(_extract_findings(base))
        target_findings = set(_extract_findings(target))

        added = sorted(target_findings - base_findings)
        removed = sorted(base_findings - target_findings)
        changed = sorted(
            finding for finding in base_findings & target_findings if finding.strip() != finding
        )

        impact = "No significant changes"
        if added or removed or changed:
            impact = (
                f"Added: {len(added)}, Removed: {len(removed)}, Changed: {len(changed)}"
            )

        return {
            "addedFindings": added,
            "removedFindings": removed,
            "changedFindings": changed,
            "impactSummary": impact,
        }


def _extract_findings(report: AnalysisReport) -> list[str]:
    findings: list[str] = []
    for section in report.sections:
        if section.key in {"dimension_analysis", "key_findings"}:
            findings.extend(line.strip("- ") for line in section.content.splitlines() if line.strip())
    return findings
