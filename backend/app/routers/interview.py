import asyncio
import json
import re
from typing import Any, AsyncGenerator, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.limiter import limiter
from app.prompts.notion_registry import get_managed_prompt_content
from app.utils.llm import (
    PromptSafetyError,
    call_llm_streaming_fields,
    sanitize_prompt_input,
    sanitize_user_prompt_text,
)
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/interview", tags=["interview"])

ROLE_TRACKS = {
    "biz_general",
    "it_product",
    "consulting",
    "research_specialist",
    "quant_finance",
}
INTERVIEW_FORMATS = {
    "standard_behavioral",
    "case",
    "technical",
    "life_history",
}
# 旧保存値・旧API → 正規化（UIは4方式のみ）
_LEGACY_INTERVIEW_FORMAT_MAP = {
    "discussion": "life_history",
    "presentation": "life_history",
}
SELECTION_TYPES = {"internship", "fulltime"}
INTERVIEW_STAGES = {"early", "mid", "final"}
INTERVIEWER_TYPES = {"hr", "line_manager", "executive", "mixed_panel"}
STRICTNESS_MODES = {"supportive", "standard", "strict"}

LEGACY_STAGE_ORDER = [
    "industry_reason",
    "role_reason",
    "opening",
    "experience",
    "company_understanding",
    "motivation_fit",
    "feedback",
]
QUESTION_STAGE_ORDER = LEGACY_STAGE_ORDER[:-1]
LEGACY_STAGE_LABELS = {
    "industry_reason": "業界志望理由",
    "role_reason": "職種志望理由",
    "opening": "導入・人物把握",
    "experience": "経験・ガクチカ",
    "company_understanding": "企業理解",
    "motivation_fit": "志望動機・適合",
    "feedback": "最終講評",
}
ROLE_TRACK_KEYWORDS = {
    "biz_general": ["総合職", "営業", "企画", "コーポレート", "事務"],
    "it_product": ["IT", "エンジニア", "PM", "PdM", "DX", "プロダクト"],
    "consulting": ["コンサル", "戦略", "業務", "ITコンサル"],
    "research_specialist": ["研究", "リサーチ", "シンクタンク", "専門職"],
    "quant_finance": ["クオンツ", "数理", "アクチュアリー", "金融工学"],
}

_PLAN_FALLBACK = """あなたは新卒採用の面接設計担当です。応募者情報と企業情報を読み、この模擬面接で確認すべき論点の優先順位を決めてください。

## 面接前提
- 応募職種: {selected_role_line}
- 職種分類: {role_track}
- 面接方式: {interview_format}
- 選考種別: {selection_type}
- 面接段階: {interview_stage}
- 面接官タイプ: {interviewer_type}
- 厳しさ: {strictness_mode}
- role_track: {role_track}
- interview_format: {interview_format}
- selection_type: {selection_type}
- interview_stage: {interview_stage}
- interviewer_type: {interviewer_type}
- strictness_mode: {strictness_mode}
- academic_summary: {academic_summary}
- research_summary: {research_summary}
- academic_summary: {academic_summary}
- research_summary: {research_summary}

## 企業
- 企業名: {company_name}
- 企業情報: {company_summary}

## 志望動機
{motivation_summary}

## ガクチカ
{gakuchika_summary}

## academic_summary
{academic_summary}

## 学業 / ゼミ / 卒論
{academic_summary}

## 研究
{research_summary}

## ES
{es_summary}

## 補足
{materials_section}

## タスク
- この会社・この職種・この面接方式の新卒面接として、最初に確認すべき論点を決める
- 面接全体で必ず触れるべき論点を整理する
- generic な志望理由、職種理解不足、経験との接続不足、一貫性の弱さ、誇張リスクなどの懸念論点も抽出する
- academic_summary が強い候補者なら academic_application を優先論点に含めてよい
- research_summary が強い候補者なら research_application を優先論点に含めてよい
- interview_format=case の場合は、通常面接の論点だけで埋めず、case_fit / structured_thinking を優先論点に含めてよい
- interview_format=technical の場合は、technical_depth / tradeoff / reproducibility を優先論点に含め、数字当てや暗記確認に寄せない
- interview_format=life_history の場合は、life_narrative_core / turning_point_values / motivation_bridge（自己理解と一貫性）を優先論点に含め、ケース式の構造化論点だけで埋めない
- 出力は面接進行計画のみで、質問文は作らない

## 出力形式
{{
  "interview_type": "new_grad_behavioral|new_grad_case|new_grad_technical|new_grad_final",
  "priority_topics": ["..."],
  "opening_topic": "...",
  "must_cover_topics": ["..."],
  "risk_topics": ["..."],
  "suggested_timeflow": ["導入", "論点1", "論点2", "締め"]
}}"""

_OPENING_FALLBACK = """あなたは新卒採用の面接官です。面接計画に従って、最初の面接質問を 1 問だけ作ってください。

## 面接前提
- 応募職種: {selected_role_line}
- 職種分類: {role_track}
- 面接方式: {interview_format}
- 選考種別: {selection_type}
- 面接段階: {interview_stage}
- 面接官タイプ: {interviewer_type}
- 厳しさ: {strictness_mode}
- role_track: {role_track}
- interview_format: {interview_format}
- selection_type: {selection_type}
- interview_stage: {interview_stage}
- interviewer_type: {interviewer_type}
- strictness_mode: {strictness_mode}

## 企業
- 企業名: {company_name}
- 企業情報: {company_summary}

## interview_plan
{interview_plan}
## interview_plan: {interview_plan}
- priority_topics: {priority_topics}
- opening_topic: {opening_topic}

## 志望動機
{motivation_summary}

## ガクチカ
{gakuchika_summary}

## 学業 / ゼミ / 卒論
{academic_summary}

## 研究
{research_summary}

## ES
{es_summary}

## 補足
{materials_section}

## ルール
- opening_topic に対応する質問を 1 問だけ返す
- interview_format=standard_behavioral の場合は、1〜2分で答えやすい導入質問にする
- interview_format=case の場合は、ケース前提の最初の問いにする
- interview_format=technical の場合は、専門性確認の導入質問にする（設計判断・前提・トレードオフが話せる題材を選ばせる）
- interview_format=life_history の場合は、転機・価値観・行動の一貫性を見る導入質問にする（プレゼン発表の要約に限定しない）
- 最初から細かく深掘りしすぎない
- 実際の面接導入として自然な 1 文にする
- interview_setup_note には、今回の面接の見どころや主題を一言で示す
- `question` は空文字にしない
- `focus` は今回の確認意図を短く表す
- `turn_meta` は topic / turn_action / focus_reason / depth_focus / followup_style / should_move_next を必ず埋める

## 出力形式
{{
  "question": "最初の面接質問",
  "question_stage": "opening",
  "focus": "志望理由の核",
  "interview_setup_note": "今回は志望理由の核と、職種理解を中心に見ます",
  "turn_meta": {{
    "topic": "motivation_fit",
    "turn_action": "ask",
    "focus_reason": "初回導入",
    "depth_focus": "company_fit",
    "followup_style": "industry_reason_check",
    "should_move_next": false
  }}
}}"""

_TURN_FALLBACK = """あなたは新卒採用の面接官です。会話履歴を読み、次の面接質問を 1 問だけ作ってください。

## 面接前提
- 応募職種: {selected_role_line}
- 職種分類: {role_track}
- 面接方式: {interview_format}
- 選考種別: {selection_type}
- 面接段階: {interview_stage}
- 面接官タイプ: {interviewer_type}
- 厳しさ: {strictness_mode}
- role_track: {role_track}
- interview_format: {interview_format}
- selection_type: {selection_type}
- interview_stage: {interview_stage}
- interviewer_type: {interviewer_type}
- strictness_mode: {strictness_mode}

## 企業
- 企業名: {company_name}
- 企業情報: {company_summary}

## interview_plan
{interview_plan}
## priority_topics
{priority_topics}
## interview_plan: {interview_plan}

## 会話履歴
{conversation_text}

## 直近の要点
- 前回質問: {last_question}
- 前回回答: {last_answer}
- 直前論点: {last_topic}

## coveredTopics
{coveredTopics}

## remainingTopics
{remainingTopics}

## coverage_state
{coverage_state}

## recent_question_summaries_v2
{recent_question_summaries_v2}

## format_phase
{format_phase}

## turn_events
{turn_events}

## ルール
- 直前回答を深掘りするか、次の論点へ移るかを判断する
- 質問は 1 問だけ
- 同じ意味の質問を繰り返さない
- `intent_key` は topic + followup_style 単位で安定させる
- 1ターンで深める観点は 1 つだけにする
- interview_format=case の場合は、ケースの構造化を崩す問いを避け、仮説の更新と優先順位を確認する深掘りを優先する
- interview_format=technical の場合は、正確性・前提確認・説明の段階化を崩さず、暗記丸暗記や数字当てを避ける
- interview_format=life_history の場合は、ストーリーの一貫性・自己理解の深さを確認し、志望動機の丸写しやケース論点へのすり替えを避ける
- `question` は空文字にしない
- `focus` は今回の深掘り意図を短く表す
- `plan_progress` には今回までに確認済みの論点と残り論点を配列で入れる
- `turn_meta` は topic / turn_action / focus_reason / depth_focus / followup_style / should_move_next / intent_key を必ず埋める

## 出力形式
{{
  "question": "次の面接質問",
  "question_stage": "opening|experience|company_understanding|motivation_fit",
  "focus": "今回の狙い",
  "turn_meta": {{
    "topic": "motivation_fit",
    "turn_action": "deepen|shift",
    "focus_reason": "なぜこの質問をするか",
    "depth_focus": "company_fit|role_fit|specificity|logic|persuasiveness|consistency|credibility",
    "followup_style": "position_check|obstacle_check|reason_check|alternative_check|evidence_check|involvement_check|conflict_check|strength_check|reflection_check|transfer_check|theme_choice_check|issue_awareness_check|evidence_reading_check|academic_value_check|social_value_check|technical_difficulty_check|method_reason_check|future_research_check|business_application_check|industry_reason_check|company_reason_check|company_compare_check|role_reason_check|future_check|gap_check|why_now_check|strength_origin_check|weakness_control_check|setback_check|conflict_style_check|stress_check|value_change_check",
    "intent_key": "motivation_fit:company_reason_check",
    "should_move_next": false
  }}
}}"""

