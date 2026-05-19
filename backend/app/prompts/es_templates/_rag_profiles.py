"""RAG profiles for ES templates."""

from __future__ import annotations

from typing import Any


ContentFamily = tuple[str, ...]
RagProfile = dict[str, Any]


CONTENT_TYPE_GROUPS: dict[str, set[str]] = {
    "hiring_role": {
        "new_grad_recruitment",
        "midcareer_recruitment",
    },
    "people_values": {
        "employee_interviews",
        "ceo_message",
        "corporate_site",
    },
    "business_future": {
        "corporate_site",
        "press_release",
        "midterm_plan",
        "ir_materials",
        "csr_sustainability",
    },
}

BOOST_HIGH = 1.35
BOOST_MEDIUM = 1.18
BOOST_LOW = 0.92
BOOST_FLOOR = 0.7

ASSISTIVE_COMPANY_SIGNAL_TEMPLATES = frozenset(
    {"self_pr", "gakuchika", "work_values", "basic"}
)

TEMPLATE_CONTENT_GROUP_ORDER: dict[str, ContentFamily] = {
    "company_motivation": ("business_future", "people_values", "hiring_role"),
    "role_course_reason": ("hiring_role", "people_values", "business_future"),
    "intern_reason": ("hiring_role", "people_values", "business_future"),
    "intern_goals": ("people_values", "hiring_role", "business_future"),
    "post_join_goals": ("business_future", "people_values", "hiring_role"),
}

TEMPLATE_RAG_PROFILES: dict[str, RagProfile] = {
    "basic": {
        "profile_name": "es_light",
        "expand_queries": False,
        "rerank": False,
        "use_bm25": False,
        "profile_overrides": {
            "semantic_weight": 0.82,
            "keyword_weight": 0.18,
            "fetch_k": 16,
            "max_queries": 0,
            "max_total_queries": 1,
            "rerank_threshold": 0.82,
            "mmr_lambda": 0.62,
            "use_hyde": False,
        },
    },
    "company_motivation": {
        "profile_name": "es_company_focus",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.68,
            "keyword_weight": 0.32,
            "fetch_k": 24,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.66,
            "mmr_lambda": 0.48,
            "use_hyde": False,
        },
    },
    "intern_reason": {
        "profile_name": "es_company_focus",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.7,
            "keyword_weight": 0.3,
            "fetch_k": 22,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.67,
            "mmr_lambda": 0.5,
            "use_hyde": False,
        },
    },
    "intern_goals": {
        "profile_name": "es_company_focus",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.68,
            "keyword_weight": 0.32,
            "fetch_k": 22,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.66,
            "mmr_lambda": 0.48,
            "use_hyde": False,
        },
    },
    "gakuchika": {
        "profile_name": "es_self_focus",
        "expand_queries": False,
        "rerank": False,
        "use_bm25": False,
        "profile_overrides": {
            "semantic_weight": 0.86,
            "keyword_weight": 0.14,
            "fetch_k": 12,
            "max_queries": 0,
            "max_total_queries": 1,
            "rerank_threshold": 0.84,
            "mmr_lambda": 0.7,
            "use_hyde": False,
        },
    },
    "self_pr": {
        "profile_name": "es_self_focus",
        "expand_queries": False,
        "rerank": False,
        "use_bm25": False,
        "profile_overrides": {
            "semantic_weight": 0.86,
            "keyword_weight": 0.14,
            "fetch_k": 12,
            "max_queries": 0,
            "max_total_queries": 1,
            "rerank_threshold": 0.84,
            "mmr_lambda": 0.7,
            "use_hyde": False,
        },
    },
    "post_join_goals": {
        "profile_name": "es_company_future",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.66,
            "keyword_weight": 0.34,
            "fetch_k": 26,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.65,
            "mmr_lambda": 0.46,
            "use_hyde": True,
        },
    },
    "role_course_reason": {
        "profile_name": "es_role_fit",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.7,
            "keyword_weight": 0.3,
            "fetch_k": 24,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.64,
            "mmr_lambda": 0.46,
            "use_hyde": False,
        },
    },
    "work_values": {
        "profile_name": "es_self_focus",
        "expand_queries": False,
        "rerank": False,
        "use_bm25": False,
        "profile_overrides": {
            "semantic_weight": 0.88,
            "keyword_weight": 0.12,
            "fetch_k": 10,
            "max_queries": 0,
            "max_total_queries": 1,
            "rerank_threshold": 0.86,
            "mmr_lambda": 0.72,
            "use_hyde": False,
        },
    },
}


def get_template_source_family_priority_name(template_type: str) -> str | None:
    if template_type in ASSISTIVE_COMPANY_SIGNAL_TEMPLATES:
        return "assistive_people_values"
    if template_type in TEMPLATE_CONTENT_GROUP_ORDER:
        return template_type
    return None


def get_template_content_type_boosts(
    template_type: str,
    *,
    assistive_company_signal: bool = False,
) -> dict[str, float]:
    families: tuple[str, ...]
    if template_type in ASSISTIVE_COMPANY_SIGNAL_TEMPLATES:
        if not assistive_company_signal:
            return {}
        families = ("people_values",)
    else:
        families = TEMPLATE_CONTENT_GROUP_ORDER.get(template_type, ())

    if not families:
        return {}

    family_weights = {families[0]: BOOST_HIGH}
    if len(families) >= 2:
        family_weights[families[1]] = BOOST_MEDIUM
    if len(families) >= 3:
        family_weights[families[2]] = BOOST_LOW

    boosts: dict[str, float] = {}
    for family_types in CONTENT_TYPE_GROUPS.values():
        for content_type in family_types:
            boosts[content_type] = BOOST_FLOOR

    for family_name, weight in family_weights.items():
        for content_type in CONTENT_TYPE_GROUPS[family_name]:
            boosts[content_type] = max(
                boosts.get(content_type, BOOST_FLOOR),
                weight,
            )

    return boosts


def get_template_rag_profile(
    template_type: str,
    *,
    assistive_company_signal: bool = False,
) -> RagProfile:
    base_profile = TEMPLATE_RAG_PROFILES.get(template_type, TEMPLATE_RAG_PROFILES["basic"])
    profile = {
        key: value.copy() if isinstance(value, dict) else value
        for key, value in base_profile.items()
    }
    profile["content_type_boosts"] = get_template_content_type_boosts(
        template_type,
        assistive_company_signal=assistive_company_signal,
    )
    return profile
