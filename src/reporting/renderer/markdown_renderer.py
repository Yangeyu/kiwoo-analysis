from __future__ import annotations

from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from models.analysis_report import LanguageSource
from models.board_snapshot import BoardSnapshot


class LanguageResolver:
    def resolve(
        self,
        *,
        request_language: str | None,
        context_hints: dict[str, str] | None,
        snapshot: BoardSnapshot,
        default_language: str,
    ) -> tuple[str, LanguageSource]:
        if request_language:
            return request_language, LanguageSource.REQUEST

        if context_hints and context_hints.get("userLocale"):
            return context_hints["userLocale"], LanguageSource.USER_CONTEXT

        inferred = self._infer_from_content(snapshot)
        if inferred:
            return inferred, LanguageSource.CONTENT_INFERENCE

        return default_language, LanguageSource.DEFAULT

    def _infer_from_content(self, snapshot: BoardSnapshot) -> str | None:
        text = [snapshot.title]
        text.extend(node.content or "" for node in snapshot.nodes)
        merged = " ".join(text)
        if any("\u4e00" <= ch <= "\u9fff" for ch in merged):
            return "zh-CN"
        if merged.strip():
            return "en-US"
        return None


class MarkdownRenderer:
    def __init__(self) -> None:
        templates_dir = Path(__file__).resolve().parents[1] / "templates"
        self._env = Environment(
            loader=FileSystemLoader(str(templates_dir)),
            autoescape=False,
            undefined=StrictUndefined,
            trim_blocks=True,
            lstrip_blocks=True,
        )
        with (templates_dir / "terminology_map.yml").open("r", encoding="utf-8") as handle:
            self._terminology = yaml.safe_load(handle)

    def render(
        self,
        *,
        board_title: str,
        language: str,
        dimension_lines: list[str],
        key_findings: list[str],
        recommendations: list[str],
    ) -> str:
        terminology = self._terminology.get(language) or self._terminology["en-US"]
        template = self._env.get_template("report_template.md.j2")
        return template.render(
            board_title=board_title,
            language=language,
            terminology=terminology,
            dimension_lines=dimension_lines,
            key_findings=key_findings,
            recommendations=recommendations,
        ).strip() + "\n"