_CONTINUE_FALLBACK = """あなたは新卒採用の面接官です。前回の最終講評を踏まえて、面接対策を続けるための次の質問を 1 問だけ作ってください。

## 面接前提
- 応募職種: {selected_role_line}
- 職種分類: {role_track}
- 面接方式: {interview_format}
- 選考種別: {selection_type}
- 面接段階: {interview_stage}
- 面接官タイプ: {interviewer_type}
- 厳しさ: {strictness_mode}
- role_track: {role_track}
- interview_format: {interview_format}
- selection_type: {selection_type}
- interview_stage: {interview_stage}
- interviewer_type: {interviewer_type}
- strictness_mode: {strictness_mode}

## 企業
- 企業名: {company_name}
- 企業情報: {company_summary}

## 面接計画
{interview_plan}

## 会話履歴
{conversation_text}

## 直近の最終講評
{latest_feedback_summary}

## ルール
- 講評の `next_preparation` と `improvements` のうち優先度が高いものから 1 つ選んで深掘りする
- `question_stage` は `experience` / `company_understanding` / `motivation_fit` のいずれか
- `transition_line` は「最終講評を踏まえて、次は○○についてさらに伺います。」の形で返す
- 質問は 1 問だけ、学生が答えやすい自然な日本語にする
- `question` は空文字にしない
- `transition_line` は自然な再開文にする
- `turn_meta` は topic / turn_action / focus_reason / depth_focus / followup_style / should_move_next を必ず埋める

## 出力形式
{{
  "question": "次の面接質問",
  "focus": "今回の狙い",
  "question_stage": "experience|company_understanding|motivation_fit",
  "transition_line": "最終講評を踏まえて、次は○○についてさらに伺います。",
  "turn_meta": {{
    "topic": "motivation_fit",
    "turn_action": "shift",
    "focus_reason": "講評の改善点に基づく",
    "depth_focus": "logic",
    "followup_style": "future_check",
    "should_move_next": false
  }}
}}"""

_FEEDBACK_FALLBACK = """あなたは新卒採用の面接官です。会話履歴を読み、企業特化模擬面接の最終講評を構造化して返してください。

## 面接前提
- 応募職種: {selected_role_line}
- 職種分類: {role_track}
- 面接方式: {interview_format}
- 選考種別: {selection_type}
- 面接段階: {interview_stage}
- 面接官タイプ: {interviewer_type}
- 厳しさ: {strictness_mode}
- role_track: {role_track}
- interview_format: {interview_format}
- selection_type: {selection_type}
- interview_stage: {interview_stage}
- interviewer_type: {interviewer_type}
- strictness_mode: {strictness_mode}

## 企業
- 企業名: {company_name}
- 企業情報: {company_summary}

## 面接計画
{interview_plan}

## 会話履歴
{conversation_text}

## turn_events
{turn_events}

## 評価観点
- company_fit
- role_fit
- specificity
- logic
- persuasiveness
- consistency
- credibility

## 方式別の評価の重み（7軸は共通だが、講評で触れる観点の優先を変える）
- interview_format=standard_behavioral: company_fit / consistency / specificity を重視
- interview_format=case: logic / persuasiveness（仮説と根拠）を重視
- interview_format=technical: specificity / credibility（前提・再現性）を重視
- interview_format=life_history: consistency / persuasiveness（価値観と行動のつながり）を重視

## ルール
- `overall_comment` は自然な日本語で総評にする
- 良かった点は最大 3 件
- 改善点は最大 3 件
- `consistency_risks` は最大 3 件
- `improved_answer` は応募者がそのまま言いやすい 120〜220 字
- `next_preparation` は次に準備すべき論点を最大 3 件
- `premise_consistency` は 0〜100
- `overall_comment` は総評を1段落でまとめる
- `scores` は 7 軸すべてを 0〜5 で埋める
- `strengths` / `improvements` / `consistency_risks` / `next_preparation` は空配列可だが key 自体は必ず返す
- `weakest_question_type` は最も弱い設問タイプを 1 つ返す
- `weakest_turn_id`, `weakest_question_snapshot`, `weakest_answer_snapshot` を必ず返す
- 最弱設問には「未充足 checklist」が何だったかを踏まえて講評を書く
- `improved_answer` は空文字可だが key 自体は必ず返す

## 出力形式
{{
  "overall_comment": "総評",
  "scores": {{
    "company_fit": 0,
    "role_fit": 0,
    "specificity": 0,
    "logic": 0,
    "persuasiveness": 0,
    "consistency": 0,
    "credibility": 0
  }},
  "strengths": ["良かった点"],
  "improvements": ["改善点"],
  "consistency_risks": ["一貫性の弱い点"],
  "weakest_question_type": "motivation|gakuchika|academic|research|personal|career|case|life_history",
  "weakest_turn_id": "turn-3",
  "weakest_question_snapshot": "なぜ当社なのですか。",
  "weakest_answer_snapshot": "事業に魅力を感じたからです。",
  "improved_answer": "改善回答例",
  "next_preparation": ["次に準備すべき論点"],
  "premise_consistency": 0
}}"""

INTERVIEW_TURN_META_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "topic": {"type": "string", "description": "このターンで扱う論点名"},
        "turn_action": {
            "type": "string",
            "enum": ["ask", "deepen", "shift"],
            "description": "新規質問、深掘り、次論点への移動",
        },
        "focus_reason": {"type": "string", "description": "なぜこの質問を行うか"},
        "depth_focus": {
            "type": "string",
            "enum": [
                "company_fit",
                "role_fit",
                "specificity",
                "logic",
                "persuasiveness",
                "consistency",
                "credibility",
            ],
        },
        "followup_style": {"type": "string", "description": "追質問スタイル"},
        "intent_key": {"type": "string", "description": "同義質問抑止に使う安定キー"},
        "should_move_next": {"type": "boolean"},
    },
    "required": [
        "topic",
        "turn_action",
        "focus_reason",
        "depth_focus",
        "followup_style",
        "intent_key",
        "should_move_next",
    ],
}

INTERVIEW_PLAN_PROGRESS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "covered_topics": {"type": "array", "items": {"type": "string"}},
        "remaining_topics": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["covered_topics", "remaining_topics"],
}

INTERVIEW_SCORE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "company_fit": {"type": "integer", "minimum": 0, "maximum": 5},
        "role_fit": {"type": "integer", "minimum": 0, "maximum": 5},
        "specificity": {"type": "integer", "minimum": 0, "maximum": 5},
        "logic": {"type": "integer", "minimum": 0, "maximum": 5},
        "persuasiveness": {"type": "integer", "minimum": 0, "maximum": 5},
        "consistency": {"type": "integer", "minimum": 0, "maximum": 5},
        "credibility": {"type": "integer", "minimum": 0, "maximum": 5},
    },
    "required": [
        "company_fit",
        "role_fit",
        "specificity",
        "logic",
        "persuasiveness",
        "consistency",
        "credibility",
    ],
}

INTERVIEW_PLAN_SCHEMA = {
    "name": "interview_plan",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "interview_type": {"type": "string", "description": "面接タイプ識別子"},
            "priority_topics": {"type": "array", "items": {"type": "string"}},
            "opening_topic": {"type": "string", "description": "最初に扱う論点"},
            "must_cover_topics": {"type": "array", "items": {"type": "string"}},
            "risk_topics": {"type": "array", "items": {"type": "string"}},
            "suggested_timeflow": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "interview_type",
            "priority_topics",
            "opening_topic",
            "must_cover_topics",
            "risk_topics",
            "suggested_timeflow",
        ],
    },
}

INTERVIEW_OPENING_SCHEMA = {
    "name": "interview_opening",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "question": {"type": "string", "description": "最初の面接質問"},
            "question_stage": {"type": "string", "enum": ["opening"]},
            "focus": {"type": "string", "description": "この質問の狙い"},
            "interview_setup_note": {"type": "string", "description": "今回の面接の見どころ"},
            "turn_meta": INTERVIEW_TURN_META_SCHEMA,
        },
        "required": ["question", "question_stage", "focus", "interview_setup_note", "turn_meta"],
    },
}

INTERVIEW_TURN_SCHEMA = {
    "name": "interview_turn",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "question": {"type": "string"},
            "question_stage": {
                "type": "string",
                "enum": ["opening", "turn", "experience", "company_understanding", "motivation_fit"],
            },
            "focus": {"type": "string"},
            "turn_meta": INTERVIEW_TURN_META_SCHEMA,
            "plan_progress": INTERVIEW_PLAN_PROGRESS_SCHEMA,
        },
        "required": ["question", "question_stage", "focus", "turn_meta", "plan_progress"],
    },
}

INTERVIEW_CONTINUE_SCHEMA = {
    "name": "interview_continue",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "question": {"type": "string"},
            "question_stage": {
                "type": "string",
                "enum": ["experience", "company_understanding", "motivation_fit"],
            },
            "focus": {"type": "string"},
            "transition_line": {"type": "string"},
            "turn_meta": INTERVIEW_TURN_META_SCHEMA,
        },
        "required": ["question", "question_stage", "focus", "transition_line", "turn_meta"],
    },
}

