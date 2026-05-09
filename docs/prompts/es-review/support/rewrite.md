# ES Rewrite Prompt

> runtime_linkage: forbidden

## Runtime Source

- Builder: `backend/app/prompts/es_templates/_prompt_builder.py` `build_template_rewrite_prompt`
- Caller: `backend/app/services/es_review/orchestrator.py`
- Feature: `es_review` / template-specific review feature
- Output mode: text-only rewrite

## System Prompt

The runtime builder composes a system prompt in this order.

```text
あなたは{template_role}である。

<task>
提出できる改善案本文を1件だけ作る。
</task>

<output_contract>
- 出力は改善案本文のみ
- 説明、前置き、箇条書き、引用符、JSON、コードブロックは禁止
- だ・である調で統一
</output_contract>

<constraints>
- 設問に正面から答える
- 元回答の具体的事実は保ち、構成と伝わり方を改善する
- ユーザー事実にない経験・役割・成果・数字を足さない
- 元回答・使えるユーザー事実・企業根拠カードにない数値、役職、経験、成果、企業施策を追加しない
- 文字数不足でも新事実で埋めず、既存事実の説明密度、接続、語尾、構成だけで調整する
- 前回不合格案に含まれる事実でも、正本入力にないものは削除する
- 企業根拠カードは方向性の補助に使い、未確認の固有施策・社内体制・数値として断定しない
- role_name があっても別職種や別コースを仮定しない
- 企業情報は設問タイプに応じて使い、required でない設問では補助的にだけ使う
- 企業根拠カードの固有名詞・施策名・組織名・英字略語を本文でそのまま増殖させない
- 本文で企業に触れるときは、方向性・価値観・重視姿勢に抽象化する
- 本文で企業に言及するときは企業名ではなく「{honorific}」を使う
- 設問の冒頭表現をそのまま繰り返して始めない
- 末尾で同じ文末表現を2文連続で使わない
- 最終文は具体的な行動や貢献で締め、抽象的な意気込みの羅列にしない
- 冗長な接続詞で文字数を浪費しない
</constraints>
```

Then it appends length policy, global conclusion-first rules, template focus, required elements, anti-patterns, focus guidance, short/midrange guidance, question-specific guidance, negative reframe guidance, company guidance, reference quality guidance, user fact guidance, playbook, and retry hints.

## User Message

```text
【条件】
{conditions}

【元の回答】
{answer}

この回答を、提出できる改善案に書き直してください。改善案本文のみを返してください。
```

## Dynamic Inputs

- `template_type`, `template_role`, `template_def`
- `question`, `answer`, `company_name`, `industry`, `internship_name`, `role_name`
- target character range, focus modes, reference quality block, allowed user facts, company evidence cards

## Review Criteria

- 元回答の事実、数字、固有名詞を保持している。
- 全設問タイプで、元回答・使えるユーザー事実・企業根拠カードにない数値、役職、経験、成果、企業施策を作っていない。
- 文字数不足や retry でも、新事実追加ではなく既存事実の説明密度と構成で調整している。
- 企業情報は required な設問だけで強く使い、補助設問では過剰に断定しない。
- 参考 ES 由来の言い回しをコピーしない。
- 本文のみを返し、説明や診断を混ぜない。
