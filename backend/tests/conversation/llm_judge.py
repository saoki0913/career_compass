"""
Feature-specific LLM judge for evaluating AI conversation output quality.

Supports three features: gakuchika, motivation, interview.
Each feature has a dedicated Japanese system prompt with strict scoring rubrics.

Environment variables:
  LIVE_AI_CONVERSATION_LLM_JUDGE=1      enable the judge
  LIVE_AI_CONVERSATION_LLM_JUDGE_MODEL  model override (default: gpt-5.4-mini)
"""

from __future__ import annotations

import json
import os
import traceback
from typing import Any

from app.utils.llm import call_llm_with_error

# ---------------------------------------------------------------------------
# Feature axes
# ---------------------------------------------------------------------------

JUDGE_AXES: dict[str, list[str]] = {
    "gakuchika": [
        "star_completeness",
        "user_fact_preservation",
        "logical_flow",
        "question_depth",
        "naturalness",
    ],
    "motivation": [
        "slot_coverage",
        "company_specificity",
        "experience_connection",
        "question_progression",
        "naturalness",
    ],
    "interview": [
        "question_relevance",
        "follow_up_depth",
        "feedback_actionability",
        "feedback_grounding",
        "overall_coherence",
    ],
}

# ---------------------------------------------------------------------------
# System prompts (Japanese, strict evaluator for 就活 coaching quality)
# ---------------------------------------------------------------------------

GAKUCHIKA_JUDGE_SYSTEM = """\
あなたは就職活動支援 AI の品質審査官です。
以下の「ガクチカ深掘り」会話ログと、会話から生成された最終テキスト（ES ドラフトまたは構造化サマリー）を評価してください。

## 採点軸（各 1-5 の整数）

### 1. star_completeness（STAR 構造のカバー度）
- 5: 状況・課題・行動・結果の全要素が具体的なエピソードと紐づいている。数値や固有名詞を含み、読み手が場面を想像できる
- 4: 4 要素すべてあるが、1 要素だけやや抽象的（例: 結果が「改善した」のみで数値なし）
- 3: 1-2 要素が抽象的、または学びが完全に欠落しているが骨格は読める
- 2: 主要要素（課題 or 行動）が欠落している、または全体が箇条書き的で文脈が見えない
- 1: STAR のうち 1 要素しかない、またはエピソードが判別できない

### 2. user_fact_preservation（ユーザー事実の保持）
- 5: 会話中にユーザーが述べた具体的経験・数値・固有名詞・時期が全て最終テキストに反映されている
- 4: 主要事実は保持されているが、1 点だけ省略または微妙に言い換えられている
- 3: 主要事実はあるが、一部の具体的数値や固有名詞が一般表現に置き換わっている
- 2: 大半がユーザー発言と異なる一般論に置換されている
- 1: ユーザーの経験とほぼ無関係な内容が生成されている

### 3. logical_flow（因果関係の明確さ）
- 5: 課題→行動→結果→学びの因果が全て明確で、各接続に理由がある
- 4: 因果の流れはあるが、1 箇所だけ接続が暗黙的
- 3: 因果の接続はあるが、1-2 箇所で飛躍がある（例: なぜその行動を選んだか不明）
- 2: 因果が不明瞭で、要素が並列に羅列されている印象
- 1: 課題と行動、行動と結果がほぼ無関係に見える

### 4. question_depth（深掘り質問の品質）
- 5: 会話で役割・判断基準・定量成果・学びの再現性まで深掘りされている
- 4: 重要論点は深掘りされているが、1 つだけ表面的に終わっている
- 3: 骨格要素を表面的に網羅しているが、判断理由や背景まで踏み込めていない
- 2: 同じ角度の質問を繰り返している、または骨格の半分しかカバーしていない
- 1: 質問が 1-2 問で終わっている、または全て同じ質問

### 5. naturalness（自然さ・AI 臭の無さ）
- 5: 実際の学生が書いたように読める。具体的行動と結果があり、LLM 定型句がない
- 4: ほぼ自然だが、1 箇所だけやや硬い表現がある
- 3: 読めるが「~を通じて」「~を実感しました」「~したいと考えています」の繰り返しが目立つ
- 2: 「多様な関係者を巻き込みながら」「主体的に取り組み」等の LLM 定型句が複数ある
- 1: テンプレートをそのまま埋めたような文章で、個人の体験が感じられない

## 出力ルール
- JSON のみを出力すること。コードフェンス・説明文・前置き・後置きは一切禁止
- 各スコアは 1-5 の整数
- overall_pass は「全軸 >= 3 かつ 平均 >= 3.5」のとき true
- warnings: 品質上の懸念を日本語で最大 3 つ
- fail_reasons: 不合格理由を機械可読コードで（例: "star_completeness_below_3", "naturalness_below_3"）

## 出力形式
{
  "star_completeness": 4,
  "user_fact_preservation": 5,
  "logical_flow": 4,
  "question_depth": 3,
  "naturalness": 4,
  "overall_pass": true,
  "warnings": ["結果の数値がやや曖昧"],
  "fail_reasons": []
}"""

