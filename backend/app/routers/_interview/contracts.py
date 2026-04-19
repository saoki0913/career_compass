"""Immutable constants, Pydantic models, prompt templates, and JSON schemas
shared across the interview router modules.

This module is intentionally dependency-free (besides ``pydantic`` and the
standard library) so it can sit at the bottom of the internal dependency
graph: ``contracts ← setup ← planning ← prompting ← generators ← endpoints``.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Allowed-value sets for request normalization
# ---------------------------------------------------------------------------

ROLE_TRACKS = {
    "biz_general",
    "it_product",
    "consulting",
    "research_specialist",
    "quant_finance",
    "frontend_engineer",
    "backend_engineer",
    "data_ai",
    "infra_platform",
    "product_manager",
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
    # 宣言順 = 優先順。狭い/特殊を先に、広い it_product / biz_general を後ろに置く。
    # フロント (src/lib/interview/session.ts:128) の regex 優先順と揃える。
    "frontend_engineer": [
        "フロントエンド",
        "UI",
        "UX",
        "Web開発",
        "frontend",
        "React",
        "Vue",
        "Next.js",
    ],
    "backend_engineer": [
        "バックエンド",
        "サーバーサイド",
        "API",
        "backend",
        "Go",
        "Rails",
        "Django",
    ],
    "data_ai": [
        "データサイエンス",
        "データサイエンティスト",
        "AI",
        "機械学習",
        "データ分析",
        "ML",
        "LLM",
        "アナリティクス",
        "data scientist",
    ],
    "infra_platform": [
        "インフラ",
        "SRE",
        "クラウド",
        "DevOps",
        "platform",
        "Kubernetes",
        "AWS",
    ],
    "product_manager": [
        "プロダクトマネージャー",
        "PdM",
        "PM",
        "サービス企画",
        "product manager",
    ],
    "quant_finance": ["クオンツ", "数理", "アクチュアリー", "金融工学"],
    "research_specialist": ["研究", "リサーチ", "シンクタンク", "専門職"],
    "consulting": ["コンサル", "戦略", "業務", "ITコンサル"],
    "it_product": ["IT", "エンジニア", "DX", "プロダクト"],
    "biz_general": ["総合職", "営業", "企画", "コーポレート", "事務"],
}

# Topic → legacy stage 推定キーワード。
# `_infer_stage_from_topic()` と `_question_stage_from_turn_meta()` から共有する。
# dict iteration 順がタイ解決時の優先順位になる (company_understanding > role_reason > experience > motivation_fit)。
_TOPIC_STAGE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "company_understanding": ("company", "industry", "compare", "fit"),
    # role_reason に技術系論点 (system_design / analytical / data / reliability / user_understanding / prioritization) を統合
    "role_reason": (
        "role",
        "skill",
        "technical",
        "design",
        "system",
        "analytical",
        "data",
        "reliability",
        "user_understanding",
        "prioritization",
    ),
    # experience に narrative 系 (structured_thinking / life_narrative / turning_point_values) を統合
    "experience": (
        "experience",
        "gakuchika",
        "project",
        "structured",
        "thinking",
        "narrative",
        "turning",
        "values",
    ),
    "motivation_fit": ("motivation", "career", "future", "why"),
    "opening": ("opening", "intro", "self_intro"),
}

_LEGACY_FORMAT_PHASE_MAP = {
    "discussion_main": "life_history_main",
    "presentation_main": "life_history_main",
}

# ---------------------------------------------------------------------------
# Prompt templates (fallback skeletons used when no LLM layer overrides them)
# ---------------------------------------------------------------------------

_PLAN_FALLBACK = """あなたは新卒採用の面接設計担当です。応募者情報と企業情報を読み、模擬面接で確認すべき論点の優先順位を決めてください。