INTERVIEW_FEEDBACK_SCHEMA = {
    "name": "interview_feedback",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "overall_comment": {"type": "string"},
            "scores": INTERVIEW_SCORE_SCHEMA,
            "strengths": {"type": "array", "items": {"type": "string"}},
            "improvements": {"type": "array", "items": {"type": "string"}},
            "consistency_risks": {"type": "array", "items": {"type": "string"}},
            "weakest_question_type": {"type": "string"},
            "weakest_turn_id": {"type": "string"},
            "weakest_question_snapshot": {"type": "string"},
            "weakest_answer_snapshot": {"type": "string"},
            "improved_answer": {"type": "string"},
            "next_preparation": {"type": "array", "items": {"type": "string"}},
            "premise_consistency": {"type": "integer", "minimum": 0, "maximum": 100},
            "satisfaction_score": {"type": "integer", "minimum": 1, "maximum": 5},
        },
        "required": [
            "overall_comment",
            "scores",
            "strengths",
            "improvements",
            "consistency_risks",
            "weakest_question_type",
            "weakest_turn_id",
            "weakest_question_snapshot",
            "weakest_answer_snapshot",
            "improved_answer",
            "next_preparation",
            "premise_consistency",
        ],
    },
}


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class InterviewBaseRequest(BaseModel):
    company_name: str = Field(max_length=200)
    company_summary: str = Field(max_length=4000)
    motivation_summary: Optional[str] = Field(default=None, max_length=4000)
    gakuchika_summary: Optional[str] = Field(default=None, max_length=4000)
    academic_summary: Optional[str] = Field(default=None, max_length=4000)
    research_summary: Optional[str] = Field(default=None, max_length=4000)
    es_summary: Optional[str] = Field(default=None, max_length=4000)
    selected_industry: Optional[str] = Field(default=None, max_length=120)
    selected_role: Optional[str] = Field(default=None, max_length=200)
    selected_role_source: Optional[str] = Field(default=None, max_length=120)
    role_track: Optional[str] = Field(default=None, max_length=40)
    interview_format: Optional[str] = Field(default=None, max_length=40)
    selection_type: Optional[str] = Field(default=None, max_length=20)
    interview_stage: Optional[str] = Field(default=None, max_length=20)
    interviewer_type: Optional[str] = Field(default=None, max_length=20)
    strictness_mode: Optional[str] = Field(default=None, max_length=20)
    seed_summary: Optional[str] = Field(default=None, max_length=4000)


class InterviewStartRequest(InterviewBaseRequest):
    pass


class InterviewTurnRequest(InterviewBaseRequest):
    conversation_history: list[Message]
    turn_state: Optional[dict[str, Any]] = None
    turn_events: Optional[list[dict[str, Any]]] = None


class InterviewFeedbackRequest(InterviewBaseRequest):
    conversation_history: list[Message]
    turn_state: Optional[dict[str, Any]] = None
    turn_events: Optional[list[dict[str, Any]]] = None


class InterviewContinueRequest(InterviewBaseRequest):
    conversation_history: list[Message]
    turn_state: Optional[dict[str, Any]] = None
    latest_feedback: Optional[dict[str, Any]] = None


def _sanitize_optional_text(value: Optional[str], max_length: int) -> Optional[str]:
    if value is None:
        return None
    return sanitize_user_prompt_text(value, max_length=max_length, rich_text=True)


def _sanitize_messages(messages: list[Message]) -> None:
    for message in messages:
        message.content = sanitize_user_prompt_text(message.content, max_length=3000, rich_text=True)


def _sanitize_base_request(payload: InterviewBaseRequest) -> None:
    payload.company_name = sanitize_user_prompt_text(payload.company_name, max_length=200)
    payload.company_summary = sanitize_user_prompt_text(
        payload.company_summary, max_length=4000, rich_text=True
    )
    payload.motivation_summary = _sanitize_optional_text(payload.motivation_summary, 4000)
    payload.gakuchika_summary = _sanitize_optional_text(payload.gakuchika_summary, 4000)
    payload.academic_summary = _sanitize_optional_text(payload.academic_summary, 4000)
    payload.research_summary = _sanitize_optional_text(payload.research_summary, 4000)
    payload.es_summary = _sanitize_optional_text(payload.es_summary, 4000)
    payload.selected_industry = _sanitize_optional_text(payload.selected_industry, 120)
    payload.selected_role = _sanitize_optional_text(payload.selected_role, 200)
    payload.selected_role_source = _sanitize_optional_text(payload.selected_role_source, 120)
    payload.role_track = _sanitize_optional_text(payload.role_track, 40)
    payload.interview_format = _sanitize_optional_text(payload.interview_format, 40)
    payload.selection_type = _sanitize_optional_text(payload.selection_type, 20)
    payload.interview_stage = _sanitize_optional_text(payload.interview_stage, 20)
    payload.interviewer_type = _sanitize_optional_text(payload.interviewer_type, 20)
    payload.strictness_mode = _sanitize_optional_text(payload.strictness_mode, 20)
    payload.seed_summary = _sanitize_optional_text(payload.seed_summary, 4000)


def _normalize_choice(value: Optional[str], allowed: set[str], default: str) -> str:
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed in allowed:
            return trimmed
    return default


def _canonical_interview_format(value: Optional[str]) -> str:
    """Normalize legacy discussion/presentation to life_history for 4-format product."""
    if not isinstance(value, str):
        return "standard_behavioral"
    trimmed = value.strip()
    trimmed = _LEGACY_INTERVIEW_FORMAT_MAP.get(trimmed, trimmed)
    return _normalize_choice(trimmed, INTERVIEW_FORMATS, "standard_behavioral")


def _infer_role_track(selected_role: Optional[str], company_summary: Optional[str], selected_industry: Optional[str]) -> str:
    haystack = " ".join([selected_role or "", company_summary or "", selected_industry or ""])
    for role_track, keywords in ROLE_TRACK_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            return role_track
    return "biz_general"


def _build_setup(payload: InterviewBaseRequest) -> dict[str, Any]:
    role_track = _normalize_choice(
        payload.role_track or _infer_role_track(payload.selected_role, payload.company_summary, payload.selected_industry),
        ROLE_TRACKS,
        "biz_general",
    )
    interview_format = _canonical_interview_format(payload.interview_format)
    selection_type = _normalize_choice(payload.selection_type, SELECTION_TYPES, "fulltime")
    interview_stage = _normalize_choice(payload.interview_stage, INTERVIEW_STAGES, "mid")
    interviewer_type = _normalize_choice(payload.interviewer_type, INTERVIEWER_TYPES, "hr")
    strictness_mode = _normalize_choice(payload.strictness_mode, STRICTNESS_MODES, "standard")
    selected_role_line = (payload.selected_role or "").strip() or "未設定"

    return {
        "selected_industry": (payload.selected_industry or "").strip() or None,
        "selected_role_line": selected_role_line,
        "selected_role_source": (payload.selected_role_source or "").strip() or None,
        "role_track": role_track,
        "interview_format": interview_format,
        "selection_type": selection_type,
        "interview_stage": interview_stage,
        "interviewer_type": interviewer_type,
        "strictness_mode": strictness_mode,
        "selected_role": selected_role_line,
    }


def _format_materials_section(payload: InterviewBaseRequest) -> str:
    return "\n\n".join(
        [
            f"## 志望動機\n{payload.motivation_summary or 'なし'}",
            f"## ガクチカ\n{payload.gakuchika_summary or 'なし'}",
            f"## 学業 / ゼミ / 卒論\n{payload.academic_summary or 'なし'}",
            f"## 研究\n{payload.research_summary or 'なし'}",
            f"## ES\n{payload.es_summary or 'なし'}",
            f"## seed\n{payload.seed_summary or 'なし'}",
        ]
    )


def _format_conversation(conversation_history: list[Message]) -> str:
    if not conversation_history:
        return "まだ会話なし"
    return "\n".join(
        f"{'面接官' if message.role == 'assistant' else '応募者'}: {message.content}"
        for message in conversation_history
    )


def _legacy_stage_for_topic(topic: Optional[str], question_stage: Optional[str] = None) -> str:
    if isinstance(question_stage, str) and question_stage in LEGACY_STAGE_ORDER:
        return question_stage

    normalized = (topic or "").lower()
    if any(key in normalized for key in ["company", "industry", "compare", "fit"]):
        return "company_understanding"
    if any(key in normalized for key in ["role", "skill", "technical"]):
        return "role_reason"
    if any(key in normalized for key in ["experience", "gakuchika", "project"]):
        return "experience"
    if any(key in normalized for key in ["motivation", "career", "future", "why"]):
        return "motivation_fit"
    if normalized in {"opening", "intro", "self_intro"}:
        return "opening"
    return "opening"


def _legacy_stage_status(current: str) -> dict[str, list[str] | str]:
    if current not in LEGACY_STAGE_ORDER:
        current = "opening"
    current_index = LEGACY_STAGE_ORDER.index(current)
    return {
        "current": current,
        "completed": LEGACY_STAGE_ORDER[:current_index],
        "pending": LEGACY_STAGE_ORDER[current_index + 1 :],
    }


def _default_stage_question_counts() -> dict[str, int]:
    return {stage: 0 for stage in QUESTION_STAGE_ORDER}