MOTIVATION_JUDGE_SYSTEM = """\
あなたは就職活動支援 AI の品質審査官です。
以下の「志望動機作成」会話ログと、会話から生成された最終テキスト（志望動機 ES ドラフト）を評価してください。

## 採点軸（各 1-5 の整数）

### 1. slot_coverage（志望動機スロットのカバー度）
対象スロット: 業界理由、企業理由、自己接続、希望業務、価値貢献、差別化
- 5: 6 スロット全てが具体的に充足されている
- 4: 5 スロットが充足、残り 1 つが部分的
- 3: 3-4 スロットが充足されている
- 2: 2 スロット以下しか充足されていない
- 1: スロットの概念自体が反映されていない

### 2. company_specificity（企業固有情報への言及）
- 5: 社名・事業内容・商品名・企業の特徴的取り組みを具体的に言及し、その企業でなければ成立しない内容
- 4: 社名と主要事業に言及しているが、特徴的取り組みへの言及が 1 つ足りない
- 3: 社名は出るが、内容が「業界大手」「グローバル展開」等の汎用表現で代替可能
- 2: 業界一般論のみで、社名を入れ替えても成立する
- 1: 企業への言及がほぼない

### 3. experience_connection（経験と志望動機の接続）
- 5: ユーザーの具体的経験→そこからの気づき→志望動機への接続が明確な因果で繋がっている
- 4: 経験と志望の接続はあるが、気づきの言語化が 1 段階弱い
- 3: 経験は述べられているが、志望動機との接続が「~を活かしたい」程度で弱い
- 2: 経験と志望動機が別々に存在し、接続がほぼない
- 1: ユーザーの経験が反映されていない

### 4. question_progression（会話のスロット網羅性）
- 5: 全スロットを体系的に、適切な順序で深掘りしている。ユーザー回答に応じた柔軟な展開がある
- 4: 全スロットをカバーしているが、1 スロットの深さにムラがある
- 3: 大半のスロットをカバーしたが、深さにムラがあり、一部が表面的
- 2: 同じスロットを繰り返し聞いている、または半分のスロットしかカバーしていない
- 1: 質問が 1-2 問で、スロットカバーの意図が見えない

### 5. naturalness（自然さ・AI 臭の無さ）
- 5: 実際の学生が書いた志望動機として自然。具体的で人間味があり、定型句がない
- 4: ほぼ自然だが、結びの 1 文がやや定型的
- 3: 読めるが「貴社の~に魅力を感じ」「~を通じて成長したい」の繰り返しが目立つ
- 2: テンプレート感が強く、「御社の~に共感し」「~で貢献したい」が機械的に並んでいる
- 1: 企業名を入れ替えてもそのまま使える汎用テンプレート

## 出力ルール
- JSON のみを出力すること。コードフェンス・説明文・前置き・後置きは一切禁止
- 各スコアは 1-5 の整数
- overall_pass は「全軸 >= 3 かつ 平均 >= 3.5」のとき true
- warnings: 品質上の懸念を日本語で最大 3 つ
- fail_reasons: 不合格理由を機械可読コードで（例: "slot_coverage_below_3", "naturalness_below_3"）

## 出力形式
{
  "slot_coverage": 4,
  "company_specificity": 3,
  "experience_connection": 4,
  "question_progression": 4,
  "naturalness": 4,
  "overall_pass": true,
  "warnings": ["企業固有情報がやや汎用的"],
  "fail_reasons": []
}"""

