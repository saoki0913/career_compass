"""
backend/tests/interview/harness/fixtures.py

Phase 2 Stage 0-1: 24 代表ケースの InterviewStartRequest / InterviewTurnRequest /
InterviewFeedbackRequest を生成する fixture 関数群。

設計原則:
- 直交表ベースの 24 ケース (format × stage × strictness × role_track × interviewer)
- 企業情報は架空 5 社をローテーション — 差別的質問テストでも安全な内容
- pytest.fixture(params=range(1, 25)) でパラメータ化可能
- module-level 定数 HARNESS_CASES / CASE_EXPECTED_DIFFS を export
"""

from __future__ import annotations

from typing import Any

import pytest

from app.routers.interview import (
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
)

# ---------------------------------------------------------------------------
# 架空企業マスター (5 社)
# 差別的内容・実在企業名・誇張表現を一切含まない安全な設定
# ---------------------------------------------------------------------------

_COMPANIES: list[dict[str, str]] = [
    {
        "name": "株式会社サンプルA",
        "summary": "中堅製造業向けに業務効率化ソリューションを提供するコンサルティング会社。",
        "industry": "コンサルティング",
    },
    {
        "name": "株式会社サンプルB",
        "summary": "国内向け EC プラットフォームを運営する IT 企業。フロントエンド技術への投資が多い。",
        "industry": "IT・インターネット",
    },
    {
        "name": "株式会社サンプルC",
        "summary": "データ分析基盤と機械学習モデルの開発・運用を支援するスタートアップ。",
        "industry": "IT・インターネット",
    },
    {
        "name": "株式会社サンプルD",
        "summary": "大手食品・日用品メーカーを顧客に持つ総合商社の事業部門。",
        "industry": "商社",
    },
    {
        "name": "株式会社サンプルE",
        "summary": "地方自治体や公共機関に DX 支援サービスを提供するシステムインテグレーター。",
        "industry": "IT・インターネット",
    },
]

# 企業をケース ID で決定論的にローテーション
def _company(case_id: int) -> dict[str, str]:
    return _COMPANIES[(case_id - 1) % len(_COMPANIES)]


# ---------------------------------------------------------------------------
# 24 代表ケース定義
#
# 構成:
# - ケース 1-16: format × stage × strictness × role_track × interviewer の直交カバレッジ
# - ケース 17-19: strictness 差の単離 (同条件で supportive / standard / strict)
# - ケース 20-23: interviewer 差の単離 (同条件で hr / line_manager / executive / mixed_panel)
# - ケース 24: role_track 差 (技術系追加)
# ---------------------------------------------------------------------------

