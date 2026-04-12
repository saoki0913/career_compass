from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias, Optional

from app.config import settings

LLMProvider = Literal["anthropic", "openai", "google"]
LLMModel: TypeAlias = str
ResponseFormat = Literal["json_object", "json_schema", "text"]


@dataclass(frozen=True)
class ResolvedModelTarget:
    provider: LLMProvider
    actual_model: str


def _build_model_config() -> dict[str, LLMModel]:
    return {
        "es_review": settings.model_es_review,
        "gakuchika": settings.model_gakuchika,
        "motivation": settings.model_motivation,
        "interview": settings.model_interview,
        "interview_feedback": settings.model_interview_feedback,
        "gakuchika_draft": settings.model_gakuchika_draft,
        "motivation_draft": settings.model_motivation_draft,
        "selection_schedule": settings.model_selection_schedule,
        "company_info": settings.model_company_info,
        "rag_query_expansion": settings.model_rag_query_expansion,
        "rag_hyde": settings.model_rag_hyde,
        "rag_classify": settings.model_rag_classify,
    }


def get_model_config() -> dict[str, LLMModel]:
    from app.utils.llm_client_registry import get_registry

    registry = get_registry()
    if registry.model_config is None:
        registry.model_config = _build_model_config()
    return registry.model_config


def get_model_display_name(model: str) -> str:
    model_lower = model.lower()
    if "claude" in model_lower:
        if "haiku" in model_lower:
            return "Claude Haiku 4.5"
        if "sonnet" in model_lower:
            return "Claude Sonnet 4.6"
        if "opus" in model_lower:
            return "Claude Opus 4"
        return f"Claude ({model})"
    if model_lower.startswith("gemini-3.1-pro-preview"):
        return "Gemini 3 Pro Preview"
    if model_lower.startswith("gemini"):
        return f"Gemini ({model})"
    if "gpt-5" in model_lower:
        if model_lower.startswith("gpt-5.4"):
            if "nano" in model_lower:
                return "GPT-5.4 Nano"
            if "mini" in model_lower:
                return "GPT-5.4-mini"
            return "GPT-5.4"
        if "mini" in model_lower:
            return "GPT-5.4-mini"
        if "nano" in model_lower:
            return "GPT-5.4 Nano"
        return "GPT-5"
    if "gpt-4o" in model_lower:
        if "mini" in model_lower:
            return "GPT-4o Mini"
        return "GPT-4o"
    if "gpt-4" in model_lower:
        return f"GPT-4 ({model})"
    return model


def _resolve_openai_model(feature: str, model_hint: Optional[str] = None) -> str:
    if model_hint in ("gpt-nano", "gpt-5-nano", "gpt-5.4-nano"):
        return settings.gpt_nano_model
    if model_hint and model_hint not in (
        "openai",
        "gpt",
        "gpt-mini",
        "gpt-4o-mini",
        "gpt-5.4-mini",
    ):
        return model_hint
    if model_hint == "gpt":
        return settings.gpt_model
    return settings.gpt_mini_model


def _resolve_model_target(
    feature: str,
    model_hint: Optional[LLMModel] = None,
) -> ResolvedModelTarget:
    requested_model = model_hint or get_model_config().get(feature, "claude-sonnet")
    model_lower = str(requested_model or "").strip().lower()

    if requested_model == "claude-sonnet":
        return ResolvedModelTarget("anthropic", settings.claude_sonnet_model)
    if requested_model == "claude-haiku":
        return ResolvedModelTarget("anthropic", settings.claude_haiku_model)
    if requested_model == "gpt":
        return ResolvedModelTarget("openai", settings.gpt_model)
    if requested_model == "gpt-mini":
        return ResolvedModelTarget("openai", settings.gpt_mini_model)
    if requested_model == "gpt-nano":
        return ResolvedModelTarget("openai", settings.gpt_nano_model)
    if requested_model == "low-cost":
        return ResolvedModelTarget("anthropic", settings.low_cost_review_model)
    if requested_model == "gemini":
        return ResolvedModelTarget("google", settings.gemini_model)
    if requested_model == "openai":
        return ResolvedModelTarget("openai", settings.gpt_mini_model)
    if requested_model == "google":
        return ResolvedModelTarget("google", settings.gemini_model)
    if model_lower.startswith("claude"):
        return ResolvedModelTarget("anthropic", str(requested_model))
    if model_lower.startswith("gemini"):
        return ResolvedModelTarget("google", str(requested_model))
    if requested_model == "cohere" or model_lower.startswith("command-"):
        raise ValueError(f"Unsupported model for this app: {requested_model}")

    resolved_openai_model = _resolve_openai_model(feature, model_hint=str(requested_model))
    return ResolvedModelTarget("openai", resolved_openai_model)


def resolve_feature_model_metadata(
    feature: str, requested_model: LLMModel | None = None
) -> tuple[str, str]:
    target = _resolve_model_target(feature, requested_model)
    provider = "claude" if target.provider == "anthropic" else target.provider
    return provider, target.actual_model


def _provider_has_api_key(provider: LLMProvider) -> bool:
    return {
        "anthropic": bool(settings.anthropic_api_key),
        "openai": bool(settings.openai_api_key),
        "google": bool(settings.google_api_key),
    }[provider]


def _feature_cross_fallback_model(feature: str, provider: LLMProvider) -> Optional[LLMModel]:
    _ = (feature, provider)
    return None


__all__ = [
    "LLMModel",
    "LLMProvider",
    "ResponseFormat",
    "ResolvedModelTarget",
    "_build_model_config",
    "_feature_cross_fallback_model",
    "_provider_has_api_key",
    "_resolve_model_target",
    "_resolve_openai_model",
    "get_model_config",
    "get_model_display_name",
    "resolve_feature_model_metadata",
]