def _default_turn_state(setup: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    setup = setup or {}
    return {
        "phase": "opening",
        "formatPhase": "opening",
        "currentStage": "opening",
        "questionCount": 0,
        "totalQuestionCount": 0,
        "turnCount": 0,
        "stageQuestionCounts": _default_stage_question_counts(),
        "completedStages": [],
        "coverageState": [],
        "coveredTopics": [],
        "remainingTopics": [],
        "recentQuestionSummaries": [],
        "recentQuestionSummariesV2": [],
        "lastQuestion": None,
        "lastAnswer": None,
        "lastTopic": None,
        "lastQuestionFocus": None,
        "nextAction": "ask",
        "interviewPlan": None,
        "turnMeta": None,
        "roleTrack": setup.get("role_track"),
        "interviewFormat": setup.get("interview_format"),
        "selectionType": setup.get("selection_type"),
        "interviewStage": setup.get("interview_stage"),
        "interviewerType": setup.get("interviewer_type"),
        "strictnessMode": setup.get("strictness_mode"),
        "selectedIndustry": setup.get("selected_industry"),
        "selectedRoleLine": setup.get("selected_role_line"),
        "selectedRoleSource": setup.get("selected_role_source"),
    }


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _checklist_for_topic(topic: str, setup: dict[str, Any]) -> list[str]:
    normalized = topic.lower()
    if setup.get("interview_format") == "case" or "case" in normalized or "structured" in normalized:
        checklist = ["structure", "hypothesis", "prioritization"]
    elif setup.get("interview_format") == "technical" or "technical" in normalized:
        checklist = ["decision_reason", "tradeoff", "reproducibility"]
    elif setup.get("interview_format") == "life_history" or any(
        key in normalized for key in ["narrative", "life_story", "turning", "jisekishi", "自分史"]
    ):
        checklist = ["turning_point", "values", "action_result_link"]
    elif any(key in normalized for key in ["motivation", "company", "compare", "career"]):
        checklist = ["core_reason", "company_reason", "experience_link"]
    elif any(key in normalized for key in ["role", "skill"]):
        checklist = ["role_reason", "evidence", "transfer"]
    else:
        checklist = ["situation", "action", "result", "reproducibility"]

    if setup.get("interview_stage") == "final":
        if "company_compare" not in checklist and any(key in normalized for key in ["motivation", "company", "career"]):
            checklist.extend(["company_compare", "decision_axis", "commitment"])

    return checklist


def _format_phase_for_setup(setup: dict[str, Any]) -> str:
    interview_format = _canonical_interview_format(str(setup.get("interview_format") or "standard_behavioral"))
    if interview_format == "case":
        return "case_main"
    if interview_format == "technical":
        return "technical_main"
    if interview_format == "life_history":
        return "life_history_main"
    return "standard_main"


_LEGACY_FORMAT_PHASE_MAP = {
    "discussion_main": "life_history_main",
    "presentation_main": "life_history_main",
}


def _build_initial_coverage_state(interview_plan: dict[str, Any], setup: dict[str, Any]) -> list[dict[str, Any]]:
    topics = _normalize_string_list(interview_plan.get("must_cover_topics")) or [
        str(interview_plan.get("opening_topic") or "motivation_fit")
    ]
    return [
        {
            "topic": topic,
            "status": "active" if index == 0 else "pending",
            "requiredChecklist": _checklist_for_topic(topic, setup),
            "passedChecklistKeys": [],
            "deterministicCoveragePassed": False,
            "llmCoverageHint": None,
            "deepeningCount": 0,
            "lastCoveredTurnId": None,
        }
        for index, topic in enumerate(topics)
    ]


def _normalize_recent_question_summaries_v2(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        normalized_summary = str(item.get("normalizedSummary") or "").strip()
        if not normalized_summary:
            continue
        items.append(
            {
                "intentKey": str(item.get("intentKey") or "unknown_intent").strip() or "unknown_intent",
                "normalizedSummary": normalized_summary,
                "topic": str(item.get("topic") or "").strip() or None,
                "followupStyle": str(item.get("followupStyle") or "").strip() or None,
                "turnId": str(item.get("turnId") or "").strip() or None,
            }
        )
    return items[-8:]


def _normalize_coverage_state(value: Any, interview_plan: dict[str, Any], setup: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return _build_initial_coverage_state(interview_plan, setup)

    fallback_by_topic = {
        item["topic"]: item for item in _build_initial_coverage_state(interview_plan, setup)
    }
    normalized: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        topic = str(item.get("topic") or "").strip()
        if not topic:
            continue
        fallback = fallback_by_topic.get(topic, {
            "requiredChecklist": _checklist_for_topic(topic, setup),
        })
        status = str(item.get("status") or "pending").strip()
        if status not in {"pending", "active", "covered", "exhausted"}:
            status = "pending"
        normalized.append(
            {
                "topic": topic,
                "status": status,
                "requiredChecklist": _normalize_string_list(item.get("requiredChecklist")) or fallback["requiredChecklist"],
                "passedChecklistKeys": _normalize_string_list(item.get("passedChecklistKeys")),
                "deterministicCoveragePassed": bool(item.get("deterministicCoveragePassed", False)),
                "llmCoverageHint": str(item.get("llmCoverageHint") or "").strip() or None,
                "deepeningCount": int(item.get("deepeningCount", 0) or 0),
                "lastCoveredTurnId": str(item.get("lastCoveredTurnId") or "").strip() or None,
            }
        )

    if not normalized:
        return _build_initial_coverage_state(interview_plan, setup)
    return normalized


def _covered_topics_from_coverage_state(coverage_state: list[dict[str, Any]]) -> list[str]:
    return [
        item["topic"]
        for item in coverage_state
        if item.get("deterministicCoveragePassed") is True
    ]


def _build_recent_question_summary_v2(turn_meta: dict[str, Any], fallback: str, turn_id: str) -> dict[str, Any]:
    return {
        "intentKey": str(turn_meta.get("intent_key") or f"{turn_meta.get('topic') or 'unknown'}:{turn_meta.get('followup_style') or 'reason_check'}"),
        "normalizedSummary": _build_question_summary(turn_meta.get("focus_reason"), fallback),
        "topic": str(turn_meta.get("topic") or "").strip() or None,
        "followupStyle": str(turn_meta.get("followup_style") or "").strip() or None,
        "turnId": turn_id,
    }


def _normalize_interview_plan(value: Any) -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    interview_type = str(data.get("interview_type") or "new_grad_behavioral").strip()
    priority_topics = _normalize_string_list(data.get("priority_topics"))
    if isinstance(data.get("opening_topic"), str) and data["opening_topic"].strip():
        opening_topic = data["opening_topic"].strip()
    else:
        opening_topic = priority_topics[0] if priority_topics else "motivation_fit"
    must_cover_topics = _normalize_string_list(data.get("must_cover_topics")) or [opening_topic]
    risk_topics = _normalize_string_list(data.get("risk_topics"))
    suggested_timeflow = _normalize_string_list(data.get("suggested_timeflow")) or ["導入", "論点1", "論点2", "締め"]
    return {
        "interview_type": interview_type,
        "priority_topics": priority_topics or [opening_topic],
        "opening_topic": opening_topic,
        "must_cover_topics": must_cover_topics,
        "risk_topics": risk_topics,
        "suggested_timeflow": suggested_timeflow,
    }


def _normalize_turn_meta(value: Any, fallback_topic: str = "motivation_fit") -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    topic = str(data.get("topic") or fallback_topic).strip() or fallback_topic
    turn_action = str(data.get("turn_action") or "ask").strip()
    if turn_action not in {"ask", "deepen", "shift"}:
        turn_action = "ask"
    depth_focus = str(data.get("depth_focus") or "logic").strip()
    if depth_focus not in {"company_fit", "role_fit", "specificity", "logic", "persuasiveness", "consistency", "credibility"}:
        depth_focus = "logic"
    followup_style = str(data.get("followup_style") or "reason_check").strip()
    if not followup_style:
        followup_style = "reason_check"
    return {
        "topic": topic,
        "turn_action": turn_action,
        "focus_reason": str(data.get("focus_reason") or "").strip(),
        "depth_focus": depth_focus,
        "followup_style": followup_style,
        "intent_key": str(data.get("intent_key") or f"{topic}:{followup_style}").strip() or f"{topic}:{followup_style}",
        "should_move_next": bool(data.get("should_move_next", False)),
    }


def _normalize_feedback(value: Any) -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    scores = data.get("scores") if isinstance(data.get("scores"), dict) else {}
    normalized_scores = {
        "company_fit": int(scores.get("company_fit", 0) or 0),
        "role_fit": int(scores.get("role_fit", 0) or 0),
        "specificity": int(scores.get("specificity", 0) or 0),
        "logic": int(scores.get("logic", 0) or 0),
        "persuasiveness": int(scores.get("persuasiveness", 0) or 0),
        "consistency": int(scores.get("consistency", 0) or 0),
        "credibility": int(scores.get("credibility", 0) or 0),
    }
    return {
        "overall_comment": str(data.get("overall_comment") or "").strip(),
        "scores": normalized_scores,
        "strengths": _normalize_string_list(data.get("strengths")),
        "improvements": _normalize_string_list(data.get("improvements")),
        "consistency_risks": _normalize_string_list(data.get("consistency_risks")),
        "weakest_question_type": str(data.get("weakest_question_type") or "motivation").strip() or "motivation",
        "weakest_turn_id": str(data.get("weakest_turn_id") or "").strip() or None,
        "weakest_question_snapshot": str(data.get("weakest_question_snapshot") or "").strip() or None,
        "weakest_answer_snapshot": str(data.get("weakest_answer_snapshot") or "").strip() or None,
        "improved_answer": str(data.get("improved_answer") or "").strip(),
        "next_preparation": _normalize_string_list(data.get("next_preparation")),
        "premise_consistency": int(data.get("premise_consistency", 0) or 0),
        "satisfaction_score": int(data.get("satisfaction_score", 0) or 0)
        if data.get("satisfaction_score") is not None
        else None,
    }


def _build_fallback_opening_payload(
    payload: InterviewStartRequest,
    interview_plan: dict[str, Any],
    setup: dict[str, Any],
) -> dict[str, Any]:
    company_name = payload.company_name
    selected_role_line = setup["selected_role_line"]
    interview_format = setup["interview_format"]
    opening_topic = str(interview_plan.get("opening_topic") or "motivation_fit")

    if interview_format == "case":
        return {
            "question": "ケース面接として、ある小売チェーンの売上が前年同期比で10%下がっているとします。まず何をどう切り分けて考えますか。",
            "question_stage": "opening",
            "focus": "構造化と仮説の置き方",
            "interview_setup_note": "今回は論点分解と仮説の置き方を中心に見ます",
            "turn_meta": {
                "topic": opening_topic if opening_topic != "motivation_fit" else "structured_thinking",
                "turn_action": "shift",
                "focus_reason": "ケース面接の基本である論点分解を確認するため",
                "depth_focus": "logic",
                "followup_style": "theme_choice_check",
                "should_move_next": False,
            },
        }

    if interview_format == "technical":
        return {
            "question": f"これまでの開発経験の中で、{selected_role_line}として設計判断が難しかった題材を1つ選び、何をどう設計したかを順に説明してください。",
            "question_stage": "opening",
            "focus": "設計判断の理由",
            "interview_setup_note": "今回は専門性と設計判断の説明力を中心に見ます",
            "turn_meta": {
                "topic": opening_topic if opening_topic != "motivation_fit" else "technical_depth",
                "turn_action": "shift",
                "focus_reason": "技術面接として設計判断の背景と責務を確認するため",
                "depth_focus": "logic",
                "followup_style": "technical_difficulty_check",
                "should_move_next": False,
            },
        }

    if interview_format == "life_history":
        return {
            "question": (
                "これまでの学生生活の中で、自分の価値観や行動のクセがはっきり見えた転機となった出来事を一つ選び、"
                "そのとき何が起き、あなたはどう考えどう動いたかを時系列で教えてください。"
            ),
            "question_stage": "opening",
            "focus": "転機と価値観の一貫性",
            "interview_setup_note": "今回は自分史として、転機・価値観・行動のつながりを中心に見ます",
            "turn_meta": {
                "topic": opening_topic if opening_topic != "motivation_fit" else "life_narrative_core",
                "turn_action": "shift",
                "focus_reason": "自分史面接として、自己理解の核となるエピソードを確認するため",
                "depth_focus": "consistency",
                "followup_style": "value_change_check",
                "should_move_next": False,
            },
        }

    return {
        "question": f"まず、なぜ{company_name}の{selected_role_line}を志望しているのか、これまでの経験とのつながりも含めて教えてください。",
        "question_stage": "opening",
        "focus": "志望理由の核",
        "interview_setup_note": "今回は志望理由の核と職種理解を中心に見ます",
        "turn_meta": {
            "topic": opening_topic,
            "turn_action": "shift",
            "focus_reason": "初回導入として志望理由の核を確認するため",
            "depth_focus": "company_fit",
            "followup_style": "company_reason_check",
            "should_move_next": False,
        },
    }


def _opening_question_matches_format(question: str, interview_format: str) -> bool:
    normalized = question.strip()
    if not normalized:
        return False
    if interview_format == "case":
        return any(keyword in normalized for keyword in ["ケース", "構造化", "仮説", "切り分け", "売上", "要因"])
    if interview_format == "technical":
        return any(keyword in normalized for keyword in ["設計", "実装", "開発", "技術", "アーキテクチャ", "システム"])
    if interview_format == "life_history":
        return any(
            keyword in normalized
            for keyword in ["転機", "価値観", "エピソード", "きっかけ", "自分史", "一貫", "行動", "学生生活"]
        )
    return True


def _fallback_improvement_for_score(score_key: str) -> str:
    mapping = {
        "company_fit": "なぜこの会社なのかを他社比較まで含めて一言で言えるようにする",
        "role_fit": "志望職種で求められる役割と、自分の経験のつながりを具体化する",
        "specificity": "経験を話すときは状況・役割・行動・結果を数値や固有名詞で補強する",
        "logic": "結論から話し、理由と具体例を分けて説明する",
        "persuasiveness": "相手が納得しやすい根拠を先に置き、主張とのつながりを明示する",
        "consistency": "志望理由・経験・将来像のつながりを同じ軸で説明できるようにする",
        "credibility": "自分の関与範囲と再現性を必要以上に大きく見せずに説明する",
    }
    return mapping.get(score_key, "回答の根拠を具体化する")


def _fallback_preparation_for_score(score_key: str, weakest_question_type: str) -> str:
    mapping = {
        "company_fit": "『なぜこの会社か』を競合比較込みで30秒で言えるように整理する",
        "role_fit": "応募職種の役割と必要能力を、自分の経験に引きつけて説明できるようにする",
        "specificity": "代表エピソードを1つ選び、STARで60秒版と120秒版を作る",
        "logic": "結論→理由→具体例の順で話す練習をする",
        "persuasiveness": "主張ごとに根拠を1つずつ添えて話す練習をする",
        "consistency": "志望理由・ガクチカ・将来像の接続を1本のストーリーにまとめる",
        "credibility": "自分の役割・意思決定・成果を誇張なく説明できるよう事実を整理する",
    }
    if weakest_question_type == "case":
        return "ケース面接の基本として、論点分解と優先順位付けの型を3題ほど練習する"
    if weakest_question_type == "life_history":
        return "転機・価値観・具体行動を一本の線でつなぐ60秒版と120秒版の自分史を用意する"
    return mapping.get(score_key, "想定質問への回答を1分で言えるように整理する")


def _enrich_feedback_defaults(
    feedback: dict[str, Any],
    *,
    setup: dict[str, Any],
) -> dict[str, Any]:
    scores = feedback["scores"]
    ordered_score_keys = sorted(scores.keys(), key=lambda key: (scores[key], key))
    weakest_score_key = ordered_score_keys[0] if ordered_score_keys else "logic"

    if not feedback["overall_comment"]:
        feedback["overall_comment"] = (
            f"{setup['interview_format']} 面接として見ると、全体の方向性は大きく外していませんが、"
            f"{weakest_score_key} の観点で説明をもう一段具体化すると通過率を上げやすい状態です。"
        )

    if not feedback["improvements"]:
        feedback["improvements"] = [
            _fallback_improvement_for_score(score_key)
            for score_key in ordered_score_keys[:2]
        ]

    if not feedback["next_preparation"]:
        weakest_question_type = str(feedback.get("weakest_question_type") or "motivation")
        feedback["next_preparation"] = [
            _fallback_preparation_for_score(score_key, weakest_question_type)
            for score_key in ordered_score_keys[:2]
        ]

    if not feedback["consistency_risks"] and scores.get("consistency", 0) <= 4:
        feedback["consistency_risks"] = [
            "志望理由と経験のつながりが弱く見えるため、経験から志望理由への接続を一言で補強してください。"
        ]

    if not feedback["improved_answer"]:
        weakest_question = str(feedback.get("weakest_question_snapshot") or "").strip()
        weakest_answer = str(feedback.get("weakest_answer_snapshot") or "").strip()
        if weakest_question and weakest_answer:
            feedback["improved_answer"] = (
                f"{weakest_question} への回答は、結論を先に示したうえで、"
                "その会社・職種との接点、根拠になる経験、入社後に出したい価値を一文ずつつないで答える。"
            )
        else:
            feedback["improved_answer"] = ""

    feedback["improvements"] = feedback["improvements"][:3]
    feedback["next_preparation"] = feedback["next_preparation"][:3]
    feedback["consistency_risks"] = feedback["consistency_risks"][:3]
    return feedback


def _backfill_feedback_linkage_from_conversation(
    feedback: dict[str, Any],
    conversation_history: list[Message],
) -> dict[str, Any]:
    if (
        feedback.get("weakest_turn_id")
        and feedback.get("weakest_question_snapshot")
        and feedback.get("weakest_answer_snapshot")
    ):
        return feedback

    last_question = next(
        (message.content for message in reversed(conversation_history) if message.role == "assistant"),
        None,
    )
    last_answer = next(
        (message.content for message in reversed(conversation_history) if message.role == "user"),
        None,
    )
    assistant_count = sum(1 for message in conversation_history if message.role == "assistant")

    return {
        **feedback,
        "weakest_turn_id": feedback.get("weakest_turn_id") or (f"turn-{assistant_count}" if assistant_count > 0 else None),
        "weakest_question_snapshot": feedback.get("weakest_question_snapshot") or last_question,
        "weakest_answer_snapshot": feedback.get("weakest_answer_snapshot") or last_answer,
    }


def _normalize_turn_state(value: Optional[dict[str, Any]], setup: dict[str, Any]) -> dict[str, Any]:
    state = _default_turn_state(setup)
    if not isinstance(value, dict):
        state["formatPhase"] = "opening"
        return state

    phase = str(value.get("phase") or "opening").strip()
    if phase not in {"plan", "opening", "turn", "feedback"}:
        phase = "opening"
    state["phase"] = phase
    format_phase = str(value.get("formatPhase") or "").strip()
    format_phase = _LEGACY_FORMAT_PHASE_MAP.get(format_phase, format_phase)
    if format_phase not in {
        "opening",
        "standard_main",
        "case_main",
        "case_closing",
        "technical_main",
        "life_history_main",
        "feedback",
    }:
        format_phase = "opening" if phase == "opening" else _format_phase_for_setup(setup)
    state["formatPhase"] = format_phase

    current_stage = str(value.get("currentStage") or value.get("question_stage") or "opening").strip()
    if current_stage not in LEGACY_STAGE_ORDER:
        current_stage = _legacy_stage_for_topic(value.get("lastTopic"), current_stage)
    state["currentStage"] = current_stage

    for key in ("questionCount", "totalQuestionCount", "turnCount"):
        raw = value.get(key)
        if isinstance(raw, int) and raw >= 0:
            state[key] = raw

    if isinstance(value.get("stageQuestionCounts"), dict):
        counts: dict[str, int] = {}
        for stage in QUESTION_STAGE_ORDER:
            raw = value["stageQuestionCounts"].get(stage, 0)
            counts[stage] = raw if isinstance(raw, int) and raw >= 0 else 0
        state["stageQuestionCounts"] = counts

    state["completedStages"] = [stage for stage in _normalize_string_list(value.get("completedStages")) if stage in QUESTION_STAGE_ORDER]
    state["coverageState"] = _normalize_coverage_state(
        value.get("coverageState"),
        _normalize_interview_plan(value.get("interviewPlan") or value.get("plan")),
        setup,
    )
    state["coveredTopics"] = _normalize_string_list(value.get("coveredTopics")) or _covered_topics_from_coverage_state(state["coverageState"])
    state["remainingTopics"] = _normalize_string_list(value.get("remainingTopics")) or [
        item["topic"] for item in state["coverageState"] if item["topic"] not in state["coveredTopics"]
    ]
    state["recentQuestionSummaries"] = _normalize_string_list(value.get("recentQuestionSummaries"))[-5:]
    state["recentQuestionSummariesV2"] = _normalize_recent_question_summaries_v2(value.get("recentQuestionSummariesV2")) or [
        {
            "intentKey": f"legacy-summary-{index + 1}",
            "normalizedSummary": summary,
            "topic": None,
            "followupStyle": None,
            "turnId": None,
        }
        for index, summary in enumerate(state["recentQuestionSummaries"])
    ]
    state["lastQuestion"] = str(value.get("lastQuestion")).strip() if isinstance(value.get("lastQuestion"), str) and value.get("lastQuestion").strip() else None
    state["lastAnswer"] = str(value.get("lastAnswer")).strip() if isinstance(value.get("lastAnswer"), str) and value.get("lastAnswer").strip() else None
    state["lastTopic"] = str(value.get("lastTopic")).strip() if isinstance(value.get("lastTopic"), str) and value.get("lastTopic").strip() else None
    state["lastQuestionFocus"] = str(value.get("lastQuestionFocus")).strip() if isinstance(value.get("lastQuestionFocus"), str) and value.get("lastQuestionFocus").strip() else None
    next_action = str(value.get("nextAction") or "ask").strip()
    state["nextAction"] = next_action if next_action in {"ask", "feedback"} else "ask"
    state["interviewPlan"] = _normalize_interview_plan(value.get("interviewPlan") or value.get("plan"))
    state["turnMeta"] = _normalize_turn_meta(value.get("turnMeta") or value.get("turn_meta"), state["lastTopic"] or state["interviewPlan"]["opening_topic"])
    return state


def _question_stage_from_turn_meta(turn_meta: dict[str, Any]) -> str:
    topic = turn_meta.get("topic")
    if isinstance(topic, str):
        normalized = topic.lower()
        if any(key in normalized for key in ["company", "industry", "compare"]):
            return "company_understanding"
        if any(key in normalized for key in ["role", "skill", "technical"]):
            return "role_reason"
        if any(key in normalized for key in ["experience", "gakuchika", "project"]):
            return "experience"
        if any(key in normalized for key in ["motivation", "career", "future", "why"]):
            return "motivation_fit"
    return "opening"


def _derive_turn_state_for_question(base: dict[str, Any], turn_meta: dict[str, Any], *, phase: str) -> dict[str, Any]:
    state = {**base}
    legacy_stage = "feedback" if phase == "feedback" else _question_stage_from_turn_meta(turn_meta)
    state["phase"] = phase
    state["formatPhase"] = "feedback" if phase == "feedback" else state.get("formatPhase") or _format_phase_for_setup(state)
    state["currentStage"] = legacy_stage
    state["lastTopic"] = turn_meta.get("topic")
    state["turnMeta"] = turn_meta
    state["lastQuestionFocus"] = turn_meta.get("focus_reason") or state.get("lastQuestionFocus")
    state["nextAction"] = "feedback" if phase == "feedback" else "ask"
    state["turnCount"] = int(state.get("turnCount", 0) or 0) + (0 if phase == "feedback" else 1)
    state["questionCount"] = int(state.get("questionCount", 0) or 0) + (0 if phase == "feedback" else 1)
    state["totalQuestionCount"] = int(state.get("totalQuestionCount", 0) or 0) + (0 if phase == "feedback" else 1)
    if phase != "feedback":
        counts = dict(state.get("stageQuestionCounts") or _default_stage_question_counts())
        counts[legacy_stage] = int(counts.get(legacy_stage, 0) or 0) + 1
        state["stageQuestionCounts"] = counts
    state["completedStages"] = [stage for stage in LEGACY_STAGE_ORDER if stage in LEGACY_STAGE_ORDER[: LEGACY_STAGE_ORDER.index(legacy_stage)]]
    state["stageStatus"] = _legacy_stage_status(legacy_stage)
    return state


def _build_question_summary(text: Optional[str], fallback: str) -> str:
    if not text:
        return fallback
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:60] if compact else fallback


def _build_plan_prompt(payload: InterviewBaseRequest) -> str:
    setup = _build_setup(payload)
    return get_managed_prompt_content("interview.plan", fallback=_PLAN_FALLBACK).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        materials_section=_format_materials_section(payload),
    )


def _build_opening_prompt(payload: InterviewBaseRequest, interview_plan: dict[str, Any]) -> str:
    setup = _build_setup(payload)
    prompt = get_managed_prompt_content("interview.opening", fallback=_OPENING_FALLBACK).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        interview_plan=json.dumps(interview_plan, ensure_ascii=False),
        priority_topics=json.dumps(interview_plan.get("priority_topics", []), ensure_ascii=False),
        opening_topic=str(interview_plan.get("opening_topic") or "motivation_fit"),
        materials_section=_format_materials_section(payload),
    )
    return (
        f"{prompt}\n\n## academic_summary\n{payload.academic_summary or 'なし'}\n"
        f"## opening_topic\n{str(interview_plan.get('opening_topic') or 'motivation_fit')}"
    )


