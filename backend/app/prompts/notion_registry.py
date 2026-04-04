from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.prompts.notion_sync import validate_prompt_format_template


GENERATED_PROMPTS_PATH = Path(__file__).resolve().parent / "generated" / "notion_prompts.json"


@dataclass(frozen=True)
class ManagedPrompt:
    key: str
    feature: str
    kind: str
    content: str
    variables: tuple[str, ...]
    version: int


_PROMPT_CACHE: dict[str, ManagedPrompt] | None = None


def _coerce_prompt(key: str, payload: Any) -> ManagedPrompt:
    if not isinstance(payload, dict):
        raise ValueError(f"Managed prompt payload for '{key}' must be an object")

    content = str(payload.get("content") or "")
    feature = str(payload.get("feature") or "")
    kind = str(payload.get("kind") or "")
    version = int(payload.get("version") or 0)
    raw_variables = payload.get("variables") or []
    variables = tuple(str(item) for item in raw_variables if str(item).strip())
    validate_prompt_format_template(content, variables, key=key)

    return ManagedPrompt(
        key=key,
        feature=feature,
        kind=kind,
        content=content,
        variables=variables,
        version=version,
    )


def load_managed_prompts(*, force_reload: bool = False) -> dict[str, ManagedPrompt]:
    global _PROMPT_CACHE

    if _PROMPT_CACHE is not None and not force_reload:
        return _PROMPT_CACHE

    if not GENERATED_PROMPTS_PATH.exists():
        _PROMPT_CACHE = {}
        return _PROMPT_CACHE

    payload = json.loads(GENERATED_PROMPTS_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Managed prompt registry must be a JSON object")

    _PROMPT_CACHE = {
        key: _coerce_prompt(key, value)
        for key, value in payload.items()
    }
    return _PROMPT_CACHE


def reset_managed_prompt_cache() -> None:
    global _PROMPT_CACHE
    _PROMPT_CACHE = None


def get_managed_prompt(key: str) -> ManagedPrompt | None:
    return load_managed_prompts().get(key)


def require_managed_prompt(key: str) -> ManagedPrompt:
    prompt = get_managed_prompt(key)
    if prompt is None:
        raise KeyError(f"Managed prompt not found: {key}")
    return prompt


def get_managed_prompt_content(key: str, *, fallback: str) -> str:
    prompt = get_managed_prompt(key)
    if prompt is None or not prompt.content:
        return fallback
    return prompt.content