HARNESS_CASES: list[dict[str, Any]] = [
    # --- 直交カバレッジ (ケース 1-16) ---
    {
        "case_id": 1,
        "format": "standard_behavioral",
        "stage": "early",
        "strictness": "supportive",
        "role_track": "biz_general",
        "interviewer": "hr",
        "description": "行動面接 / 早期段階 / サポート / 総合職 / 人事",
    },
    {
        "case_id": 2,
        "format": "standard_behavioral",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "it_product",
        "interviewer": "line_manager",
        "description": "行動面接 / 中盤 / 標準 / IT製品 / 現場管理職",
    },
    {
        "case_id": 3,
        "format": "standard_behavioral",
        "stage": "final",
        "strictness": "strict",
        "role_track": "consulting",
        "interviewer": "executive",
        "description": "行動面接 / 最終 / 厳しめ / コンサル / 役員",
    },
    {
        "case_id": 4,
        "format": "standard_behavioral",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "frontend_engineer",
        "interviewer": "mixed_panel",
        "description": "行動面接 / 中盤 / 標準 / フロントエンド / 複合パネル",
    },
    {
        "case_id": 5,
        "format": "case",
        "stage": "early",
        "strictness": "supportive",
        "role_track": "consulting",
        "interviewer": "line_manager",
        "description": "ケース面接 / 早期段階 / サポート / コンサル / 現場管理職",
    },
    {
        "case_id": 6,
        "format": "case",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "data_ai",
        "interviewer": "executive",
        "description": "ケース面接 / 中盤 / 標準 / データ AI / 役員",
    },
    {
        "case_id": 7,
        "format": "case",
        "stage": "final",
        "strictness": "strict",
        "role_track": "biz_general",
        "interviewer": "mixed_panel",
        "description": "ケース面接 / 最終 / 厳しめ / 総合職 / 複合パネル",
    },
    {
        "case_id": 8,
        "format": "case",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "frontend_engineer",
        "interviewer": "hr",
        "description": "ケース面接 / 中盤 / 標準 / フロントエンド / 人事",
    },
    {
        "case_id": 9,
        "format": "technical",
        "stage": "early",
        "strictness": "supportive",
        "role_track": "data_ai",
        "interviewer": "line_manager",
        "description": "技術面接 / 早期段階 / サポート / データ AI / 現場管理職",
    },
    {
        "case_id": 10,
        "format": "technical",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "frontend_engineer",
        "interviewer": "executive",
        "description": "技術面接 / 中盤 / 標準 / フロントエンド / 役員",
    },
    {
        "case_id": 11,
        "format": "technical",
        "stage": "final",
        "strictness": "strict",
        "role_track": "it_product",
        "interviewer": "mixed_panel",
        "description": "技術面接 / 最終 / 厳しめ / IT製品 / 複合パネル",
    },
    {
        "case_id": 12,
        "format": "technical",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "biz_general",
        "interviewer": "hr",
        "description": "技術面接 / 中盤 / 標準 / 総合職 / 人事",
    },
    {
        "case_id": 13,
        "format": "life_history",
        "stage": "early",
        "strictness": "supportive",
        "role_track": "biz_general",
        "interviewer": "executive",
        "description": "人生史面接 / 早期段階 / サポート / 総合職 / 役員",
    },
    {
        "case_id": 14,
        "format": "life_history",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "consulting",
        "interviewer": "mixed_panel",
        "description": "人生史面接 / 中盤 / 標準 / コンサル / 複合パネル",
    },
    {
        "case_id": 15,
        "format": "life_history",
        "stage": "final",
        "strictness": "strict",
        "role_track": "it_product",
        "interviewer": "hr",
        "description": "人生史面接 / 最終 / 厳しめ / IT製品 / 人事",
    },
    {
        "case_id": 16,
        "format": "life_history",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "data_ai",
        "interviewer": "line_manager",
        "description": "人生史面接 / 中盤 / 標準 / データ AI / 現場管理職",
    },
    # --- strictness 差の単離 (ケース 17-19): 同条件で strictness だけ変化 ---
    {
        "case_id": 17,
        "format": "standard_behavioral",
        "stage": "mid",
        "strictness": "supportive",
        "role_track": "it_product",
        "interviewer": "hr",
        "description": "strictness 差 [supportive] 行動面接 / 中盤 / IT製品 / 人事",
    },
    {
        "case_id": 18,
        "format": "standard_behavioral",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "it_product",
        "interviewer": "hr",
        "description": "strictness 差 [standard] 行動面接 / 中盤 / IT製品 / 人事",
    },
    {
        "case_id": 19,
        "format": "standard_behavioral",
        "stage": "mid",
        "strictness": "strict",
        "role_track": "it_product",
        "interviewer": "hr",
        "description": "strictness 差 [strict] 行動面接 / 中盤 / IT製品 / 人事",
    },
    # --- interviewer 差の単離 (ケース 20-23): 同条件で interviewer だけ変化 ---
    {
        "case_id": 20,
        "format": "case",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "consulting",
        "interviewer": "hr",
        "description": "interviewer 差 [hr] ケース面接 / 中盤 / 標準 / コンサル",
    },
    {
        "case_id": 21,
        "format": "case",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "consulting",
        "interviewer": "line_manager",
        "description": "interviewer 差 [line_manager] ケース面接 / 中盤 / 標準 / コンサル",
    },
    {
        "case_id": 22,
        "format": "case",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "consulting",
        "interviewer": "executive",
        "description": "interviewer 差 [executive] ケース面接 / 中盤 / 標準 / コンサル",
    },
    {
        "case_id": 23,
        "format": "case",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "consulting",
        "interviewer": "mixed_panel",
        "description": "interviewer 差 [mixed_panel] ケース面接 / 中盤 / 標準 / コンサル",
    },
    # --- role_track 差 (ケース 24): 技術系追加 ---
    {
        "case_id": 24,
        "format": "technical",
        "stage": "mid",
        "strictness": "standard",
        "role_track": "frontend_engineer",
        "interviewer": "line_manager",
        "description": "role_track 差 [frontend_engineer] 技術面接 / 中盤 / 標準 / 現場管理職",
    },
]

