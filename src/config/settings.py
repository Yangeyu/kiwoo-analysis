from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "canvas-analysis-workflow"
    default_language: str = "en-US"
    supported_languages: list[str] = ["en-US", "zh-CN"]
    low_confidence_threshold: float = 0.6

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    @field_validator("supported_languages", mode="before")
    @classmethod
    def parse_supported_languages(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
