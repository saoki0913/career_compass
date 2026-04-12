"""
Constants and configuration for company_info router.

Extracted from company_info.py to reduce file size.
"""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

# ===== Hybrid Search Configuration =====
# Imported from settings in company_info.py; re-exported here for consumers.


# ===== Parent Domain Allowlist =====
PARENT_ALLOWED_CONTENT_TYPES = {
    "ir_materials",
    "midterm_plan",
    "csr_sustainability",
}

# ===== DuckDuckGo Search Cache Config =====
DDGS_CACHE_TTL = timedelta(minutes=30)
DDGS_CACHE_MAX_SIZE = 200
CACHE_MODES = {"use", "refresh", "bypass"}

# ===== Employee Interview Signals =====
EMPLOYEE_INTERVIEW_POSITIVE_SIGNALS = {
    "interview",
    "voice",
    "people",
    "person",
    "member",
    "members",
    "staff",
    "story",
    "talk",
    "社員紹介",
    "社員インタビュー",
    "社員の声",
    "先輩社員",
    "働く人",
    "人を知る",
    "人を読む",
}
EMPLOYEE_INTERVIEW_NEGATIVE_SIGNALS = {
    "investor",
    "investors",
    "ir",
    "financial",
    "earnings",
    "results",
    "governance",
    "integrated",
    "統合報告",
    "決算",
    "株主",
    "投資家",
    "有価証券",
    "企業データ",
    "会社概要",
    "企業概要",
    "company data",
    "company overview",
}

# ===== Schedule Follow-Link Signals =====
SCHEDULE_FOLLOW_LINK_KEYWORDS = (
    ("締切", 6),
    ("エントリー", 5),
    ("entry", 5),
    ("募集要項", 5),
    ("応募要項", 5),
    ("application", 4),
    ("guideline", 4),
    ("schedule", 4),
    ("選考", 4),
    ("flow", 3),
    ("マイページ", 3),
    ("mypage", 3),
    ("要項", 3),
)
SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS = {
    "privacy",
    "policy",
    "news",
    "ir",
    "investor",
    "company",
    "about",
    "faq",
    "contact",
    "sitemap",
    "terms",
    "legal",
    "mypage",
    "login",
    "signin",
    "account",
}
SCHEDULE_MAX_FOLLOW_LINKS = 1
SCHEDULE_MAX_PDF_FOLLOW_LINKS = 1
SCHEDULE_MAX_OCR_CALLS = 1
SCHEDULE_MIN_TEXT_CHARS = 40
SCHEDULE_HTML_EXTRACT_MAX_CHARS = 8192

# LLM input limits
SCHEDULE_LLM_TEXT_MAX_CHARS = 6000
SCHEDULE_LLM_FALLBACK_MAX_CHARS = 4500
SCHEDULE_LLM_TEXT_CONTEXT_LINES = 2

# Extreme-page constants
SCHEDULE_EXTREME_PAGE_CHARS = 80_000
SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME = 4000
SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME = 3200
SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME = 3
SCHEDULE_EXTREME_TAIL_LINES = 400

# LLM output limit
SCHEDULE_LLM_MAX_OUTPUT_TOKENS = 1500

_SCHEDULE_FOLLOW_KW = tuple(k for k, _ in SCHEDULE_FOLLOW_LINK_KEYWORDS)
SCHEDULE_CONTENT_KEYWORDS: tuple[str, ...] = tuple(
    dict.fromkeys(
        _SCHEDULE_FOLLOW_KW
        + (
            "書類",
            "提出",
            "提出物",
            "エントリーシート",
            "webテスト",
            "適性検査",
            "適性",
            "面接",
            "説明会",
            "内定",
            "内定承諾",
            "スケジュール",
            "日程",
            "新卒",
            "採用",
            "本選考",
            "一次",
            "二次",
            "三次",
            "試験",
            "応募方法",
            "選考フロー",
            "通過",
            "合格",
            "deadline",
            "application",
            "recruitment",
            "intern",
            "選考概要",
            "選考日程",
            "エントリー開始",
            "エントリー受付",
            "マイナビ",
            "リクナビ",
        )
    )
)

# ===== Exclude / Filter Lists =====
EXCLUDE_SITES_STRONG = [
    "openwork",
    "vorkers",
    "wikipedia",
    "youtube",
    "twitter",
    "x.com",
    "instagram",
    "facebook",
    "tiktok",
    "note.com",
    "blog",
    "blogspot",
    "nikkei",
    "toyokeizai",
    "diamond.jp",
    "news.yahoo",
    "livedoor",
    "prtimes",
    "pressrelease",
    "press-release",
    "hp.com",
]