INTERVIEW_JUDGE_SYSTEM = """\
あなたは就職活動支援 AI の品質審査官です。
以下の「面接練習」会話ログと、面接終了後のフィードバックテキストを評価してください。

## 採点軸（各 1-5 の整数）

### 1. question_relevance（質問の適切さ）
- 5: 質問が企業・職種・候補者の ES や志望動機の内容に基づいており、候補者の回答を踏まえて展開している
- 4: 職種・企業に合った質問だが、候補者固有の深掘りが 1 問足りない
- 3: 職種には合うが、候補者の ES/志望動機との関連が薄い汎用質問が混じっている
- 2: 汎用的な面接質問が大半で、企業・候補者への個別化が弱い
- 1: 質問が企業・職種・候補者と無関係

### 2. follow_up_depth（深掘りの深さ）
- 5: 候補者の回答に対して、具体的場面・判断基準・代替案まで踏み込んだ深掘りがある
- 4: 深掘りはあるが、1 箇所だけ「もう少し詳しく」程度で終わっている
- 3: 深掘りはあるが、「もう少し詳しく教えてください」「具体的にはどういうことですか」程度の表面的なもの
- 2: 同じ角度での深掘りの繰り返し、または深掘りが 1 回しかない
- 1: 深掘りがない、または候補者の回答を無視して次の質問に進んでいる

### 3. feedback_actionability（フィードバックの実行可能性）
- 5: 具体的な改善点と改善例・言い換え例が示されており、次の面接で即実行できる
- 4: 改善点は具体的だが、改善例の提示が 1 つ足りない
- 3: 改善の方向性はあるが抽象的で、何をどう変えればよいか具体的にわからない
- 2: 「頑張ってください」「もう少し具体的に」程度のフィードバック
- 1: フィードバックがない、または「良かったです」のみ

### 4. feedback_grounding（フィードバックの根拠性）
- 5: 候補者の具体的発言を引用・参照し、その発言に基づいた改善提案がある
- 4: 候補者の発言に触れているが、引用が曖昧で「先ほどの回答では」程度
- 3: 候補者の発言に一応触れるが、フィードバック内容は一般化されている
- 2: 候補者の発言とほぼ無関係の汎用アドバイス
- 1: 候補者が何を言ったかに全く触れていない

### 5. overall_coherence（全体フローの一貫性）
- 5: 質問で浮かんだ論点がフィードバックに反映され、面接全体として一貫したストーリーがある
- 4: おおむね一貫しているが、1 つの質問がフィードバックで回収されていない
- 3: 一応つながるが、質問とフィードバックの間に飛躍があり、やや断片的
- 2: 質問とフィードバックが断絶しており、別々の文脈に見える
- 1: フローが破綻している、またはフィードバックが質問と完全に無関係

## 出力ルール
- JSON のみを出力すること。コードフェンス・説明文・前置き・後置きは一切禁止
- 各スコアは 1-5 の整数
- overall_pass は「全軸 >= 3 かつ 平均 >= 3.5」のとき true
- warnings: 品質上の懸念を日本語で最大 3 つ
- fail_reasons: 不合格理由を機械可読コードで（例: "question_relevance_below_3", "feedback_grounding_below_3"）

## 出力形式
{
  "question_relevance": 4,
  "follow_up_depth": 4,
  "feedback_actionability": 3,
  "feedback_grounding": 4,
  "overall_coherence": 4,
  "overall_pass": true,
  "warnings": ["フィードバックの改善例がやや抽象的"],
  "fail_reasons": []
}"""

_JUDGE_SYSTEM_PROMPTS: dict[str, str] = {
    "gakuchika": GAKUCHIKA_JUDGE_SYSTEM,
    "motivation": MOTIVATION_JUDGE_SYSTEM,
    "interview": INTERVIEW_JUDGE_SYSTEM,
}

# ---------------------------------------------------------------------------
# Transcript / text truncation limits (characters)
# ---------------------------------------------------------------------------

_TRANSCRIPT_CHAR_LIMIT = 24_000
_FINAL_TEXT_CHAR_LIMIT = 12_000


# ---------------------------------------------------------------------------
# Environment helpers
# ---------------------------------------------------------------------------

def is_judge_enabled() -> bool:
    """Return True if the LLM judge is enabled via environment variable."""
    return os.getenv("LIVE_AI_CONVERSATION_LLM_JUDGE", "").strip() == "1"