assert len(HARNESS_CASES) == 24, f"HARNESS_CASES should have 24 entries, got {len(HARNESS_CASES)}"
assert [c["case_id"] for c in HARNESS_CASES] == list(range(1, 25)), "case_id must be 1-24 in order"


# ---------------------------------------------------------------------------
# role_track → selected_role のマッピング
# ---------------------------------------------------------------------------

_ROLE_TRACK_TO_ROLE: dict[str, str] = {
    "biz_general": "総合職（営業・企画）",
    "it_product": "ITプロダクトエンジニア",
    "consulting": "コンサルタント",
    "frontend_engineer": "フロントエンドエンジニア",
    "data_ai": "データサイエンティスト",
    "backend_engineer": "バックエンドエンジニア",
    "infra_platform": "SRE・インフラエンジニア",
    "product_manager": "プロダクトマネージャー",
    "research_specialist": "リサーチャー・専門職",
    "quant_finance": "クオンツアナリスト",
}

_ROLE_TRACK_TO_ACADEMIC: dict[str, str] = {
    "biz_general": "経営学部でマーケティング論を学んだ。卒論は消費者購買行動の分析。",
    "it_product": "情報工学専攻でソフトウェア設計を学んだ。研究室では Web サービス開発に取り組んだ。",
    "consulting": "経済学部でミクロ経済と統計分析を学んだ。ゼミでは産業組織論を扱った。",
    "frontend_engineer": "情報工学専攻で HCI とアクセシビリティを研究した。",
    "data_ai": "数理情報学専攻で機械学習理論を学んだ。卒業研究は自然言語処理の応用。",
    "backend_engineer": "情報工学専攻でネットワークとデータベース設計を学んだ。",
    "infra_platform": "情報工学専攻でクラウドインフラとネットワーク設計を学んだ。",
    "product_manager": "経営工学専攻でシステム設計とプロジェクト管理を学んだ。",
    "research_specialist": "社会学部で質的・量的調査手法を学んだ。卒論は組織文化の分析。",
    "quant_finance": "数学専攻で確率論・統計学を学んだ。金融工学のゼミに所属。",
}

_ROLE_TRACK_TO_GAKUCHIKA: dict[str, str] = {
    "biz_general": "学園祭実行委員会で全体スケジュール管理と予算調整を担当し、例年比 20% のコスト削減を実現した。",
    "it_product": "学内勉強会でアプリ開発プロジェクトを主導し、チームでプロトタイプを公開した。",
    "consulting": "学生団体でスタートアップの課題解決プロジェクトに取り組み、KPI 設計と改善提案を行った。",
    "frontend_engineer": "個人開発でアクセシビリティに配慮したポートフォリオサイトを構築し、Lighthouse スコアを改善した。",
    "data_ai": "研究室プロジェクトでデータパイプラインを構築し、分析速度を大幅に改善した。",
    "backend_engineer": "サークルの管理システムを自作し、メンバー 100 名の情報管理を効率化した。",
    "infra_platform": "大学のインターンで AWS を使ったインフラ構築を経験し、CI/CD パイプラインを整備した。",
    "product_manager": "学内ハッカソンでプロダクトオーナーを担い、ユーザーインタビューから要件定義まで担当した。",
    "research_specialist": "ゼミ論文作成でフィールドワークとインタビュー調査を行い、100 件以上のデータを集めた。",
    "quant_finance": "数学研究会で金融データを使ったポートフォリオ最適化のシミュレーションを実施した。",
}


# ---------------------------------------------------------------------------
# CASE_EXPECTED_DIFFS: 各ケースで期待される振る舞いの差分
# ---------------------------------------------------------------------------
# 評価ハーネスが参照する期待値。「何がこのケースで異なるべきか」を明示する。
# Stage 0-2 の evaluator でこれらを検証する。

