from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    access_token: str
    llm_api_key: str
    llm_base_url: str
    llm_model: str
    database_path: Path
    max_image_bytes: int = 10 * 1024 * 1024
    request_timeout_seconds: float = 90.0
    llm_thinking: str = ""
    max_text_chars: int = 3000

    @classmethod
    def from_env(cls) -> "Settings":
        llm_thinking = os.getenv("FORTRANSLATE_LLM_THINKING", "").strip().lower()
        if llm_thinking not in {"", "enabled", "disabled"}:
            raise ValueError("FORTRANSLATE_LLM_THINKING must be enabled, disabled, or empty")
        return cls(
            access_token=os.getenv("FORTRANSLATE_ACCESS_TOKEN", ""),
            llm_api_key=os.getenv("FORTRANSLATE_LLM_API_KEY", ""),
            llm_base_url=os.getenv("FORTRANSLATE_LLM_BASE_URL", "https://api.openai.com/v1"),
            llm_model=os.getenv("FORTRANSLATE_LLM_MODEL", "gpt-4.1-mini"),
            database_path=Path(os.getenv("FORTRANSLATE_DATABASE_PATH", "./data/fortranslate.db")),
            max_image_bytes=int(os.getenv("FORTRANSLATE_MAX_IMAGE_BYTES", str(10 * 1024 * 1024))),
            request_timeout_seconds=float(os.getenv("FORTRANSLATE_REQUEST_TIMEOUT_SECONDS", "90")),
            llm_thinking=llm_thinking,
            max_text_chars=int(os.getenv("FORTRANSLATE_MAX_TEXT_CHARS", "3000")),
        )
