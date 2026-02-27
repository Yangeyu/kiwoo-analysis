from __future__ import annotations

from enum import Enum
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class NodeType(str, Enum):
    NOTE = "note"
    AI_NOTE = "ai_note"
    SCRIBBLE = "scribble"
    SECTION = "section"
    LINK = "link"
    REPORT = "report"
    TABLE = "table"


class Point(BaseModel):
    x: float
    y: float


class Viewport(BaseModel):
    x: float
    y: float
    zoom: float

    @model_validator(mode="after")
    def validate_zoom(self) -> Viewport:
        if self.zoom <= 0:
            raise ValueError("viewport.zoom must be greater than 0")
        return self


class WhiteboardNode(BaseModel):
    id: str
    type: NodeType
    pos: Point
    size: Point
    content: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    referenced: list[str | dict[str, Any]] | None = None

    @model_validator(mode="after")
    def validate_by_type(self) -> WhiteboardNode:
        if self.type == NodeType.AI_NOTE and (not self.referenced or len(self.referenced) < 1):
            raise ValueError("ai_note node must include at least one referenced item")

        if self.type == NodeType.SCRIBBLE:
            points = (
                self.metadata.get("scribbleData", {}).get("points", [])
                if isinstance(self.metadata, dict)
                else []
            )
            if len(points) < 2:
                raise ValueError("scribble node requires at least two points")

        if self.type == NodeType.SECTION:
            color = self.metadata.get("sectionLabelColor")
            if color is not None and not _is_hex_color(str(color)):
                raise ValueError("sectionLabelColor must be a valid hex color")

        if self.type in {NodeType.LINK, NodeType.REPORT}:
            link_data = self.metadata.get("linkData", {})
            url = link_data.get("url")
            title = link_data.get("title")
            if not url or not _is_valid_url(str(url)):
                raise ValueError("link/report node requires valid metadata.linkData.url")
            if not title:
                raise ValueError("link/report node requires non-empty metadata.linkData.title")

        if self.type == NodeType.TABLE and self.content:
            if "|" not in self.content and "table" not in self.metadata:
                raise ValueError("table node must contain markdown table text or structured data")

        return self


class WhiteboardEdge(BaseModel):
    id: str
    sourceNodeId: str
    targetNodeId: str
    label: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_loop(self) -> WhiteboardEdge:
        if (
            self.sourceNodeId == self.targetNodeId
            and not self.metadata.get("allowSelfLoop", False)
        ):
            raise ValueError("self-loop edges are disallowed unless allowSelfLoop=true")
        return self


class BoardSnapshot(BaseModel):
    boardId: UUID
    title: str = "未命名白板"
    creatorId: str
    nodes: list[WhiteboardNode]
    edges: list[WhiteboardEdge]
    viewport: Viewport
    updatedAt: str

    @model_validator(mode="after")
    def validate_graph_references(self) -> BoardSnapshot:
        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("nodes[].id must be unique")

        known_nodes = set(node_ids)
        for edge in self.edges:
            if edge.sourceNodeId not in known_nodes or edge.targetNodeId not in known_nodes:
                raise ValueError("edge source/target must reference existing node ids")

        return self


def _is_valid_url(url: str) -> bool:
    parsed = urlparse(url)
    return bool(parsed.scheme and parsed.netloc)


def _is_hex_color(value: str) -> bool:
    if not value.startswith("#"):
        return False
    size = len(value)
    if size not in {4, 7}:
        return False
    return all(c in "0123456789abcdefABCDEF" for c in value[1:])