CASE_EXPECTED_DIFFS: dict[int, dict[str, Any]] = {
    # strictness 差の単離ケース
    17: {
        "strictness": "supportive",
        "expected_turn_action_hint": "shift",
        "expected_behavior": "サポートモードでは covered トピックへの再深掘りを控え、早めに次のトピックへ移行する",
    },
    18: {
        "strictness": "standard",
        "expected_turn_action_hint": "coverage_based",
        "expected_behavior": "標準モードではカバレッジ状態に基づいて shift / deepen を判断する",
    },
    19: {
        "strictness": "strict",
        "expected_turn_action_hint": "deepen",
        "expected_behavior": "厳しめモードでは covered トピックでも turn_action=deepen を優先する",
    },
    # interviewer 差の単離ケース
    20: {
        "interviewer": "hr",
        "expected_priority_topic_hint": "motivation_fit",
        "expected_behavior": "人事面接官は志望動機・文化適合を優先論点に据える",
    },
    21: {
        "interviewer": "line_manager",
        "expected_depth_focus_hint": ["specificity", "logic"],
        "expected_behavior": "現場管理職は具体性・論理性（specificity / logic）を depth_focus に好む",
    },
    22: {
        "interviewer": "executive",
        "expected_priority_topic_hint": "career_alignment",
        "expected_behavior": "役員面接では career_alignment が priority_topics に含まれる",
    },
    23: {
        "interviewer": "mixed_panel",
        "expected_depth_focus_hint": "consistency",
        "expected_behavior": "複合パネルは consistency を depth_focus に好む",
    },
    # format 差: technical
    9: {
        "format": "technical",
        "expected_must_cover_hint": ["technical_depth", "tradeoff"],
        "expected_behavior": "技術面接では must_cover_topics に technical_depth / tradeoff が含まれる",
    },
    10: {
        "format": "technical",
        "expected_must_cover_hint": ["technical_depth", "tradeoff"],
        "expected_behavior": "技術面接では must_cover_topics に technical_depth / tradeoff が含まれる",
    },
    11: {
        "format": "technical",
        "expected_must_cover_hint": ["technical_depth", "tradeoff"],
        "expected_behavior": "技術面接 / 最終 / 厳しめ: technical_depth と tradeoff が必須カバー",
    },
    24: {
        "format": "technical",
        "role_track": "frontend_engineer",
        "expected_must_cover_hint": ["technical_depth", "tradeoff"],
        "expected_behavior": "フロントエンドエンジニア技術面接: technical_depth / tradeoff 必須",
    },
    # format 差: case
    5: {
        "format": "case",
        "expected_must_cover_hint": ["structured_thinking", "case_fit"],
        "expected_behavior": "ケース面接では structured_thinking / case_fit が優先論点に含まれる",
    },
    6: {
        "format": "case",
        "expected_must_cover_hint": ["structured_thinking"],
        "expected_behavior": "ケース面接では structured_thinking が priority_topics に含まれる",
    },
    7: {
        "format": "case",
        "expected_must_cover_hint": ["structured_thinking"],
        "expected_behavior": "ケース面接 / 最終 / 厳しめ: structured_thinking 必須",
    },
    # format 差: life_history
    13: {
        "format": "life_history",
        "expected_must_cover_hint": ["life_narrative_core", "turning_point_values"],
        "expected_behavior": "人生史面接では life_narrative_core / turning_point_values が含まれる",
    },
    14: {
        "format": "life_history",
        "expected_must_cover_hint": ["life_narrative_core", "turning_point_values"],
        "expected_behavior": "人生史面接では life_narrative_core / turning_point_values が含まれる",
    },
    15: {
        "format": "life_history",
        "expected_must_cover_hint": ["life_narrative_core", "turning_point_values"],
        "expected_behavior": "人生史面接 / 最終 / 厳しめ: life_narrative_core 必須",
    },
    # stage 差: final
    3: {
        "stage": "final",
        "strictness": "strict",
        "expected_behavior": "最終面接 / 厳しめ: 企業理解・キャリア軸の確認を重視する",
    },
    7: {
        "stage": "final",
        "format": "case",
        "strictness": "strict",
        "expected_must_cover_hint": ["structured_thinking"],
        "expected_behavior": "最終ケース面接 / 厳しめ: structured_thinking が最優先",
    },
    11: {
        "stage": "final",
        "format": "technical",
        "strictness": "strict",
        "expected_must_cover_hint": ["technical_depth", "tradeoff"],
        "expected_behavior": "最終技術面接 / 厳しめ: 深度と再現性の確認を重視",
    },
    15: {
        "stage": "final",
        "format": "life_history",
        "strictness": "strict",
        "expected_must_cover_hint": ["life_narrative_core", "turning_point_values"],
        "expected_behavior": "最終人生史面接 / 厳しめ: 価値観の一貫性と動機の核を重点確認",
    },
}


