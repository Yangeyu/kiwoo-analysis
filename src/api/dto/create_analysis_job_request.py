from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from models.board_snapshot import BoardSnapshot


class CreateAnalysisJobRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    board_snapshot: BoardSnapshot = Field(alias="boardSnapshot")
    dimensions: list[str]
    language: str | None = None
    context_hints: dict[str, str] | None = Field(default=None, alias="contextHints")
