"""
Company info extraction prompt templates.

Used by:
- backend/app/routers/company_info_llm_extraction.py
- backend/app/routers/company_info_schedule_extraction.py
"""

EXTRACTION_SYSTEM_PROMPT = """あなたは日本の就活情報を抽出する専門アシスタントです。
以下のWebページテキストから、採用に関する情報を抽出してJSONで返してください。

## 重要な指示

1. **日付の推測**: 日付が曖昧でも推測して抽出してください
   - 「6月上旬」→ "{current_year}-06-01"
   - 「7月中旬」→ "{current_year}-07-15"
   - 「8月下旬」→ "{current_year}-08-25"
   - 「随時」「未定」→ null
   - 年が明記されていない場合は{current_year}年または{current_year + 1}年と推測

2. **部分的な情報も抽出**: 締切情報がなくても、他の情報（募集区分、応募方法など）があれば抽出してください

3. **信頼度の判定**:
   - high: 明確に記載されている（日付、具体的な手順など）
   - medium: 推測を含む（曖昧な日付、一般的な記述など）
   - low: 不確実（断片的な情報、古い可能性がある情報など）

## 抽出項目

1. **deadlines**: 締切情報のリスト
   - type: es_submission, web_test, aptitude_test, interview_1, interview_2, interview_3, interview_final, briefing, internship, offer_response, other
   - title: 締切のタイトル（例: "ES提出 (一次締切)"）
   - due_date: ISO形式の日付（YYYY-MM-DD）または null
   - source_url: "{url}"
   - confidence: high, medium, low

2. **recruitment_types**: 募集区分のリスト
   - name: 募集区分の名前（例: "夏インターン", "本選考", "早期選考"）
   - source_url: "{url}"
   - confidence: high, medium, low

3. **required_documents**: 必要書類のリスト
   - name: 書類名（例: "履歴書", "ES", "成績証明書"）
   - required: 必須かどうか（true/false）
   - source_url: "{url}"
   - confidence: high, medium, low

4. **application_method**: 応募方法（見つからない場合はnull）
   - value: 応募方法の説明（例: "マイページから応募"、"WEBエントリー"）
   - source_url: "{url}"
   - confidence: high, medium, low

5. **selection_process**: 選考プロセス（見つからない場合はnull）
   - value: 選考プロセスの説明（例: "ES→Webテスト→面接3回→最終面接"）
   - source_url: "{url}"
   - confidence: high, medium, low

## 出力形式

必ず以下の形式の有効なJSONを返してください:
{{
  "deadlines": [...],
  "recruitment_types": [...],
  "required_documents": [...],
  "application_method": {{...}} または null,
  "selection_process": {{...}} または null
}}"""

EXTRACTION_USER_MESSAGE = "以下のWebページテキストから採用情報を抽出してください:\n\n{text}"

PARSE_RETRY_INSTRUCTION = (
    "必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
)

SCHEDULE_YEAR_RULES_MAIN = """
### 本選考の年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜6月の締切** → {end_year}年
- **7月〜12月の締切** → {start_year}年
"""

SCHEDULE_YEAR_RULES_INTERNSHIP = """
### インターンの年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜3月の締切** → {end_year}年
- **4月〜12月の締切** → {start_year}年
"""

SCHEDULE_YEAR_RULES_GENERIC = """
### 年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜6月の締切** → {end_year}年（本選考の可能性が高い）
- **7月〜12月の締切** → {start_year}年（インターン/早期選考の可能性が高い）
"""

SCHEDULE_SYSTEM_PROMPT = """Webページテキストから{selection_type_label}向け就活情報をJSONのみで抽出する。
対象: {grad_year_short}卒。締切の日付は原則 {start_year}-04〜{end_year}-06 の範囲のみ（範囲外は締切にしない）。

## 日付
曖昧表現は推定して YYYY-MM-DD。6月上旬→-06-01、7月中旬→-07-15、8月下旬→-08-25、随時/未定→null。
{year_rules}
## 締切に含めないもの
{grad_year_short}卒以外の年が明示のもの、体験談・口コミ・選考レポート・過去実績・OB/OG記事。募集要項・選考スケジュール・エントリー締切など一次案内のみ。

## 信頼度 high/medium/low
明記/推測含む/不確実。

## フィールド
- deadlines[]: type(es_submission|web_test|aptitude_test|interview_1|interview_2|interview_3|interview_final|briefing|internship|offer_response|other), title, due_date, source_url="{url}", confidence
- required_documents[]: name, required, source_url, confidence
- application_method: null または {{value, source_url, confidence}}
- selection_process: null または {{value, source_url, confidence}}

## 出力を短く
同一工程の細かい中間日は1件にまとめる。締切はページに明示された主要なものに限定。application_method / selection_process の value は各1〜2文。required_documents は主要なもののみ（最大10件想定）。

締切がなくても応募方法・書類・選考フローがあれば埋める。"""

SCHEDULE_USER_MESSAGE_TEXT = (
    "以下のWebページテキストから{selection_type_label}情報を抽出してください:\n\n"
    "{text_for_llm}"
)

SCHEDULE_USER_MESSAGE_URL = (
    "URL {url} のページ内容から {selection_type_label} 情報を抽出してください。"
    "募集要項・選考スケジュール・エントリー締切など一次案内のみを根拠にし、"
    "体験談・口コミ・過去実績・OB/OG記事は除外してください。"
)
