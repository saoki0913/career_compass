"""
Hybrid search prompt templates (query expansion + HyDE).

Used by:
- backend/app/utils/hybrid_search.py
"""

QUERY_EXPANSION_SYSTEM_SHORT = "あなたは就活向け検索クエリ拡張アシスタントです。短いキーワードを就活文脈で展開してください。出力はJSONのみ。"

QUERY_EXPANSION_USER_SHORT = """キーワード: {query}

このキーワードに関連する就活向け検索クエリを{max_queries}件生成してください。
- 業界/企業の特徴、採用情報、求める人物像の観点で展開
- 各クエリは10〜30文字程度
"""

QUERY_EXPANSION_SYSTEM = """あなたは就活ES向けのRAG検索クエリ拡張アシスタントです。
元のクエリとは異なる語彙・切り口で、同じ情報を取得できる検索クエリを生成してください。
出力はJSONのみ。"""

QUERY_EXPANSION_USER = """元のクエリ:
{query}

指示:
- 元のクエリの同義語・言い換え・上位概念を使う（例: 「社風」→「企業文化」「職場環境」）
- 以下の切り口を網羅:
  1. 採用/選考の観点（募集要項、選考フロー、求める人物像）
  2. 事業/業務の観点（事業内容、業務内容、配属先）
  3. 文化/制度の観点（社風、研修、キャリアパス、福利厚生）
- 元のクエリと単語レベルで重複しない表現を優先
- 最大{max_queries}件
"""

QUERY_EXPANSION_KEYWORDS_SECTION = """
重要キーワード:
{keywords}
"""

QUERY_EXPANSION_OUTPUT_FORMAT = """
出力形式:
{{"queries": ["...","..."]}}"""

HYDE_SYSTEM_PROMPT = """あなたはRAG検索のHyDE生成アシスタントです。
ユーザーのクエリに対して、実際の企業HPの採用ページや事業紹介ページに書かれているような
具体的な文章（仮想文書）を日本語で生成してください。
出力はJSONのみ。

## 重要な注意事項
- 実在の数字（売上、従業員数等）は捏造しない。「X億円規模」のような表現を使う
- 就活生が検索しそうな語彙・フレーズを意識的に含める
- 採用ページの定型フレーズ（「求める人物像」「キャリアパス」「研修制度」等）を活用"""

HYDE_USER_MESSAGE = """クエリ:
{query}

指示:
- 実際の企業の採用ページ・事業紹介・社員インタビューに近いスタイルで書く
- 就活生の検索意図を推測し、その情報が含まれる文書を想定
- 「当社」「私たちは」など企業側の語り口を使う
- 200〜400文字程度（検索ヒットしやすい密度を意識）

出力形式:
{{"passage": "..."}}"""

QUERY_EXPANSION_SCHEMA = {
    "name": "rag_query_expansion",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["queries"],
        "properties": {
            "queries": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 5,
            }
        },
    },
}

HYDE_SCHEMA = {
    "name": "rag_hyde_passage",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["passage"],
        "properties": {"passage": {"type": "string"}},
    },
}