def _build_turn_prompt(
    payload: InterviewBaseRequest,
    interview_plan: dict[str, Any],
    turn_state: dict[str, Any],
    turn_meta: dict[str, Any],
) -> str:
    setup = _build_setup(payload)
    return get_managed_prompt_content("interview.turn", fallback=_TURN_FALLBACK).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        interview_plan=json.dumps(interview_plan, ensure_ascii=False),
        priority_topics=json.dumps(interview_plan.get("priority_topics", []), ensure_ascii=False),
        conversation_text=_format_conversation(payload.conversation_history if isinstance(payload, InterviewTurnRequest) else []),
        last_question=str(turn_state.get("lastQuestion") or ""),
        last_answer=str(turn_state.get("lastAnswer") or ""),
        last_topic=str(turn_state.get("lastTopic") or ""),
        coveredTopics=json.dumps(turn_state.get("coveredTopics") or [], ensure_ascii=False),
        remainingTopics=json.dumps(turn_state.get("remainingTopics") or [], ensure_ascii=False),
        coverage_state=json.dumps(turn_state.get("coverageState") or [], ensure_ascii=False),
        recent_question_summaries_v2=json.dumps(turn_state.get("recentQuestionSummariesV2") or [], ensure_ascii=False),
        format_phase=str(turn_state.get("formatPhase") or "opening"),
        turn_events=json.dumps(
            (payload.turn_events if isinstance(payload, InterviewTurnRequest) else None) or [],
            ensure_ascii=False,
        ),
    )