## 面接前提
- 職種: {selected_role_line} ({role_track}) / 方式: {interview_format} / 選考: {selection_type}
- 段階: {interview_stage} / 面接官: {interviewer_type} / 厳しさ: {strictness_mode}

{behavioral_block}

## 企業
- {company_name}: {company_summary}

## 応募者材料
- 志望動機: {motivation_summary}
- ガクチカ: {gakuchika_summary}
- 学業/ゼミ: {academic_summary}
- 研究: {research_summary}
- ES: {es_summary}
- seed/RAG: {seed_summary_line}

## タスク
- opening_topic / must_cover_topics / risk_topics を決める (risk: generic 志望理由・職種理解不足・経験との接続不足・一貫性・誇張)
- academic/research 強なら academic_application/research_application を優先
- case=case_fit/structured_thinking、technical=technical_depth/tradeoff/reproducibility、life_history=life_narrative_core/turning_point_values/motivation_bridge を優先
- 計画のみ出力、質問文は作らない

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
- 職種: {selected_role_line} ({role_track}) / 方式: {interview_format} / 選考: {selection_type}
- 段階: {interview_stage} / 面接官: {interviewer_type} / 厳しさ: {strictness_mode}

{behavioral_block}

## 企業
- {company_name}: {company_summary}

## interview_plan (要点)
- interview_type: {interview_type}
- opening_topic: {opening_topic}
- priority_topics: {priority_topics}
- must_cover_topics: {must_cover_topics}
- risk_topics: {risk_topics}
{case_brief_section}
## 応募者材料
- 志望動機: {motivation_summary}
- ガクチカ: {gakuchika_summary}
- 学業/ゼミ: {academic_summary}
- 研究: {research_summary}
- ES: {es_summary}
- seed/RAG: {seed_summary_line}

## ルール
- opening_topic に対応する質問を 1 問、自然な 1 文で (最初から深掘りしすぎない)
- 挨拶・前振り・感想を question に含めない。質問文のみ出力する
- format 別の導入方針は behavioral_block の「面接方式」に従う
- interview_setup_note は今回の見どころを一言で
- `question` / `focus` は空文字不可
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
- 職種: {selected_role_line} ({role_track}) / 方式: {interview_format} / 選考: {selection_type}
- 段階: {interview_stage} / 面接官: {interviewer_type} / 厳しさ: {strictness_mode}

{behavioral_block}

## 企業
- {company_name}: {company_summary}

## interview_plan (要点)
- interview_type: {interview_type}
- opening_topic: {opening_topic}
- priority_topics: {priority_topics}
- must_cover_topics: {must_cover_topics}
- risk_topics: {risk_topics}
{case_brief_section}
## 会話履歴
{conversation_text}

## 直近の要点
{last_turn_digest}

## coverage
- coveredTopics: {coveredTopics}
- remainingTopics: {remainingTopics}
- coverage_state:
{coverage_state}

## recent_question_summaries_v2 (新しい順)
{recent_question_summaries_v2}
{allowed_styles_section}
## format_phase: {format_phase}

## turn_events
{turn_events}

## ルール
- 直前回答を深掘りするか次論点へ移るか判断、質問は 1 問、同じ意味の質問を繰り返さない
- question に直前回答への感想・評価を含めない。質問文のみ出力
- `intent_key` は `topic:followup_style` 形式で安定させる、1 ターンで深める観点は 1 つだけ
- format 別の深掘り方針は behavioral_block の「面接方式」に従う
- `question` / `focus` は空文字不可、`plan_progress` に covered/remaining_topics を配列で
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
    "followup_style": "topic に合った追質問スタイル 1 つ (reason_check / specificity_check / evidence_check / counter_hypothesis / consistency_check / future_check / technical_difficulty_check 等)",
    "intent_key": "motivation_fit:company_reason_check",
    "should_move_next": false
  }}
}}"""

_CONTINUE_FALLBACK = """あなたは新卒採用の面接官です。前回の最終講評を踏まえて、面接対策を続けるための次の質問を 1 問だけ作ってください。