SUBSIDIARY_KEYWORDS = [
    "サプライチェーン",
    "ソリューション",
    "ソリューションズ",
    "ロジスティクス",
    "流通",
    "ビジネスパートナーズ",
    "グローバル",
    "インターナショナル",
    "ジャパン",
    "テクノロジー",
    "テクノロジーズ",
    "システム",
    "システムズ",
    "サービス",
    "サービシーズ",
    "エンジニアリング",
    "マネジメント",
    "コンサルティング",
    "ファイナンス",
    "リテール",
    "トレーディング",
    "プロパティ",
    "アセット",
    "ケミカル",
    "マテリアル",
    "マーケティング",
    "プランニング",
    "プラスチック",
    "プラスチックス",
    "メタル",
    "メタルズ",
    "スチール",
    "ペトロ",
    "ケミカルズ",
    "フーズ",
    "フード",
    "不動産",
    "リアルティ",
    "ファシリティ",
    "ファシリティーズ",
    "デベロップメント",
    "インシュアランス",
    "セキュリティ",
    "オートモーティブ",
    "エレクトロニクス",
    "エナジー",
    "supply chain",
    "solutions",
    "logistics",
    "global",
    "international",
    "technology",
    "systems",
    "services",
    "engineering",
    "management",
    "consulting",
    "finance",
    "retail",
    "trading",
    "property",
    "asset",
    "chemical",
    "material",
    "marketing",
    "planning",
    "plastics",
    "metal",
    "metals",
    "steel",
    "petro",
    "foods",
    "realty",
    "facility",
    "facilities",
    "development",
    "insurance",
    "security",
    "automotive",
    "electronics",
    "energy",
]

JOB_SITES = [
    "mynavi.jp",
    "rikunabi.com",
    "onecareer.jp",
    "unistyle.jp",
    "nikki.ne.jp",
    "goodfind.jp",
    "offerbox.jp",
    "labbase.jp",
    "gaishishukatsu.com",
    "type.jp",
    "en-japan.com",
    "doda.jp",
    "syukatsu-kaigi.jp",
    "career-tasu",
    "job.mynavi.jp",
    "job.rikunabi.com",
    "rikeinavi.com",
    "reashu.com",
    "ut-board.com",
    "talentsquare.co.jp",
    "renew-career.com",
    "abuild-c.com",
    "pasonacareer.jp",
    "r-agent.com",
    "careerup-media.com",
]

IRRELEVANT_SITES = [
    "shopping-park",
    "rakuten.co.jp",
    "amazon",
    "yahoo-shopping",
    "fliphtml5",
    "scribd",
    "slideshare",
    "issuu",
    "docplayer",
    "linkedin.com",
    "socialen.net",
    "hatena",
    "ameba",
    "qiita",
    "zenn.dev",
    "igad.int",
    ".gov",
    ".edu",
    "/api/",
    ".xml",
    "/feed/",
    "/rss",
    "mitsui-fudosan",
    "mitsui-shopping",
    "test-dev-site.site",
    ".test",
]

AGGREGATOR_SITES = [
    "rikunabi.com",
    "onecareer.jp",
    "unistyle.jp",
    "syukatsu-kaigi.jp",
    "gaishishukatsu.com",
    "career-tasu",
    "goodfind",
    "job.rikunabi.com",
    "en-japan.com",
    "doda.jp",
    "type.jp",
    "rikeinavi.com",
    "reashu.com",
    "ut-board.com",
    "talentsquare.co.jp",
    "renew-career.com",
    "abuild-c.com",
    "pasonacareer.jp",
    "r-agent.com",
    "careerup-media.com",
]

RECRUIT_URL_KEYWORDS = [
    "recruit",
    "saiyo",
    "entry",
    "career",
    "graduate",
    "fresh",
    "newgrads",
    "intern",
    "internship",
    "shinsotsu",
    "mypage",
]

RECRUIT_TITLE_KEYWORDS = [
    "採用",
    "新卒",
    "エントリー",
    "募集",
    "選考",
    "インターン",
    "マイページ",
    "採用情報",
    "新卒採用",
]