def _build_feedback_prompt(payload: InterviewFeedbackRequest) -> str:
    setup = _build_setup(payload)
    interview_plan = payload.turn_state.get("interviewPlan") if isinstance(payload.turn_state, dict) else None
    if not isinstance(interview_plan, dict):
        interview_plan = {
            "interview_type": f"new_grad_{setup['interview_format']}",
            "priority_topics": [setup["role_track"]],
            "opening_topic": "motivation_fit",
            "must_cover_topics": ["motivation_fit", "role_understanding"],
            "risk_topics": ["credibility_check"],
            "suggested_timeflow": ["導入", "論点1", "論点2", "締め"],
        }
    return get_managed_prompt_content("interview.feedback", fallback=_FEEDBACK_FALLBACK).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        interview_plan=json.dumps(interview_plan, ensure_ascii=False),
        conversation_text=_format_conversation(payload.conversation_history),
        turn_events=json.dumps(payload.turn_events or [], ensure_ascii=False),
    )


def _build_continue_prompt(payload: InterviewContinueRequest) -> str:
    setup = _build_setup(payload)
    interview_plan = payload.turn_state.get("interviewPlan") if isinstance(payload.turn_state, dict) else None
    if not isinstance(interview_plan, dict):
        interview_plan = {
            "interview_type": f"new_grad_{setup['interview_format']}",
            "priority_topics": [setup["role_track"]],
            "opening_topic": "motivation_fit",
            "must_cover_topics": ["motivation_fit", "role_understanding"],
            "risk_topics": ["credibility_check"],
            "suggested_timeflow": ["導入", "論点1", "論点2", "締め"],
        }
    latest_feedback_summary = json.dumps(payload.latest_feedback or {}, ensure_ascii=False)
    return get_managed_prompt_content("interview.continue", fallback=_CONTINUE_FALLBACK).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        interview_plan=json.dumps(interview_plan, ensure_ascii=False),
        priority_topics=json.dumps(interview_plan.get("priority_topics", []), ensure_ascii=False),
        conversation_text=_format_conversation(payload.conversation_history),
        latest_feedback_summary=latest_feedback_summary,
    )


def _sse_event(event_type: str, payload: dict[str, Any]) -> str:
    body = {"type": event_type, **payload}
    return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"


async def _stream_llm_json_completion(
    *,
    prompt: str,
    user_message: str,
    stream_string_fields: list[str],
    schema_hints: dict[str, Any],
    max_tokens: int,
    temperature: float,
    feature: str,
    json_schema: dict[str, Any] | None = None,
) -> AsyncGenerator[
    tuple[Literal["chunk"], dict[str, str]] | tuple[Literal["done"], dict[str, Any] | None],
    None,
]:
    """Stream string fields to the client as they arrive; finish with parsed JSON dict."""
    final_data: dict[str, Any] | None = None
    allowed = frozenset(stream_string_fields)
    partial_required = tuple(stream_string_fields[:1]) if stream_string_fields else ()
    async for event in call_llm_streaming_fields(
        system_prompt=prompt,
        user_message=user_message,
        max_tokens=max_tokens,
        temperature=temperature,
        feature=feature,
        schema_hints=schema_hints,
        stream_string_fields=stream_string_fields,
        response_format="json_schema" if json_schema else "json_object",
        json_schema=json_schema,
        partial_required_fields=partial_required,
    ):
        if event.type == "string_chunk" and event.path in allowed:
            yield ("chunk", {"path": event.path, "text": event.text})
        elif event.type == "error":
            error = event.result.error if event.result else None
            raise RuntimeError(error.message if error else "LLM request failed")
        elif event.type == "complete":
            result = event.result
            if result and result.success and isinstance(result.data, dict):
                final_data = result.data
            else:
                error = result.error if result else None
                raise RuntimeError(error.message if error else "LLM request failed")
    yield ("done", final_data)


def _fallback_plan(payload: InterviewBaseRequest, setup: dict[str, Any]) -> dict[str, Any]:
    fmt = setup["interview_format"]
    if fmt == "case":
        opening_topic = "case_fit"
    elif fmt == "life_history":
        opening_topic = "life_narrative_core"
    else:
        opening_topic = "motivation_fit"
    interview_type_map = {
        "case": "new_grad_case",
        "technical": "new_grad_technical",
        "life_history": "new_grad_life_history",
    }
    interview_type = interview_type_map.get(fmt, "new_grad_behavioral")
    must_cover = [opening_topic, "role_understanding", "company_fit"]
    if fmt == "life_history":
        must_cover = [
            "life_narrative_core",
            "turning_point_values",
            "motivation_bridge",
            "role_understanding",
        ]
    if setup["interview_stage"] == "final":
        must_cover.extend(["company_compare_check", "career_alignment"])
    if setup["selection_type"] == "internship":
        must_cover.append("learning_motivation")
    if setup["role_track"] == "research_specialist":
        must_cover.append("research_application")
    if setup["role_track"] == "it_product":
        must_cover.append("work_understanding")
    return {
        "interview_type": interview_type,
        "priority_topics": must_cover[:4],
        "opening_topic": opening_topic,
        "must_cover_topics": must_cover,
        "risk_topics": ["credibility_check", "consistency_check"],
        "suggested_timeflow": (
            ["導入", "ケース設定", "仮説と検証", "締め"]
            if fmt == "case"
            else ["導入", "転機と価値観", "行動の根拠", "締め"]
            if fmt == "life_history"
            else ["導入", "技術判断", "前提とトレードオフ", "締め"]
            if fmt == "technical"
            else ["導入", "志望動機", "具体例", "締め"]
        ),
    }