## 面接前提
- 職種: {selected_role_line} ({role_track}) / 方式: {interview_format} / 選考: {selection_type}
- 段階: {interview_stage} / 面接官: {interviewer_type} / 厳しさ: {strictness_mode}

{behavioral_block}

## 企業
- {company_name}: {company_summary}

## 面接計画 (要点)
- interview_type: {interview_type}
- opening_topic: {opening_topic}
- priority_topics: {priority_topics}
- must_cover_topics: {must_cover_topics}

## 会話履歴
{conversation_text}

## 直近の最終講評 (要点)
{latest_feedback_summary}

## ルール
- 講評の `next_preparation` / `improvements` のうち優先度が高いものから 1 つ選んで深掘りする
- `question_stage` は experience / company_understanding / motivation_fit のいずれか
- `transition_line` は「最終講評を踏まえて、次は○○についてさらに伺います。」の形で自然に再開
- question に直前回答への感想・評価を含めない。質問文のみ出力
- 質問 1 問、答えやすい自然な日本語、`question` / `transition_line` は空文字不可
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
- 職種: {selected_role_line} ({role_track}) / 方式: {interview_format} / 選考: {selection_type}
- 段階: {interview_stage} / 面接官: {interviewer_type} / 厳しさ: {strictness_mode}

{behavioral_block}

## 企業
- {company_name}: {company_summary}

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

## 採点根拠出力ルール (Evidence-Linked)
- `score_evidence_by_axis`: 7 軸別に応募者発言の引用を配列で (各軸最大 3 項目、1 項目 30 字以内、捏造禁止)
- `score_rationale_by_axis`: 7 軸別に採点理由を 1-2 文で (何が良かった / 足りなかったか)
- `confidence_by_axis`: "high" (evidence 3 + BARS 明確) / "medium" (evidence 1-2) / "low" (evidence 0 or 判断不能)
- evidence が空の軸は confidence=low 固定、score は 0 扱い
- 引用は応募者が実際に言った内容のみ。未発言の内容を根拠に採点しない

