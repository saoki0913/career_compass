# Gakuchika Deep Dive Question Prompt

> runtime_linkage: forbidden

## Runtime Source

- Builder: `backend/app/prompts/gakuchika_prompt_builder.py` `build_deepdive_prompt_text`
- Constants: `STAR_EVALUATE_SYSTEM_PROMPT`, `STAR_EVALUATE_USER_MESSAGE`
- Feature: `gakuchika`

## System Prompt

Deep dive uses the coach persona plus:

```text
- このフェーズは、完成した ES を見たあとに「更に深掘りする」導線から始まる
- 目的は面接で話せる粒度まで解像度を上げること
- 質問は必ず ES 本文または会話履歴に既に出ている同じエピソードに留める
- 優先観点は role / challenge / action_reason / result_evidence / learning_transfer / credibility / future / backstory のいずれか 1 つだけ
```

## User Message

```text
## テーマ
{gakuchika_title}

## 完成したガクチカ ES
{draft_text}

## 会話履歴
{conversation}

## 深掘りフェーズ
{phase_name}: {phase_description}

## ドラフト診断タグ
{draft_diagnostics_json}
```

Runtime may append coverage summary and extended deep-dive round guidance.

## Output Contract

JSON fields include `question`, `answer_hint`, `progress_label`, `focus_key`, `interview_readiness`, `deepdive_recommendation_tags`, and risk/diagnostic fields.

## Review Criteria

- 元 ES / 会話にない事実を前提にしない。
- 面接で聞かれる根拠、判断理由、役割境界、再現性を補強している。
- 質問は 1 問 1 論点。