def judge_model() -> str:
    """Return the model to use for LLM judge evaluation."""
    return (
        os.getenv("LIVE_AI_CONVERSATION_LLM_JUDGE_MODEL", "").strip()
        or "gpt-5.4-mini"
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _format_transcript(transcript: list[dict], limit: int = _TRANSCRIPT_CHAR_LIMIT) -> str:
    """Format transcript as role: content pairs, truncated to *limit* characters."""
    lines: list[str] = []
    for turn in transcript:
        role = turn.get("role", "unknown")
        content = turn.get("content", "")
        lines.append(f"{role}: {content}")
    full = "\n".join(lines)
    if len(full) <= limit:
        return full
    return full[:limit] + "\n... (truncated)"


def _truncate_text(text: str, limit: int = _FINAL_TEXT_CHAR_LIMIT) -> str:
    """Truncate text to *limit* characters."""
    if len(text) <= limit:
        return text
    return text[:limit] + "\n... (truncated)"


def _compute_pass(scores: dict[str, int], axes: list[str]) -> bool:
    """overall_pass = all(score >= 3) and mean >= 3.5"""
    values = [scores.get(axis, 0) for axis in axes]
    if not values:
        return False
    return all(v >= 3 for v in values) and (sum(values) / len(values)) >= 3.5


def _build_user_prompt(
    feature: str,
    case_id: str,
    title: str,
    transcript_text: str,
    final_text: str,
) -> str:
    """Build the user prompt sent to the judge LLM."""
    return (
        f"## 評価対象\n"
        f"- feature: {feature}\n"
        f"- caseId: {case_id}\n"
        f"- title: {title}\n"
        f"\n"
        f"## 会話ログ\n"
        f"{transcript_text}\n"
        f"\n"
        f"## 最終出力テキスト\n"
        f"{final_text}\n"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_conversation_judge(
    feature: str,
    case_id: str,
    title: str,
    transcript: list[dict],
    final_text: str,
) -> dict[str, Any] | None:
    """Run feature-specific LLM judge. Returns judge result dict or None if disabled/failed.

    Result format (compatible with existing report schema):
    {
        "enabled": True,
        "model": "gpt-5.4-mini",
        "overallPass": True/False,
        "blocking": False,
        "scores": {"axis1": 4, "axis2": 3, ...},
        "warnings": ["..."],
        "reasons": ["..."],
    }
    """
    if not is_judge_enabled():
        return None

    axes = JUDGE_AXES.get(feature)
    if axes is None:
        print(f"[llm_judge] unknown feature: {feature}")
        return None

    system_prompt = _JUDGE_SYSTEM_PROMPTS[feature]
    model = judge_model()

    transcript_text = _format_transcript(transcript)
    truncated_final = _truncate_text(final_text)
    user_prompt = _build_user_prompt(feature, case_id, title, transcript_text, truncated_final)

    try:
        result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=1000,
            temperature=0.1,
            model=model,
            feature=f"conversation_judge_{feature}",
            response_format="json_object",
        )
    except Exception:
        print(f"[llm_judge] LLM call failed for {feature}/{case_id}:")
        traceback.print_exc()
        return _error_result(model, f"LLM call exception: {traceback.format_exc()[:200]}")

    if not result.success or result.data is None:
        error_msg = ""
        if result.error is not None:
            error_msg = getattr(result.error, "message", str(result.error))
        print(f"[llm_judge] LLM returned failure for {feature}/{case_id}: {error_msg}")
        return _error_result(model, f"LLM failure: {error_msg[:200]}")

    data = result.data
    scores: dict[str, int] = {}
    for axis in axes:
        raw = data.get(axis)
        if isinstance(raw, (int, float)):
            scores[axis] = max(1, min(5, int(raw)))
        else:
            scores[axis] = 0

    overall_pass = _compute_pass(scores, axes)

    warnings = data.get("warnings") or []
    if not isinstance(warnings, list):
        warnings = [str(warnings)]
    warnings = [str(w) for w in warnings[:5]]

    fail_reasons = data.get("fail_reasons") or []
    if not isinstance(fail_reasons, list):
        fail_reasons = [str(fail_reasons)]
    fail_reasons = [str(r) for r in fail_reasons[:10]]

    # Append machine-readable reasons for axes below threshold
    for axis in axes:
        if scores.get(axis, 0) < 3:
            code = f"{axis}_below_3"
            if code not in fail_reasons:
                fail_reasons.append(code)

    return {
        "enabled": True,
        "model": model,
        "overallPass": overall_pass,
        "blocking": False,
        "scores": scores,
        "warnings": warnings,
        "reasons": fail_reasons,
    }


def _error_result(model: str, message: str) -> dict[str, Any]:
    """Return a judge result dict representing an evaluation error."""
    return {
        "enabled": True,
        "model": model,
        "overallPass": False,
        "blocking": False,
        "scores": {},
        "warnings": [message],
        "reasons": ["judge_error"],
    }