## 出力形式
{{
  "overall_comment": "総評",
  "scores": {{
    "company_fit": 0, "role_fit": 0, "specificity": 0, "logic": 0,
    "persuasiveness": 0, "consistency": 0, "credibility": 0
  }},
  "score_evidence_by_axis": {{
    "company_fit": ["引用1", "引用2"], "role_fit": [], "specificity": [],
    "logic": [], "persuasiveness": [], "consistency": [], "credibility": []
  }},
  "score_rationale_by_axis": {{
    "company_fit": "採点理由1-2文", "role_fit": "", "specificity": "",
    "logic": "", "persuasiveness": "", "consistency": "", "credibility": ""
  }},
  "confidence_by_axis": {{
    "company_fit": "high|medium|low", "role_fit": "low", "specificity": "low",
    "logic": "low", "persuasiveness": "low", "consistency": "low", "credibility": "low"
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

# ---------------------------------------------------------------------------
# JSON schema fragments used by call_llm_streaming_fields (json_schema mode)
# ---------------------------------------------------------------------------

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
        # Phase 2 Stage 4: deterministic follow-up policy の結果。
        # fallback 側で埋められ、LLM は受け取ったポリシーから followup_style を選ぶ。
        # optional (LLM に生成を強制しない)。
        "answer_gap": {"type": "string", "description": "直近回答の gap type (Stage 4)"},
        "allowed_followup_styles": {
            "type": "array",
            "items": {"type": "string"},
            "description": "policy が許可する followup_style の候補 (Stage 4)",
        },
    },
    # OpenAI structured outputs: every key in properties must appear in required.
    "required": [
        "topic",
        "turn_action",
        "focus_reason",
        "depth_focus",
        "followup_style",
        "intent_key",
        "should_move_next",
        "answer_gap",
        "allowed_followup_styles",
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

# Phase 2 Stage 3: CaseBrief の JSON schema fragment (nullable, plan 内で optional)。
# case format の plan フェーズで preset から読み込んだ値を持たせる。
# 他 format では None を返す。
CASE_BRIEF_SCHEMA = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "business_context": {"type": "string"},
        "target_metric": {"type": "string"},
        "constraints": {"type": "array", "items": {"type": "string"}},
        "candidate_task": {"type": "string"},
        "why_this_company": {"type": "string"},
        "case_followup_topics": {"type": "array", "items": {"type": "string"}},
        "industry": {
            "type": ["string", "null"],
            "enum": [
                "finance",
                "saas",
                "retail",
                "manufacturing",
                "consulting",
                "media",
                "infrastructure",
                None,
            ],
        },
        "case_seed_version": {"type": "string"},
    },
    # OpenAI structured outputs: object branch requires every property key in required.
    "required": [
        "business_context",
        "target_metric",
        "constraints",
        "candidate_task",
        "why_this_company",
        "case_followup_topics",
        "industry",
        "case_seed_version",
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
            # Phase 2 Stage 3: case format の plan では CaseBrief を返すことがある
            # (case format 以外では省略 or null)
            "case_brief": CASE_BRIEF_SCHEMA,
        },
        "required": [
            "interview_type",
            "priority_topics",
            "opening_topic",
            "must_cover_topics",
            "risk_topics",
            "suggested_timeflow",
            "case_brief",
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
            # Phase 2 Stage 6: Per-turn short coaching.
            # OpenAI strict JSON: key は必須。値は object または null（会話なしの初回など）。
            # null / 不完全 object は `_fallback_short_coaching` (planning.py) で補完。
            "short_coaching": {
                "type": ["object", "null"],
                "description": (
                    "直前回答への short coaching。"
                    "初回ターン (会話履歴が空) は null 可。"
                    "各フィールドは 30-60 字、general praise 禁止。"
                ),
                "additionalProperties": False,
                "properties": {
                    "good": {
                        "type": "string",
                        "description": "直前回答の良かった具体的な点を 30-60 字で",
                    },
                    "missing": {
                        "type": "string",
                        "description": "足りなかった観点を 30-60 字で (次 followup_style の根拠)",
                    },
                    "next_edit": {
                        "type": "string",
                        "description": "応募者が次ターンで試せる小粒な改善行動を 30-60 字で",
                    },
                },
                "required": ["good", "missing", "next_edit"],
            },
        },
        "required": [
            "question",
            "question_stage",
            "focus",
            "turn_meta",
            "plan_progress",
            "short_coaching",
        ],
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
            "satisfaction_score": {
                "type": ["integer", "null"],
                "minimum": 1,
                "maximum": 5,
                "description": "任意。未採点は null。",
            },
            # Phase 2 Stage 5: Evidence-Linked Rubric（OpenAI strict: key は必須、空 object 可）。
            # `_normalize_feedback` と `_enrich_feedback_defaults` で全 7 軸が埋まるよう補完する。
            "score_evidence_by_axis": {
                "type": "object",
                "description": "7 軸別の採点根拠 (応募者発言からの引用、最大 3 項目 / 軸)",
                "additionalProperties": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 3,
                },
            },
            "score_rationale_by_axis": {
                "type": "object",
                "description": "7 軸別の採点理由 (1-2 文 / 軸)",
                "additionalProperties": {"type": "string"},
            },
            "confidence_by_axis": {
                "type": "object",
                "description": "7 軸別の evidence 確信度 (high/medium/low)",
                "additionalProperties": {"enum": ["high", "medium", "low"]},
            },
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
            "satisfaction_score",
            "score_evidence_by_axis",
            "score_rationale_by_axis",
            "confidence_by_axis",
        ],
    },
}


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------


