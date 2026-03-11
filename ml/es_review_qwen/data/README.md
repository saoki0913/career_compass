# Seed Case Format

`build_teacher_dataset.py` は JSONL を入力に取る。1 行 1 case。

最小フィールド:

```json
{
  "id": "mitsubishi-post-join-001",
  "template_type": "post_join_goals",
  "question": "入社後にやりたいことを教えてください。",
  "answer": "事業を通じて価値を生みたいです。",
  "company_name": "三菱商事",
  "industry": "総合商社",
  "char_max": 400,
  "char_min": 390,
  "role_name": "総合職",
  "grounding_mode": "company_general",
  "company_evidence_cards": [
    {
      "theme": "事業理解",
      "claim": "成長領域への投資を進める",
      "excerpt": "中長期で新領域へ注力している"
    }
  ],
  "allowed_user_facts": [
    {
      "source": "current_answer",
      "text": "事業を通じて価値を生みたい。"
    }
  ]
}
```

任意フィールド:

- `teacher_top3`
  - 既に Claude teacher 出力を持っている場合
- `teacher_rewrite`
  - 同上
- `split_key`
  - train / valid / test を固定したい場合
- `intern_name`
- `evidence_coverage_level`
- `pairwise_preference`
  - `win / tie / lose`

推奨:

- 1 case につき improvement task と rewrite task の 2 レコードを作る
- `split_key` は同一 company / template / 元回答で固定する
- 実ユーザー ES を使う場合は、利用許諾と匿名化を前提にする