# ---------------------------------------------------------------------------
# ヘルパー: 共通の会話ターン履歴 (turn 評価用ダミー)
# ---------------------------------------------------------------------------

def _make_dummy_conversation(role_track: str, turns: int = 3) -> list[dict[str, str]]:
    """role_track に応じた自然なダミー会話履歴を生成する (turns ペア分)。"""
    role = _ROLE_TRACK_TO_ROLE.get(role_track, "総合職")
    pairs: list[tuple[str, str]] = [
        (
            f"まず、{role}を志望されたきっかけを教えてください。",
            "大学での経験を通じて、この職種に強い関心を持つようになりました。特に課題解決のプロセスに魅力を感じています。",
        ),
        (
            "その経験の中で、最も難しかった課題は何でしたか。",
            "チームの意見が対立した場面でした。関係者全員の視点を整理し、共通ゴールを設定することで解決しました。",
        ),
        (
            "その解決策を取った理由をもう少し詳しく教えてください。",
            "それぞれの立場の懸念を把握することが先決だと考えたからです。感情的な対立を避け、事実ベースで整理しました。",
        ),
        (
            "当社を志望している理由を教えてください。",
            "貴社の事業領域と私の経験・関心が合致していると感じているからです。特に長期的な価値創造に共感しています。",
        ),
    ]
    history: list[dict[str, str]] = []
    for i in range(min(turns, len(pairs))):
        q, a = pairs[i]
        history.append({"role": "assistant", "content": q})
        history.append({"role": "user", "content": a})
    return history


def _make_turn_state(role_track: str, format_: str) -> dict[str, Any]:
    """role_track / format に応じた基本的な turn_state を生成する。"""
    # format に応じた formatPhase
    format_phase_map = {
        "standard_behavioral": "standard_main",
        "case": "case_main",
        "technical": "technical_main",
        "life_history": "life_history_main",
    }
    format_phase = format_phase_map.get(format_, "standard_main")

    # format に応じた opening_topic
    opening_topic_map = {
        "standard_behavioral": "motivation_fit",
        "case": "structured_thinking",
        "technical": "technical_depth",
        "life_history": "life_narrative_core",
    }
    opening_topic = opening_topic_map.get(format_, "motivation_fit")

    # format に応じた must_cover_topics
    must_cover_map = {
        "standard_behavioral": ["motivation_fit", "role_understanding"],
        "case": ["structured_thinking", "case_fit", "motivation_fit"],
        "technical": ["technical_depth", "tradeoff", "reproducibility"],
        "life_history": ["life_narrative_core", "turning_point_values", "motivation_bridge"],
    }
    must_cover = must_cover_map.get(format_, ["motivation_fit"])

    interview_plan = {
        "interview_type": "new_grad_behavioral",
        "priority_topics": [opening_topic],
        "opening_topic": opening_topic,
        "must_cover_topics": must_cover,
        "risk_topics": ["credibility_check"],
        "suggested_timeflow": ["導入", opening_topic, "企業理解", "締め"],
    }

    return {
        "currentStage": "opening",
        "totalQuestionCount": 3,
        "stageQuestionCounts": {
            "industry_reason": 0,
            "role_reason": 0,
            "opening": 1,
            "experience": 1,
            "company_understanding": 0,
            "motivation_fit": 1,
        },
        "completedStages": ["opening"],
        "lastQuestionFocus": "志望動機の核",
        "nextAction": "ask",
        "phase": "turn",
        "formatPhase": format_phase,
        "coveredTopics": [opening_topic],
        "remainingTopics": [t for t in must_cover if t != opening_topic],
        "coverageState": [
            {
                "topic": opening_topic,
                "status": "covered",
                "requiredChecklist": ["company_reason"],
                "passedChecklistKeys": ["company_reason"],
                "deterministicCoveragePassed": True,
                "llmCoverageHint": "strong",
                "deepeningCount": 1,
                "lastCoveredTurnId": "turn-1",
            }
        ],
        "recentQuestionSummariesV2": [
            {
                "intentKey": f"{opening_topic}:reason_check",
                "normalizedSummary": f"{opening_topic} の基本確認",
                "topic": opening_topic,
                "followupStyle": "reason_check",
                "turnId": "turn-1",
            }
        ],
        "interviewPlan": interview_plan,
    }