class CaseBrief(BaseModel):
    """Phase 2 Stage 3: 構造化されたケース面接題材。

    plan フェーズで確定し、opening/turn で参照することで同じ企業 × 同じ業界で
    複数回 interview を回したときの題材の再現性を確保する。

    自由生成 (LLM による業界シナリオ即興) は禁止。
    preset JSON (`backend/app/data/case_seeds/<industry>.json`) から読み込むか、
    将来的に企業単位の RAG で上書きする。
    """

    business_context: str  # 2-3 文で事業文脈
    target_metric: str  # 主要 KPI (売上 / シェア / LTV 等)
    constraints: list[str]  # 3-5 項目の制約
    candidate_task: str  # 応募者が解く問い
    why_this_company: str  # なぜこの会社のケースか
    case_followup_topics: list[str] = Field(default_factory=list)  # 想定深掘り 3-5 項目
    industry: Optional[
        Literal[
            "finance",
            "saas",
            "retail",
            "manufacturing",
            "consulting",
            "media",
            "infrastructure",
        ]
    ] = None
    case_seed_version: str = "v1.0"


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


# ---------------------------------------------------------------------------
# Phase 2 Stage 7: Weakness drill request / response models
# ---------------------------------------------------------------------------

SEVEN_AXIS_KEYS: tuple[str, ...] = (
    "company_fit",
    "role_fit",
    "specificity",
    "logic",
    "persuasiveness",
    "consistency",
    "credibility",
)

# ---------------------------------------------------------------------------
# Phase 2 Stage 10: recent-question-summary window constants
# ---------------------------------------------------------------------------
# `turn_state["recentQuestionSummariesV2"]` は全ターンを保持すると冗長になり
# prompt トークンを浪費するため、末尾 N 件のみを維持する。window 定数は以下の
# 2 つで役割が異なる。
#
# * ``RECENT_QUESTION_SUMMARIES_WINDOW`` — turn prompt に含める直近サマリー数。
#   ``prompting._render_recent_question_summaries`` の既定 ``limit`` 値として
#   LLM に渡す履歴長の上限となる。
# * ``RECENT_QUESTION_SUMMARIES_STATE_WINDOW`` — turn_state に実際に保持する
#   件数。新しいサマリー追加前に末尾 N 件に切り詰めることで、state 永続化時の
#   行長・network payload を抑える。
#
# 通常 STATE_WINDOW < WINDOW で、prompt には state 全件が載る (13 ≥ 7)。
RECENT_QUESTION_SUMMARIES_WINDOW = 13
RECENT_QUESTION_SUMMARIES_STATE_WINDOW = 7


class InterviewDrillStartRequest(BaseModel):
    """`/api/interview/drill/start` の request payload。

    応募者の最弱回答をもとに 4 つのコーチング観点 (why_weak / improvement_pattern /
    model_rewrite / retry_question) を生成するために必要な文脈をまとめる。
    """

    conversation_id: str = Field(max_length=200)
    weakest_turn_id: str = Field(max_length=200)
    weakest_question: str = Field(max_length=4000)
    weakest_answer: str = Field(max_length=4000)
    weakest_axis: str = Field(max_length=40)
    original_score: int = Field(ge=0, le=5)
    weakest_evidence: list[str] = Field(default_factory=list)
    # Setup 再構築用 (opening / turn と同じ signature)。
    company_name: str = Field(max_length=200)
    company_summary: Optional[str] = Field(default=None, max_length=4000)
    selected_role: Optional[str] = Field(default=None, max_length=200)
    interview_format: str = Field(default="standard_behavioral", max_length=40)
    interviewer_type: str = Field(default="hr", max_length=20)
    strictness_mode: str = Field(default="standard", max_length=20)


class InterviewDrillStartResponse(BaseModel):
    why_weak: str
    improvement_pattern: str
    model_rewrite: str
    retry_question: str
    prompt_version: str = "unknown"


