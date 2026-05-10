# Interview Reference Corpus

面接対策向けの参考 Q&A データ。企業別サブディレクトリに JSONL 形式で格納する。

## ディレクトリ構成

```
interview/
├── README.md
├── pksha/references.jsonl
├── mitsui_bussan/references.jsonl
├── cyber_agent/references.jsonl
└── ...（企業別）
```

## JSONL Record Schema

```json
{
  "id": "{company_ascii}_{category}_{8char_hash}",
  "question": "面接での質問文",
  "answer": "自分の回答",
  "category": "gakuchika|company_motivation|self_pr|work_values|post_join_goals|research|reverse_questions|gakuchika_followup|industry_reason|role_reason|other",
  "company_name": "企業名",
  "capture_kind": "full_text",
  "usage_consent": true,
  "anonymized": true,
  "anonymization_level": "self_owned",
  "source_provenance": "self_owned_reference_interview"
}
```

## 安全規約

- 参考本文・特徴的表現・個別エピソードを prompt / API response / debug log に出してはいけない。
- runtime では統計・粗い構成特徴だけを使う。
- 各レコードは `capture_kind: "full_text"`, `usage_consent: true`, `anonymized: true`, `source_provenance` を持つこと。
