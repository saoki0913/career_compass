# Selection Schedule Extraction Prompt

> runtime_linkage: forbidden

## Runtime Source

- Constant: `backend/app/prompts/company_info_prompts.py` `SCHEDULE_SYSTEM_PROMPT`
- Builder: `backend/app/services/company_info/extract_deadlines.py` `_build_schedule_extraction_prompts`
- Caller: `backend/app/routers/company_info_llm_extraction.py` `extract_schedule_with_llm`
- Feature: `selection_schedule` and related schedule extraction features

## System Prompt

```text
Webページテキストから{selection_type_label}向け就活情報をJSONのみで抽出する。
対象: {grad_year_short}卒。締切の日付は原則 {start_year}-04〜{end_year}-06 の範囲のみ（範囲外は締切にしない）。
```

Runtime appends selection-type year rules:

- main selection: Jan-Jun -> `end_year`, Jul-Dec -> `start_year`
- internship: Jan-Mar -> `end_year`, Apr-Dec -> `start_year`
- generic: Jan-Jun likely main selection, Jul-Dec likely internship/early selection

## User Message

Text mode:

```text
以下のWebページテキストから{selection_type_label}情報を抽出してください:

{text_for_llm}
```

URL mode:

```text
URL {url} のページ内容から {selection_type_label} 情報を抽出してください。募集要項・選考スケジュール・エントリー締切など一次案内のみを根拠にし、体験談・口コミ・過去実績・OB/OG記事は除外してください。
```

## Output Contract

Fields:

- `deadlines[]`
- `required_documents[]`
- `application_method`
- `selection_process`

## Review Criteria

- 締切候補はユーザー承認前に確定 deadline と扱わない。
- 卒年レンジ外の日付を混入させない。
- 体験談、口コミ、選考レポート、過去実績、OB/OG 記事は除外する。
- Confidence high は明記された情報だけに付ける。