class InterviewDrillScoreRequest(BaseModel):
    """`/api/interview/drill/score` の request payload。

    応募者が書き直した retry_answer を 7 軸で再採点し、original_scores からの
    delta を返すために必要な情報をまとめる。
    """

    conversation_id: str = Field(max_length=200)
    weakest_turn_id: str = Field(max_length=200)
    retry_question: str = Field(max_length=4000)
    retry_answer: str = Field(max_length=4000)
    original_scores: dict[str, int] = Field(default_factory=dict)
    weakest_axis: str = Field(max_length=40)
    company_name: str = Field(max_length=200)
    company_summary: Optional[str] = Field(default=None, max_length=4000)
    selected_role: Optional[str] = Field(default=None, max_length=200)


class InterviewDrillScoreResponse(BaseModel):
    retry_scores: dict[str, int]
    delta_scores: dict[str, int]
    rationale: str
    prompt_version: str = "unknown"


# Phase 2 Stage 7: drill/start prompt — 4 field JSON を LLM に生成させる。
# - why_weak: なぜ {weakest_axis} で弱かったか evidence 付きで 2-3 文
# - improvement_pattern: 典型的な弱点 → 修正パターンを 2-3 文
# - model_rewrite: 150-250 字の模範回答 (固有名詞・数字・経験の接続を含める)
# - retry_question: 書き直しを促す retry question を 1 問
# Token budget: 生成後の tiktoken 実測で ≤ 2,000 tokens 目標。
_DRILL_START_FALLBACK = """あなたは新卒採用の面接コーチです。以下の弱かった回答について、4 つの観点で改善を生成してください。

## 面接の設定
- 企業: {company_name}
- 企業概要: {company_summary}
- 職種: {selected_role}
- 面接方式: {interview_format}
- 面接官: {interviewer_type}
- 厳しさ: {strictness_mode}

## 弱かった軸と当時のスコア
- 軸: {weakest_axis}
- スコア: {original_score}/5

## 弱かった質問
{weakest_question}

## 弱かった応募者の回答
{weakest_answer}

## 直接発言された弱点根拠 (evidence、最大 3 件)
{weakest_evidence}

## タスク
1. `why_weak` — なぜこの回答が {weakest_axis} で弱かったかを evidence 付きで 2-3 文 (応募者発言の引用を 1 箇所含める)
2. `improvement_pattern` — 典型的な弱点パターン → 典型的な修正パターンを 2-3 文 (具体的な動詞で)
3. `model_rewrite` — 150-250 字の模範回答 (固有名詞・数字・経験の接続を含める、応募者が言い換えやすい自然な日本語)
4. `retry_question` — 書き直しを促す挑戦的な retry question を 1 問 (同じ論点を別角度から)

## ルール
- 全フィールド空文字不可
- `model_rewrite` 150-250 字、general praise (例: 「とてもよかった」) 禁止
- `retry_question` は 1 問のみ、疑問符で終える

## 出力形式
{{
  "why_weak": "...",
  "improvement_pattern": "...",
  "model_rewrite": "...",
  "retry_question": "..."
}}"""

# Phase 2 Stage 7: drill/score prompt — retry_answer を 7 軸で再採点する。
# rationale は delta の解説を 1-2 文で。
_DRILL_SCORE_FALLBACK = """あなたは新卒採用の面接採点者です。応募者が書き直した retry_answer を 7 軸で採点してください。

## 面接の設定
- 企業: {company_name}
- 企業概要: {company_summary}
- 職種: {selected_role}

## retry_question (書き直し用の問い)
{retry_question}

## retry_answer (応募者の新しい回答)
{retry_answer}

## original_scores (書き直し前の 7 軸スコア)
{original_scores}

## 重点軸 (書き直し前に最も弱かった軸)
{weakest_axis}

## 評価観点 (7 軸、0-5 で採点)
- company_fit / role_fit / specificity / logic / persuasiveness / consistency / credibility

## 採点ルール
- 7 軸すべてを 0-5 の整数で埋める
- evidence が retry_answer にないなら 0 に近く、ある なら 3-5
- 重点軸 ({weakest_axis}) での変化を特に注意深く評価する

## rationale ルール
- delta の総括を 1-2 文で日本語にまとめる
- 「{weakest_axis} が +X 向上」「他軸は据え置き」のように変化を簡潔に

## 出力形式
{{
  "retry_scores": {{
    "company_fit": 0, "role_fit": 0, "specificity": 0, "logic": 0,
    "persuasiveness": 0, "consistency": 0, "credibility": 0
  }},
  "rationale": "delta の解説 1-2 文"
}}"""