# ---------------------------------------------------------------------------
# 公開 API: make_start_payload / make_turn_payload / make_feedback_payload
# ---------------------------------------------------------------------------

def make_start_payload(case_id: int) -> InterviewStartRequest:
    """ケース ID から InterviewStartRequest を生成する。

    企業情報は架空 5 社をローテーション。
    role_track / format / stage / strictness / interviewer はケース定義に従う。
    """
    case = next(c for c in HARNESS_CASES if c["case_id"] == case_id)
    company = _company(case_id)
    role_track = case["role_track"]

    return InterviewStartRequest(
        company_name=company["name"],
        company_summary=company["summary"],
        motivation_summary=(
            f"{company['name']}の事業内容に共感し、自分の経験を活かせると考えています。"
            f"特に {company['industry']} 領域での課題解決に携わりたいです。"
        ),
        gakuchika_summary=_ROLE_TRACK_TO_GAKUCHIKA.get(role_track, "学生団体で運営改善を担当した。"),
        academic_summary=_ROLE_TRACK_TO_ACADEMIC.get(role_track, "大学でゼミに所属し卒論を執筆した。"),
        research_summary=None,
        es_summary=(
            f"{_ROLE_TRACK_TO_ROLE.get(role_track, '総合職')}として貢献できる強みを"
            "ES で整理して訴求している。課題整理力と実行力を中心に記述した。"
        ),
        selected_industry=company["industry"],
        selected_role=_ROLE_TRACK_TO_ROLE.get(role_track, "総合職"),
        selected_role_source="application_job_type",
        role_track=role_track,
        interview_format=case["format"],
        selection_type="fulltime",
        interview_stage=case["stage"],
        interviewer_type=case["interviewer"],
        strictness_mode=case["strictness"],
    )


def make_turn_payload(case_id: int, conversation_turns: int = 3) -> InterviewTurnRequest:
    """ケース ID から InterviewTurnRequest を生成する。

    conversation_turns 分のダミー会話履歴を含む。
    turn_state は format / role_track に対応した基本構成を使用する。
    """
    case = next(c for c in HARNESS_CASES if c["case_id"] == case_id)
    company = _company(case_id)
    role_track = case["role_track"]
    format_ = case["format"]

    return InterviewTurnRequest(
        company_name=company["name"],
        company_summary=company["summary"],
        motivation_summary=(
            f"{company['name']}の事業内容に共感し、自分の経験を活かせると考えています。"
            f"特に {company['industry']} 領域での課題解決に携わりたいです。"
        ),
        gakuchika_summary=_ROLE_TRACK_TO_GAKUCHIKA.get(role_track, "学生団体で運営改善を担当した。"),
        academic_summary=_ROLE_TRACK_TO_ACADEMIC.get(role_track, "大学でゼミに所属し卒論を執筆した。"),
        research_summary=None,
        es_summary=(
            f"{_ROLE_TRACK_TO_ROLE.get(role_track, '総合職')}として貢献できる強みを"
            "ES で整理して訴求している。課題整理力と実行力を中心に記述した。"
        ),
        selected_industry=company["industry"],
        selected_role=_ROLE_TRACK_TO_ROLE.get(role_track, "総合職"),
        selected_role_source="application_job_type",
        role_track=role_track,
        interview_format=format_,
        selection_type="fulltime",
        interview_stage=case["stage"],
        interviewer_type=case["interviewer"],
        strictness_mode=case["strictness"],
        conversation_history=_make_dummy_conversation(role_track, conversation_turns),
        turn_state=_make_turn_state(role_track, format_),
    )