def _fallback_turn_meta(turn_state: dict[str, Any], interview_plan: dict[str, Any]) -> dict[str, Any]:
    remaining = _normalize_string_list(turn_state.get("remainingTopics"))
    topic = remaining[0] if remaining else str(interview_plan.get("opening_topic") or "motivation_fit")
    topic = str(topic or interview_plan.get("opening_topic") or "motivation_fit")
    turn_action = "deepen" if topic in turn_state.get("coveredTopics", []) else "shift"
    depth_focus = "logic"
    if "company" in topic:
        depth_focus = "company_fit"
    elif "role" in topic:
        depth_focus = "role_fit"
    elif "credibility" in topic or "consistency" in topic:
        depth_focus = "credibility"
    return {
        "topic": topic,
        "turn_action": turn_action,
        "focus_reason": "面接計画の優先論点に沿って確認するため",
        "depth_focus": depth_focus,
        "followup_style": "reason_check",
        "should_move_next": False,
    }


def _merge_plan_progress(turn_state: dict[str, Any], data: dict[str, Any], turn_meta: dict[str, Any]) -> dict[str, Any]:
    llm_covered = _normalize_string_list(data.get("plan_progress", {}).get("covered_topics") if isinstance(data.get("plan_progress"), dict) else None)
    remaining = _normalize_string_list(data.get("plan_progress", {}).get("remaining_topics") if isinstance(data.get("plan_progress"), dict) else None)
    topic = str(turn_meta.get("topic") or "motivation_fit")
    covered = list(turn_state.get("coveredTopics") or [])
    coverage_state = list(turn_state.get("coverageState") or [])
    if coverage_state:
        updated_coverage_state: list[dict[str, Any]] = []
        next_turn_id = f"turn-{int(turn_state.get('turnCount', 0) or 0) + 1}"
        for item in coverage_state:
            item_topic = str(item.get("topic") or "").strip()
            required_checklist = _normalize_string_list(item.get("requiredChecklist"))
            passed_checklist = _normalize_string_list(item.get("passedChecklistKeys"))
            deterministic_passed = bool(item.get("deterministicCoveragePassed")) or (
                bool(required_checklist) and all(key in passed_checklist for key in required_checklist)
            )
            llm_hint = "covered" if item_topic in llm_covered else (str(item.get("llmCoverageHint") or "").strip() or None)
            status = str(item.get("status") or "pending").strip()
            if deterministic_passed:
                status = "covered"
            elif item_topic == topic:
                status = "active"
            elif status not in {"pending", "active", "covered", "exhausted"}:
                status = "pending"
            updated_coverage_state.append(
                {
                    **item,
                    "status": status,
                    "passedChecklistKeys": passed_checklist,
                    "deterministicCoveragePassed": deterministic_passed,
                    "llmCoverageHint": llm_hint,
                    "deepeningCount": int(item.get("deepeningCount", 0) or 0) + (1 if item_topic == topic else 0),
                    "lastCoveredTurnId": next_turn_id if deterministic_passed and item_topic == topic else item.get("lastCoveredTurnId"),
                }
            )
        coverage_state = updated_coverage_state
        covered = _covered_topics_from_coverage_state(coverage_state)
    if not remaining:
        interview_plan = turn_state.get("interviewPlan") or {}
        must_cover = _normalize_string_list(interview_plan.get("must_cover_topics"))
        remaining = [topic for topic in must_cover if topic not in covered]
    return {
        **turn_state,
        "coverageState": coverage_state,
        "coveredTopics": covered,
        "remainingTopics": remaining,
    }


async def _generate_start_progress(payload: InterviewStartRequest) -> AsyncGenerator[str, None]:
    try:
        setup = _build_setup(payload)
        yield _sse_event("progress", {"step": "plan", "progress": 12, "label": "面接計画を整理中..."})
        plan_prompt = _build_plan_prompt(payload)
        try:
            plan_data = None
            async for kind, payload in _stream_llm_json_completion(
                prompt=plan_prompt,
                user_message="面接計画をJSONで生成してください。",
                stream_string_fields=[],
                schema_hints={
                    "interview_type": "string",
                    "priority_topics": "array",
                    "opening_topic": "string",
                    "must_cover_topics": "array",
                    "risk_topics": "array",
                    "suggested_timeflow": "array",
                },
                max_tokens=700,
                temperature=0.2,
                feature="interview",
                json_schema=INTERVIEW_PLAN_SCHEMA,
            ):
                if kind == "done":
                    plan_data = payload
        except Exception:
            logger.warning("[Interview] plan generation failed; using deterministic fallback", exc_info=True)
            plan_data = None
        interview_plan = _normalize_interview_plan(plan_data or _fallback_plan(payload, setup))
        yield _sse_event("field_complete", {"path": "interview_plan", "value": interview_plan})

        yield _sse_event("progress", {"step": "opening", "progress": 42, "label": "最初の質問を準備中..."})
        opening_prompt = _build_opening_prompt(payload, interview_plan)
        try:
            opening_data = None
            async for kind, payload in _stream_llm_json_completion(
                prompt=opening_prompt,
                user_message="最初の面接質問をJSONで生成してください。",
                stream_string_fields=["question", "interview_setup_note"],
                schema_hints={
                    "question": "string",
                    "question_stage": "string",
                    "focus": "string",
                    "interview_setup_note": "string",
                    "turn_meta": "object",
                },
                max_tokens=700,
                temperature=0.35,
                feature="interview",
                json_schema=INTERVIEW_OPENING_SCHEMA,
            ):
                if kind == "chunk":
                    yield _sse_event("string_chunk", payload)
                else:
                    opening_data = payload
        except Exception:
            logger.warning("[Interview] opening generation failed; using deterministic fallback", exc_info=True)
            opening_data = _build_fallback_opening_payload(payload, interview_plan, setup)

        opening_data = opening_data or _build_fallback_opening_payload(payload, interview_plan, setup)
        question = _normalize_question_text(str(opening_data.get("question") or "").strip(), payload.company_name)
        if not question:
            opening_data = _build_fallback_opening_payload(payload, interview_plan, setup)
            question = _normalize_question_text(str(opening_data.get("question") or "").strip(), payload.company_name)
        elif not _opening_question_matches_format(question, setup["interview_format"]):
            opening_data = _build_fallback_opening_payload(payload, interview_plan, setup)
            question = _normalize_question_text(str(opening_data.get("question") or "").strip(), payload.company_name)
        turn_meta = _normalize_turn_meta(opening_data.get("turn_meta"), interview_plan["opening_topic"])
        if not turn_meta.get("focus_reason"):
            turn_meta["focus_reason"] = "初回導入"
        turn_state = _derive_turn_state_for_question(
            _default_turn_state(setup),
            turn_meta,
            phase="opening",
        )
        turn_state["formatPhase"] = "opening"
        turn_state["interviewPlan"] = interview_plan
        turn_state["plan"] = interview_plan
        turn_state["turnMeta"] = turn_meta
        turn_state["turn_meta"] = turn_meta
        turn_state["interview_plan"] = interview_plan
        turn_state["lastQuestion"] = question
        turn_state["coverageState"] = _build_initial_coverage_state(interview_plan, setup)
        turn_state["recentQuestionSummaries"] = [
            _build_question_summary(str(opening_data.get("interview_setup_note") or ""), "初回導入"),
        ]
        turn_state["recentQuestionSummariesV2"] = [
            _build_recent_question_summary_v2(turn_meta, "初回導入", "turn-1"),
        ]
        turn_state["remainingTopics"] = interview_plan["must_cover_topics"]
        turn_state["coveredTopics"] = []
        turn_state["lastQuestionFocus"] = turn_meta.get("focus_reason") or "初回導入"

        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": None,
                    "focus": str(opening_data.get("focus") or turn_meta.get("focus_reason") or "志望理由の核").strip(),
                    "question_stage": "opening",
                    "interview_plan": interview_plan,
                    "turn_meta": turn_meta,
                    "stage_status": _legacy_stage_status("opening"),
                    "question_flow_completed": False,
                    "turn_state": turn_state,
                }
            },
        )
    except Exception as exc:
        logger.exception("[Interview] start failed")
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})


async def _generate_turn_progress(payload: InterviewTurnRequest) -> AsyncGenerator[str, None]:
    try:
        setup = _build_setup(payload)
        turn_state = _normalize_turn_state(payload.turn_state, setup)
        interview_plan = turn_state.get("interviewPlan") or _fallback_plan(payload, setup)
        turn_state["interviewPlan"] = interview_plan
        yield _sse_event("progress", {"step": "turn", "progress": 18, "label": "直近の回答を分析中..."})

        turn_prompt = _build_turn_prompt(payload, interview_plan, turn_state, turn_state.get("turnMeta") or {})
        turn_data = None
        async for kind, payload in _stream_llm_json_completion(
            prompt=turn_prompt,
            user_message="次の面接質問をJSONで生成してください。",
            stream_string_fields=["question"],
            schema_hints={
                "question": "string",
                "question_stage": "string",
                "focus": "string",
                "turn_meta": "object",
                "plan_progress": "object",
            },
            max_tokens=700,
            temperature=0.35,
            feature="interview",
            json_schema=INTERVIEW_TURN_SCHEMA,
        ):
            if kind == "chunk":
                yield _sse_event("string_chunk", payload)
            else:
                turn_data = payload
        turn_data = turn_data or {}
        turn_meta = _normalize_turn_meta(turn_data.get("turn_meta"), interview_plan["opening_topic"])
        if not turn_meta.get("focus_reason"):
            turn_meta["focus_reason"] = "計画に沿って深掘りするため"
        question_stage = str(turn_data.get("question_stage") or _question_stage_from_turn_meta(turn_meta)).strip()
        if question_stage not in {"opening", "turn", "experience", "company_understanding", "motivation_fit"}:
            question_stage = "turn"
        question = _normalize_question_text(str(turn_data.get("question") or "").strip(), payload.company_name)

        merged_state = _merge_plan_progress(turn_state, turn_data, turn_meta)
        merged_state = _derive_turn_state_for_question(merged_state, turn_meta, phase="turn")
        merged_state["interviewPlan"] = interview_plan
        merged_state["plan"] = interview_plan
        merged_state["turnMeta"] = turn_meta
        merged_state["turn_meta"] = turn_meta
        merged_state["interview_plan"] = interview_plan
        merged_state["lastQuestion"] = question
        merged_state["lastAnswer"] = next(
            (message.content for message in reversed(payload.conversation_history) if message.role == "user"),
            merged_state.get("lastAnswer"),
        )
        merged_state["lastTopic"] = turn_meta.get("topic")
        merged_state["recentQuestionSummaries"] = (merged_state.get("recentQuestionSummaries") or [])[-4:]
        merged_state["recentQuestionSummaries"].append(_build_question_summary(turn_meta.get("focus_reason"), "次の論点"))
        merged_state["recentQuestionSummaries"] = merged_state["recentQuestionSummaries"][-5:]
        merged_state["recentQuestionSummariesV2"] = (merged_state.get("recentQuestionSummariesV2") or [])[-7:]
        merged_state["recentQuestionSummariesV2"].append(
            _build_recent_question_summary_v2(
                turn_meta,
                "次の論点",
                f"turn-{int(merged_state.get('turnCount', 1) or 1)}",
            )
        )
        merged_state["phase"] = "turn"
        merged_state["question_stage"] = question_stage
        merged_state["currentStage"] = _question_stage_from_turn_meta(turn_meta)
        merged_state["stageStatus"] = _legacy_stage_status(merged_state["currentStage"])
        merged_state["remainingTopics"] = [
            topic for topic in _normalize_string_list(interview_plan.get("must_cover_topics")) if topic not in merged_state.get("coveredTopics", [])
        ]

        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": None,
                    "focus": str(turn_data.get("focus") or turn_meta.get("focus_reason") or "次の論点").strip(),
                    "question_stage": question_stage,
                    "interview_plan": interview_plan,
                    "turn_meta": turn_meta,
                    "stage_status": _legacy_stage_status(merged_state["currentStage"]),
                    "question_flow_completed": False,
                    "turn_state": merged_state,
                }
            },
        )
    except Exception as exc:
        logger.exception("[Interview] turn failed")
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})