CORP_KEYWORDS = {
    "ir": {
        "url": ["ir", "investor", "financial", "stock", "shareholder", "kessan"],
        "title": ["IR", "投資家", "株主", "決算", "有価証券", "統合報告", "財務"],
        "snippet": ["IR", "投資家", "株主", "決算", "有価証券", "統合報告", "財務"],
    },
    "business": {
        "url": ["business", "service", "product", "solution", "service", "jigyo"],
        "title": ["事業", "事業内容", "事業紹介", "製品", "サービス", "ソリューション"],
        "snippet": ["事業", "事業内容", "製品", "サービス", "ソリューション"],
    },
    "about": {
        "url": ["company", "about", "corporate", "profile", "overview"],
        "title": ["会社概要", "企業情報", "会社案内", "沿革", "拠点", "組織"],
        "snippet": ["会社概要", "企業情報", "会社案内", "沿革", "拠点", "組織"],
    },
}

IR_DOC_KEYWORDS = [
    "有価証券報告書",
    "有報",
    "統合報告書",
    "統合報告",
    "アニュアルレポート",
    "annual report",
    "securities report",
    "security report",
    "yuho",
    "決算説明資料",
    "決算短信",
]

CORP_SEARCH_MIN_SCORE = 3.5
CORP_STRICT_MIN_RESULTS = 3

# ===== JSON Schemas =====
COMPANY_INFO_SCHEMA = {
    "name": "company_info_extract",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "deadlines",
            "recruitment_types",
            "required_documents",
            "application_method",
            "selection_process",
        ],
        "properties": {
            "deadlines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "type",
                        "title",
                        "due_date",
                        "source_url",
                        "confidence",
                    ],
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": [
                                "es_submission",
                                "web_test",
                                "aptitude_test",
                                "interview_1",
                                "interview_2",
                                "interview_3",
                                "interview_final",
                                "briefing",
                                "internship",
                                "offer_response",
                                "other",
                            ],
                        },
                        "title": {"type": "string"},
                        "due_date": {"type": ["string", "null"]},
                        "source_url": {"type": "string"},
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                        },
                    },
                },
            },
            "recruitment_types": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "source_url", "confidence"],
                    "properties": {
                        "name": {"type": "string"},
                        "source_url": {"type": "string"},
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                        },
                    },
                },
            },
            "required_documents": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "required", "source_url", "confidence"],
                    "properties": {
                        "name": {"type": "string"},
                        "required": {"type": "boolean"},
                        "source_url": {"type": "string"},
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                        },
                    },
                },
            },
            "application_method": {
                "type": ["object", "null"],
                "additionalProperties": False,
                "required": ["value", "source_url", "confidence"],
                "properties": {
                    "value": {"type": "string"},
                    "source_url": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
            },
            "selection_process": {
                "type": ["object", "null"],
                "additionalProperties": False,
                "required": ["value", "source_url", "confidence"],
                "properties": {
                    "value": {"type": "string"},
                    "source_url": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
            },
        },
    },
}

_SELECTION_SCHEDULE_DEADLINE_ITEM = {
    "type": "object",
    "additionalProperties": False,
    "required": ["type", "title", "due_date", "source_url", "confidence"],
    "properties": {
        "type": {
            "type": "string",
            "enum": [
                "es_submission",
                "web_test",
                "aptitude_test",
                "interview_1",
                "interview_2",
                "interview_3",
                "interview_final",
                "briefing",
                "internship",
                "offer_response",
                "other",
            ],
        },
        "title": {"type": "string", "maxLength": 80},
        "due_date": {"type": ["string", "null"]},
        "source_url": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
}

_SELECTION_SCHEDULE_DOC_ITEM = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "required", "source_url", "confidence"],
    "properties": {
        "name": {"type": "string", "maxLength": 120},
        "required": {"type": "boolean"},
        "source_url": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
}

_SELECTION_SCHEDULE_ITEM_WITH_VALUE = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "required": ["value", "source_url", "confidence"],
    "properties": {
        "value": {"type": "string", "maxLength": 400},
        "source_url": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
}

SELECTION_SCHEDULE_SCHEMA = {
    "name": "selection_schedule_extract",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "deadlines",
            "required_documents",
            "application_method",
            "selection_process",
        ],
        "properties": {
            "deadlines": {
                "type": "array",
                "maxItems": 15,
                "items": _SELECTION_SCHEDULE_DEADLINE_ITEM,
            },
            "required_documents": {
                "type": "array",
                "maxItems": 10,
                "items": _SELECTION_SCHEDULE_DOC_ITEM,
            },
            "application_method": _SELECTION_SCHEDULE_ITEM_WITH_VALUE,
            "selection_process": _SELECTION_SCHEDULE_ITEM_WITH_VALUE,
        },
    },
}
