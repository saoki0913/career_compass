# Gakuchika Initial Question Prompt

> runtime_linkage: forbidden

## Runtime Source

- `backend/app/prompts/gakuchika_prompts.py`
  - `INITIAL_QUESTION_SYSTEM_PROMPT`
  - `INITIAL_QUESTION_USER_MESSAGE`
- Caller: `backend/app/services/gakuchika/question_pipeline.py`
- Feature: `gakuchika`

## System Prompt

The runtime system prompt is composed from:

- `COACH_PERSONA`
- `QUESTION_TONE_AND_ALIGNMENT_RULES`
- `APPROVAL_AND_QUESTION_PATTERN`
- `ES_BUILD_QUESTION_PRINCIPLES`
- `REFERENCE_GUIDE_RUBRIC`
- `PROHIBITED_EXPRESSIONS`
- `question_few_shot_for(input_richness_mode)`

It includes this initial-question exception:

```text
ただし初回質問は前回回答が存在しないため、承認の代わりに、学生の入力内容に短く触れる温かい導入で始めてよい。
```

## User Message

```text
## テーマ
{gakuchika_title}

## 学生が記載した内容
{gakuchika_content}

## 初回入力の濃さ
{input_richness_mode}

## タスク
- 上記の内容を読み、ES 作成に必要な骨格を作るための最初の 1 問を生成する
- input_richness_mode が seed_only なら context / task を優先する
- input_richness_mode が rough_episode なら task / action を優先する
- input_richness_mode が almost_draftable なら action / result / role の質を優先する
- 学生が書いた内容と同じエピソード・同じ主題に留める
- 記載にない別活動や別人物を持ち出さない
```

## Output Contract

JSON only:

```json
{
  "question": "最初の質問",
  "answer_hint": "この質問に答えるヒント",
  "progress_label": "状況を整理中",
  "focus_key": "context",
  "input_richness_mode": "seed_only",
  "missing_elements": ["context", "task", "action", "result"],
  "ready_for_draft": false
}
```

## Review Criteria

- 初回入力から離れた別エピソードに飛ばない。
- 1問1論点で、最初から深掘りしすぎない。
- `focus_key`, `answer_hint`, `progress_label` が一致している。