INTERVIEW_DRILL_START_SCHEMA = {
    "name": "interview_drill_start",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "why_weak": {"type": "string"},
            "improvement_pattern": {"type": "string"},
            "model_rewrite": {"type": "string"},
            "retry_question": {"type": "string"},
        },
        "required": ["why_weak", "improvement_pattern", "model_rewrite", "retry_question"],
    },
}


INTERVIEW_DRILL_SCORE_SCHEMA = {
    "name": "interview_drill_score",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "retry_scores": INTERVIEW_SCORE_SCHEMA,
            "rationale": {"type": "string"},
        },
        "required": ["retry_scores", "rationale"],
    },
}


__all__ = [
    # allowed-value sets
    "ROLE_TRACKS",
    "ROLE_TRACK_KEYWORDS",
    "INTERVIEW_FORMATS",
    "_LEGACY_INTERVIEW_FORMAT_MAP",
    "SELECTION_TYPES",
    "INTERVIEW_STAGES",
    "INTERVIEWER_TYPES",
    "STRICTNESS_MODES",
    # legacy stage ordering
    "LEGACY_STAGE_ORDER",
    "QUESTION_STAGE_ORDER",
    "LEGACY_STAGE_LABELS",
    # topic keyword mapping
    "_TOPIC_STAGE_KEYWORDS",
    "_LEGACY_FORMAT_PHASE_MAP",
    # prompt templates
    "_PLAN_FALLBACK",
    "_OPENING_FALLBACK",
    "_TURN_FALLBACK",
    "_CONTINUE_FALLBACK",
    "_FEEDBACK_FALLBACK",
    # JSON schemas
    "INTERVIEW_TURN_META_SCHEMA",
    "INTERVIEW_PLAN_PROGRESS_SCHEMA",
    "INTERVIEW_SCORE_SCHEMA",
    "CASE_BRIEF_SCHEMA",
    "INTERVIEW_PLAN_SCHEMA",
    "INTERVIEW_OPENING_SCHEMA",
    "INTERVIEW_TURN_SCHEMA",
    "INTERVIEW_CONTINUE_SCHEMA",
    "INTERVIEW_FEEDBACK_SCHEMA",
    # Pydantic models
    "Message",
    "CaseBrief",
    "InterviewBaseRequest",
    "InterviewStartRequest",
    "InterviewTurnRequest",
    "InterviewContinueRequest",
    "InterviewFeedbackRequest",
    # Phase 2 Stage 7: Weakness drill
    "SEVEN_AXIS_KEYS",
    "_DRILL_START_FALLBACK",
    "_DRILL_SCORE_FALLBACK",
    "INTERVIEW_DRILL_START_SCHEMA",
    "INTERVIEW_DRILL_SCORE_SCHEMA",
    "InterviewDrillStartRequest",
    "InterviewDrillStartResponse",
    "InterviewDrillScoreRequest",
    "InterviewDrillScoreResponse",
    # Phase 2 Stage 10: recent-question-summary window constants
    "RECENT_QUESTION_SUMMARIES_WINDOW",
    "RECENT_QUESTION_SUMMARIES_STATE_WINDOW",
]
