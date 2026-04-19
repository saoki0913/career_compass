"""Schedule extraction helpers — prompt building, parsing, OCR gating."""

from __future__ import annotations

from urllib.parse import urlparse

from app.routers.company_info_candidate_scoring import _get_graduation_year
from app.routers.company_info_config import SCHEDULE_MIN_TEXT_CHARS
from app.routers.company_info_models import (
    ExtractedDeadline,
    ExtractedDocument,
    ExtractedItem,
    ExtractedScheduleInfo,
)


def _parse_extracted_schedule_info(
    data: dict | None,
    default_source_url: str,
) -> ExtractedScheduleInfo:
    deadlines = []
    raw_deadlines = data.get("deadlines") if isinstance(data, dict) else []
    if not isinstance(raw_deadlines, list):
        raw_deadlines = []
    for d in raw_deadlines:
        if not isinstance(d, dict):
            continue
        deadlines.append(
            ExtractedDeadline(
                type=d.get("type", "other"),
                title=d.get("title", ""),
                due_date=d.get("due_date"),
                source_url=d.get("source_url", default_source_url),
                confidence=d.get("confidence", "low"),
            )
        )

    required_documents = []
    raw_docs = data.get("required_documents") if isinstance(data, dict) else []
    if not isinstance(raw_docs, list):
        raw_docs = []
    for doc in raw_docs:
        if not isinstance(doc, dict):
            continue
        required_documents.append(
            ExtractedDocument(
                name=doc.get("name", ""),
                required=doc.get("required", True),
                source_url=doc.get("source_url", default_source_url),
                confidence=doc.get("confidence", "low"),
            )
        )

    am_data = data.get("application_method") if isinstance(data, dict) else None
    application_method = None
    if isinstance(am_data, dict):
        application_method = ExtractedItem(
            value=am_data.get("value", ""),
            source_url=am_data.get("source_url", default_source_url),
            confidence=am_data.get("confidence", "low"),
        )

    sp_data = data.get("selection_process") if isinstance(data, dict) else None
    selection_process = None
    if isinstance(sp_data, dict):
        selection_process = ExtractedItem(
            value=sp_data.get("value", ""),
            source_url=sp_data.get("source_url", default_source_url),
            confidence=sp_data.get("confidence", "low"),
        )

    return ExtractedScheduleInfo(
        deadlines=deadlines,
        required_documents=required_documents,
        application_method=application_method,
        selection_process=selection_process,
    )


def _count_schedule_signal_items(extracted: ExtractedScheduleInfo | None) -> int:
    if not extracted:
        return 0
    return (
        len(extracted.deadlines)
        + len(extracted.required_documents)
        + int(extracted.application_method is not None)
        + int(extracted.selection_process is not None)
    )


def _schedule_candidate_requires_ocr(
    candidate_url: str,
    extracted: ExtractedScheduleInfo | None,
    preview_text: str | None,
) -> bool:
    lower_url = urlparse(candidate_url).path.lower()
    if lower_url.endswith(".pdf"):
        return True
    if _count_schedule_signal_items(extracted) > 0:
        return False
    return len((preview_text or "").strip()) < SCHEDULE_MIN_TEXT_CHARS


def _build_schedule_extraction_prompts(
    url: str,
    graduation_year: int | None,
    selection_type: str | None,
    *,
    text_for_llm: str | None,
) -> tuple[str, str]:
    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100
    start_year = grad_year - 2
    end_year = grad_year - 1

    if selection_type == "main_selection":
        year_rules = f"""
### 本選考の年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜6月の締切** → {end_year}年
- **7月〜12月の締切** → {start_year}年
"""
    elif selection_type == "internship":
        year_rules = f"""
### インターンの年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜3月の締切** → {end_year}年
- **4月〜12月の締切** → {start_year}年
"""
    else:
        year_rules = f"""
### 年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜6月の締切** → {end_year}年（本選考の可能性が高い）
- **7月〜12月の締切** → {start_year}年（インターン/早期選考の可能性が高い）
"""

    selection_type_label = (
        "本選考"
        if selection_type == "main_selection"
        else "インターン" if selection_type == "internship" else "選考"
    )
    system_prompt_template = """Webページテキストから{selection_type_label}向け就活情報をJSONのみで抽出する。
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
    system_prompt = system_prompt_template.format(
        selection_type_label=selection_type_label,
        grad_year_short=grad_year_short,
        start_year=start_year,
        end_year=end_year,
        year_rules=year_rules,
        url=url,
    )
    if text_for_llm is not None:
        user_message_template = "以下のWebページテキストから{selection_type_label}情報を抽出してください:\n\n{text_for_llm}"
        user_message = user_message_template.format(
            selection_type_label=selection_type_label,
            text_for_llm=text_for_llm,
        )
    else:
        user_message = (
            f"URL {url} のページ内容から {selection_type_label} 情報を抽出してください。"
            "募集要項・選考スケジュール・エントリー締切など一次案内のみを根拠にし、"
            "体験談・口コミ・過去実績・OB/OG記事は除外してください。"
        )
    return system_prompt, user_message