async def _generate_continue_progress(payload: InterviewContinueRequest) -> AsyncGenerator[str, None]:
    try:
        setup = _build_setup(payload)
        turn_state = _normalize_turn_state(payload.turn_state, setup)
        interview_plan = turn_state.get("interviewPlan") or _fallback_plan(payload, setup)
        turn_state["interviewPlan"] = interview_plan
        yield _sse_event("progress", {"step": "continue", "progress": 20, "label": "講評を踏まえて再開しています..."})
        continue_prompt = _build_continue_prompt(payload)
        data = None
        async for kind, payload in _stream_llm_json_completion(
            prompt=continue_prompt,
            user_message="次の面接質問をJSONで生成してください。",
            stream_string_fields=["question"],
            schema_hints={
                "question": "string",
                "question_stage": "string",
                "focus": "string",
                "transition_line": "string",
                "turn_meta": "object",
            },
            max_tokens=700,
            temperature=0.35,
            feature="interview",
            json_schema=INTERVIEW_CONTINUE_SCHEMA,
        ):
            if kind == "chunk":
                yield _sse_event("string_chunk", payload)
            else:
                data = payload
        data = data or {}
        question = _normalize_question_text(str(data.get("question") or "").strip(), payload.company_name)
        turn_meta = _normalize_turn_meta(data.get("turn_meta"), interview_plan["opening_topic"])
        if not turn_meta.get("focus_reason"):
            turn_meta["focus_reason"] = "講評を踏まえて再開するため"
        question_stage = str(data.get("question_stage") or _question_stage_from_turn_meta(turn_meta)).strip()
        if question_stage not in {"experience", "company_understanding", "motivation_fit"}:
            question_stage = "motivation_fit"

        merged_state = _derive_turn_state_for_question(turn_state, turn_meta, phase="turn")
        merged_state["interviewPlan"] = interview_plan
        merged_state["turnMeta"] = turn_meta
        merged_state["turn_meta"] = turn_meta
        merged_state["interview_plan"] = interview_plan
        merged_state["lastQuestion"] = question
        merged_state["lastAnswer"] = next(
            (message.content for message in reversed(payload.conversation_history) if message.role == "user"),
            merged_state.get("lastAnswer"),
        )
        merged_state["phase"] = "turn"
        merged_state["recentQuestionSummariesV2"] = (merged_state.get("recentQuestionSummariesV2") or [])[-7:]
        merged_state["recentQuestionSummariesV2"].append(
            _build_recent_question_summary_v2(
                turn_meta,
                "再開",
                f"turn-{int(merged_state.get('turnCount', 1) or 1)}",
            )
        )
        merged_state["remainingTopics"] = [
            topic for topic in _normalize_string_list(interview_plan.get("must_cover_topics")) if topic not in merged_state.get("coveredTopics", [])
        ]

        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": data.get("transition_line"),
                    "focus": str(data.get("focus") or turn_meta.get("focus_reason") or "再開").strip(),
                    "question_stage": question_stage,
                    "interview_plan": interview_plan,
                    "turn_meta": turn_meta,
                    "stage_status": _legacy_stage_status(_question_stage_from_turn_meta(turn_meta)),
                    "question_flow_completed": False,
                    "turn_state": merged_state,
                }
            },
        )
    except Exception as exc:
        logger.exception("[Interview] continue failed")
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})


async def _generate_feedback_progress(payload: InterviewFeedbackRequest) -> AsyncGenerator[str, None]:
    try:
        setup = _build_setup(payload)
        turn_state = _normalize_turn_state(payload.turn_state, setup)
        interview_plan = turn_state.get("interviewPlan") or _fallback_plan(payload, setup)
        turn_state["interviewPlan"] = interview_plan
        yield _sse_event("progress", {"step": "feedback", "progress": 30, "label": "最終講評を整理中..."})
        feedback_prompt = _build_feedback_prompt(payload)
        data = None
        async for kind, payload in _stream_llm_json_completion(
            prompt=feedback_prompt,
            user_message="最終講評をJSONで生成してください。",
            stream_string_fields=["overall_comment", "improved_answer"],
            schema_hints={
                "overall_comment": "string",
                "scores": "object",
                "strengths": "array",
                "improvements": "array",
                "consistency_risks": "array",
                "weakest_question_type": "string",
                "improved_answer": "string",
                "next_preparation": "array",
                "premise_consistency": "number",
            },
            max_tokens=1600,
            temperature=0.25,
            feature="interview_feedback",
            json_schema=INTERVIEW_FEEDBACK_SCHEMA,
        ):
            if kind == "chunk":
                yield _sse_event("string_chunk", payload)
            else:
                data = payload
        feedback = _backfill_feedback_linkage_from_conversation(
            _normalize_feedback(data or {}),
            payload.conversation_history,
        )
        feedback = _enrich_feedback_defaults(feedback, setup=setup)
        final_state = {
            **turn_state,
            "phase": "feedback",
            "formatPhase": "feedback",
            "currentStage": "feedback",
            "nextAction": "feedback",
            "question_stage": "feedback",
            "turnMeta": turn_state.get("turnMeta") or _fallback_turn_meta(turn_state, interview_plan),
            "turn_meta": turn_state.get("turnMeta") or _fallback_turn_meta(turn_state, interview_plan),
            "interviewPlan": interview_plan,
            "plan": interview_plan,
            "interview_plan": interview_plan,
            "stageStatus": _legacy_stage_status("feedback"),
        }

        yield _sse_event("field_complete", {"path": "scores", "value": feedback["scores"]})
        yield _sse_event("field_complete", {"path": "premise_consistency", "value": feedback["premise_consistency"]})
        yield _sse_event(
            "complete",
            {
                "data": {
                    **feedback,
                    "question_stage": "feedback",
                    "interview_plan": interview_plan,
                    "turn_meta": final_state["turnMeta"],
                    "stage_status": _legacy_stage_status("feedback"),
                    "question_flow_completed": True,
                    "turn_state": final_state,
                }
            },
        )
    except Exception as exc:
        logger.exception("[Interview] feedback failed")
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})


def _stream_response(generator: AsyncGenerator[str, None]) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _normalize_question_text(question: str, company_name: str) -> str:
    normalized = re.sub(r"\s+", " ", question).strip()
    patterns = [
        rf"^{re.escape(company_name)}の面接に臨むにあたり、?",
        rf"^{re.escape(company_name)}を受けるにあたって、?",
        rf"^{re.escape(company_name)}を志望するうえで、?",
        r"^この企業の面接に臨むにあたり、?",
        r"^今回の面接に臨むにあたり、?",
    ]
    for pattern in patterns:
        normalized = re.sub(pattern, "", normalized).strip()
    return normalized or question.strip()


@router.post("/start")
@limiter.limit("60/minute")
async def start_interview(payload: InterviewStartRequest, request: Request):
    try:
        _sanitize_base_request(payload)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=4000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=4000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=4000)
    payload.academic_summary = sanitize_prompt_input(payload.academic_summary or "なし", max_length=4000)
    payload.research_summary = sanitize_prompt_input(payload.research_summary or "なし", max_length=4000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=4000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=4000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)
    return _stream_response(_generate_start_progress(payload))


@router.post("/turn")
@limiter.limit("60/minute")
async def next_interview_turn(payload: InterviewTurnRequest, request: Request):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=4000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=4000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=4000)
    payload.academic_summary = sanitize_prompt_input(payload.academic_summary or "なし", max_length=4000)
    payload.research_summary = sanitize_prompt_input(payload.research_summary or "なし", max_length=4000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=4000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=4000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)
    return _stream_response(_generate_turn_progress(payload))


@router.post("/continue")
@limiter.limit("60/minute")
async def continue_interview(payload: InterviewContinueRequest, request: Request):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=4000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=4000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=4000)
    payload.academic_summary = sanitize_prompt_input(payload.academic_summary or "なし", max_length=4000)
    payload.research_summary = sanitize_prompt_input(payload.research_summary or "なし", max_length=4000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=4000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=4000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)
    return _stream_response(_generate_continue_progress(payload))


@router.post("/feedback")
@limiter.limit("60/minute")
async def interview_feedback(payload: InterviewFeedbackRequest, request: Request):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=4000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=4000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=4000)
    payload.academic_summary = sanitize_prompt_input(payload.academic_summary or "なし", max_length=4000)
    payload.research_summary = sanitize_prompt_input(payload.research_summary or "なし", max_length=4000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=4000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=4000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)
    return _stream_response(_generate_feedback_progress(payload))
