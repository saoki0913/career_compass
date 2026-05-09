# RAG Query Expansion Prompt

> runtime_linkage: forbidden

## Runtime Source

- Constants: `backend/app/prompts/hybrid_search_prompts.py`
  - `QUERY_EXPANSION_SYSTEM_SHORT`
  - `QUERY_EXPANSION_USER_SHORT`
  - `QUERY_EXPANSION_SYSTEM`
  - `QUERY_EXPANSION_USER`
- Caller: `backend/app/rag/hybrid_search.py`

## Short Query System Prompt

```text
あなたは就活生の検索キーワードを企業の採用ページ・事業紹介で使われる語彙へ橋渡しする検索クエリ拡張アシスタントです。
短いキーワードから、業界構造・採用情報・働き方の切り口で多角的に展開してください。
出力はJSONのみ。
```

## Normal Query System Prompt

```text
あなたは就活ES向けのRAG検索クエリ拡張アシスタントです。
就活生の検索意図を、企業の採用ページ・事業紹介・社員インタビュー・IR資料で実際に使われる語彙へ変換し、
元のクエリとは異なる単語・切り口で同じ情報にヒットする検索クエリを生成してください。
出力はJSONのみ。
```

## User Message

Short query:

```text
キーワード: {query}

このキーワードに関連する就活向け検索クエリを{max_queries}件生成してください。
```

Normal query:

```text
元のクエリ:
{query}

指示:
- 元のクエリに含まれる単語をそのまま使わず、同義語・言い換え・上位概念に置き換える
- 採用/選考、事業/業務、文化/制度の3軸からまんべんなく展開する
- 最大{max_queries}件
```

## Output Contract

```json
{"queries": ["..."]}
```

## Review Criteria

- Search intent must remain recognizable.
- Queries should not drift into unrelated company facts.
- Expansion should diversify axes without becoming generic noise.

