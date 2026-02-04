"""
Intent profiles for company content classification and search scoring.

Single source of truth for content-type-specific keywords and URL patterns.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class IntentProfile:
    content_type: str
    strong_keywords: tuple[str, ...]
    weak_keywords: tuple[str, ...]
    url_patterns: tuple[str, ...]
    exclude_keywords: tuple[str, ...]


def _t(items: Iterable[str]) -> tuple[str, ...]:
    return tuple(items)


# Ambiguous tokens are intentionally excluded from profiles to avoid cross-intent
# mismatch penalties. They are handled by explicit rules in scoring logic.
AMBIGUOUS_TOKENS = {
    "news",
    "ニュース",
    "message",
    "メッセージ",
    "career",
    "キャリア",
}

AMBIGUOUS_RULES = {
    "message": {
        "tokens": ["message", "メッセージ"],
        "context": [
            "ceo",
            "社長",
            "代表",
            "president",
            "top message",
            "トップメッセージ",
            "代表挨拶",
            "社長挨拶",
        ],
        "intent": "ceo_message",
    },
    "news": {
        "tokens": ["news", "ニュース"],
        "press_context": ["press", "release", "media", "プレス", "リリース", "報道"],
        "ir_context": [
            "ir",
            "investor",
            "financial",
            "results",
            "決算",
            "投資家",
            "有価証券",
        ],
        "press_intent": "press_release",
        "ir_intent": "ir_materials",
        "fallback_intent": "corporate_site",
    },
    "career": {
        "tokens": ["career", "キャリア"],
        "context": [
            "recruit",
            "採用",
            "募集",
            "job",
            "opening",
            "求人",
            "entry",
        ],
        "intent": "midcareer_recruitment",
    },
}


INTENT_PROFILES: dict[str, IntentProfile] = {
    "new_grad_recruitment": IntentProfile(
        content_type="new_grad_recruitment",
        strong_keywords=_t(
            [
                "新卒",
                "新卒採用",
                "新卒向け",
                "新卒向け採用",
                "新卒採用情報",
                "新卒募集",
                "卒業予定",
                "25卒",
                "26卒",
                "27卒",
                "28卒",
                "graduate recruitment",
                "campus",
                "early career",
                "freshers",
            ]
        ),
        weak_keywords=_t(["intern", "internship"]),
        url_patterns=_t(
            [
                "newgrad",
                "shinsotsu",
                "graduate-recruit",
                "new-graduate",
                "campus",
                "early-career",
                "fresh",
                "recruit",
                "recruitment",
                "saiyo",
                "entry",
                "mypage",
            ]
        ),
        exclude_keywords=_t(
            [
                "中途",
                "キャリア採用",
                "experienced",
                "mid-career",
                "ir",
                "csr",
            ]
        ),
    ),
    "midcareer_recruitment": IntentProfile(
        content_type="midcareer_recruitment",
        strong_keywords=_t(
            [
                "中途",
                "中途採用",
                "中途募集",
                "キャリア採用",
                "経験者採用",
                "経験者",
                "即戦力",
                "professional",
                "experienced hire",
                "job openings",
            ]
        ),
        weak_keywords=_t(["experienced", "professional"]),
        url_patterns=_t(
            [
                "mid-career",
                "midcareer",
                "experienced",
                "experienced-hire",
                "professional",
                "job",
                "jobs",
                "join",
                "opportunities",
            ]
        ),
        exclude_keywords=_t(["新卒", "新卒採用", "graduate", "intern"]),
    ),
    "corporate_site": IntentProfile(
        content_type="corporate_site",
        strong_keywords=_t(
            [
                "会社概要",
                "企業情報",
                "事業内容",
                "事業紹介",
                "沿革",
                "会社案内",
                "企業理念",
                "ビジョン",
                "ミッション",
                "corporate",
                "about us",
            ]
        ),
        weak_keywords=_t(["ニュース", "お知らせ", "トピックス"]),
        url_patterns=_t(
            [
                "company",
                "about",
                "overview",
                "profile",
                "business",
                "corporate",
                "company-info",
                "about-us",
                "philosophy",
                "vision",
                "topics",
            ]
        ),
        exclude_keywords=_t(["採用", "recruit", "ir", "csr", "サステナ"]),
    ),
    "ir_materials": IntentProfile(
        content_type="ir_materials",
        strong_keywords=_t(
            [
                "ir",
                "投資家情報",
                "有価証券報告書",
                "決算短信",
                "決算説明会",
                "決算説明会資料",
                "統合報告書",
                "統合報告",
                "financial results",
                "earnings",
                "annual report",
                "securities report",
                "form 20-f",
            ]
        ),
        weak_keywords=_t(["決算", "株主", "財務", "investor relations"]),
        url_patterns=_t(
            [
                "ir",
                "investor",
                "investors",
                "investor-relations",
                "ir-library",
                "financial-results",
                "results",
                "earnings",
                "annual-report",
            ]
        ),
        exclude_keywords=_t(
            [
                "採用",
                "recruit",
                "csr",
                "サステナ",
                "faq",
                "よくある質問",
                "ヘルプ",
                "サポート",
                "お問い合わせ",
                "店舗",
                "支店",
                "キャンペーン",
                "ローン",
                "シミュレーション",
            ]
        ),
    ),
    "ceo_message": IntentProfile(
        content_type="ceo_message",
        strong_keywords=_t(
            [
                "社長メッセージ",
                "社長挨拶",
                "代表メッセージ",
                "代表挨拶",
                "ceo message",
                "president message",
                "message from ceo",
                "top message",
            ]
        ),
        weak_keywords=_t(["社長", "代表", "ceo", "挨拶"]),
        url_patterns=_t(
            [
                "message",
                "ceo",
                "top-message",
                "leadership",
                "president",
                "message-from-ceo",
            ]
        ),
        exclude_keywords=_t(
            [
                "採用",
                "recruit",
                "ir",
                "csr",
                "faq",
                "よくある質問",
                "ヘルプ",
                "サポート",
                "お問い合わせ",
                "店舗",
                "支店",
                "キャンペーン",
                "ローン",
                "シミュレーション",
            ]
        ),
    ),
    "employee_interviews": IntentProfile(
        content_type="employee_interviews",
        strong_keywords=_t(
            [
                "社員インタビュー",
                "社員紹介",
                "社員の声",
                "社員ブログ",
                "社員座談会",
                "クロストーク",
                "座談会",
                "働き方",
                "カルチャー",
                "culture",
                "employee",
                "staff",
                "team",
                "people",
                "interview",
                "story",
            ]
        ),
        weak_keywords=_t(["社員", "インタビュー", "働く"]),
        url_patterns=_t(
            [
                "interview",
                "people",
                "voice",
                "blog",
                "stories",
                "culture",
                "employee",
                "voices",
                "staff",
                "story",
            ]
        ),
        exclude_keywords=_t(
            [
                "ir",
                "csr",
                "決算",
                "有価証券",
                "faq",
                "よくある質問",
                "ヘルプ",
                "サポート",
                "お問い合わせ",
                "店舗",
                "支店",
                "キャンペーン",
                "ローン",
                "シミュレーション",
            ]
        ),
    ),
    "press_release": IntentProfile(
        content_type="press_release",
        strong_keywords=_t(
            [
                "プレスリリース",
                "ニュースリリース",
                "報道発表",
                "報道資料",
                "news release",
                "media release",
                "press release",
            ]
        ),
        weak_keywords=_t(["リリース", "報道"]),
        url_patterns=_t(
            [
                "press",
                "press-release",
                "newsrelease",
                "release",
                "newsroom",
                "pressroom",
                "media",
                "pr",
            ]
        ),
        exclude_keywords=_t(
            [
                "採用",
                "recruit",
                "ir",
                "csr",
                "faq",
                "よくある質問",
                "ヘルプ",
                "サポート",
                "お問い合わせ",
                "店舗",
                "支店",
                "キャンペーン",
                "ローン",
                "シミュレーション",
            ]
        ),
    ),
    "csr_sustainability": IntentProfile(
        content_type="csr_sustainability",
        strong_keywords=_t(
            [
                "csr",
                "サステナビリティ",
                "esg",
                "サステナビリティレポート",
                "tcfd",
                "sdgs",
                "esg report",
                "responsible",
                "responsibility",
                "非財務",
            ]
        ),
        weak_keywords=_t(["社会貢献", "環境", "持続可能"]),
        url_patterns=_t(
            [
                "csr",
                "sustainability",
                "esg",
                "sdgs",
                "responsibility",
                "sustainability-report",
                "environment",
                "society",
                "tcfd",
            ]
        ),
        exclude_keywords=_t(
            [
                "採用",
                "recruit",
                "ir",
                "faq",
                "よくある質問",
                "ヘルプ",
                "サポート",
                "お問い合わせ",
                "店舗",
                "支店",
                "キャンペーン",
                "ローン",
                "シミュレーション",
            ]
        ),
    ),
    "midterm_plan": IntentProfile(
        content_type="midterm_plan",
        strong_keywords=_t(
            [
                "中期経営計画",
                "中期計画",
                "中期経営方針",
                "中期ビジョン",
                "中計",
                "medium-term plan",
                "mid-term plan",
                "management plan",
            ]
        ),
        weak_keywords=_t(["経営計画", "事業計画", "経営戦略", "strategy"]),
        url_patterns=_t(
            [
                "midterm",
                "medium-term",
                "medium_term",
                "management-plan",
                "mtbp",
                "strategy",
                "plan",
            ]
        ),
        exclude_keywords=_t(
            [
                "採用",
                "recruit",
                "csr",
                "faq",
                "よくある質問",
                "ヘルプ",
                "サポート",
                "お問い合わせ",
                "店舗",
                "支店",
                "キャンペーン",
                "ローン",
                "シミュレーション",
            ]
        ),
    ),
}


def get_intent_profile(content_type: str) -> IntentProfile | None:
    return INTENT_PROFILES.get(content_type)


def get_all_intent_profiles() -> dict[str, IntentProfile]:
    return dict(INTENT_PROFILES)