def make_feedback_payload(case_id: int) -> InterviewFeedbackRequest:
    """ケース ID から InterviewFeedbackRequest を生成する。"""
    case = next(c for c in HARNESS_CASES if c["case_id"] == case_id)
    company = _company(case_id)
    role_track = case["role_track"]
    format_ = case["format"]
    opening_topic_map = {
        "standard_behavioral": "motivation_fit",
        "case": "structured_thinking",
        "technical": "technical_depth",
        "life_history": "life_narrative_core",
    }
    opening_topic = opening_topic_map.get(format_, "motivation_fit")

    turn_events = [
        {
            "turn_id": f"turn-{i + 1}",
            "question": conv["content"],
            "answer": "",
            "topic": opening_topic,
            "coverage_checklist_snapshot": {
                "missingChecklistKeys": [] if i > 0 else ["company_compare", "decision_axis"],
            },
        }
        for i, conv in enumerate(
            _make_dummy_conversation(role_track, 3)
        )
        if conv["role"] == "assistant"
    ]

    return InterviewFeedbackRequest(
        company_name=company["name"],
        company_summary=company["summary"],
        motivation_summary=(
            f"{company['name']}の事業内容に共感し、自分の経験を活かせると考えています。"
            f"特に {company['industry']} 領域での課題解決に携わりたいです。"
        ),
        gakuchika_summary=_ROLE_TRACK_TO_GAKUCHIKA.get(role_track, "学生団体で運営改善を担当した。"),
        academic_summary=_ROLE_TRACK_TO_ACADEMIC.get(role_track, "大学でゼミに所属し卒論を執筆した。"),
        research_summary=None,
        es_summary=(
            f"{_ROLE_TRACK_TO_ROLE.get(role_track, '総合職')}として貢献できる強みを"
            "ES で整理して訴求している。課題整理力と実行力を中心に記述した。"
        ),
        selected_industry=company["industry"],
        selected_role=_ROLE_TRACK_TO_ROLE.get(role_track, "総合職"),
        selected_role_source="application_job_type",
        role_track=role_track,
        interview_format=format_,
        selection_type="fulltime",
        interview_stage=case["stage"],
        interviewer_type=case["interviewer"],
        strictness_mode=case["strictness"],
        conversation_history=_make_dummy_conversation(role_track, 3),
        turn_state=_make_turn_state(role_track, format_),
        turn_events=turn_events,
    )


# ---------------------------------------------------------------------------
# pytest fixture: parametrize 用
# ---------------------------------------------------------------------------

@pytest.fixture(params=range(1, 25), ids=[f"case_{i}" for i in range(1, 25)])
def harness_case(request: pytest.FixtureRequest) -> dict[str, Any]:
    """全 24 ケースを順番にパラメータ化する pytest fixture。

    各テスト関数で `harness_case` fixture を受け取ると 24 回実行される。
    返値はケース定義 dict (case_id, format, stage, strictness, role_track, interviewer, description)。
    """
    case_id: int = request.param
    return next(c for c in HARNESS_CASES if c["case_id"] == case_id)


@pytest.fixture(params=range(1, 25), ids=[f"case_{i}" for i in range(1, 25)])
def harness_start_payload(request: pytest.FixtureRequest) -> InterviewStartRequest:
    """全 24 ケースの InterviewStartRequest を parametrize する pytest fixture。"""
    return make_start_payload(request.param)


@pytest.fixture(params=range(1, 25), ids=[f"case_{i}" for i in range(1, 25)])
def harness_turn_payload(request: pytest.FixtureRequest) -> InterviewTurnRequest:
    """全 24 ケースの InterviewTurnRequest を parametrize する pytest fixture。"""
    return make_turn_payload(request.param)


@pytest.fixture(params=range(1, 25), ids=[f"case_{i}" for i in range(1, 25)])
def harness_feedback_payload(request: pytest.FixtureRequest) -> InterviewFeedbackRequest:
    """全 24 ケースの InterviewFeedbackRequest を parametrize する pytest fixture。"""
    return make_feedback_payload(request.param)
