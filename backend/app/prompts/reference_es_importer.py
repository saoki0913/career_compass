"""Normalize Notion reference ES records into local benchmark JSON."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
import hashlib
import html
import json
import re

from app.prompts.reference_es import REFERENCE_ES_PATH

DEFAULT_OUTPUT_PATH = REFERENCE_ES_PATH
DEFAULT_RAW_OUTPUT_PATH = DEFAULT_OUTPUT_PATH.with_name("raw_notion_dump.json")

PROPERTY_ALIASES: dict[str, tuple[str, ...]] = {
    "title": ("Title", "タイトル", "Name", "名前"),
    "question_type": ("Question Type", "question_type", "設問タイプ", "設問", "template_id"),
    "char_max": ("Char Max", "char_max", "文字数上限", "文字数", "上限文字数"),
    "company_name": ("Company Name", "company_name", "企業名", "会社名", "企業"),
    "text": ("Text", "text", "本文", "ES本文", "Answer", "回答"),
    "status": ("Status", "status", "ステータス"),
    "type": ("Type", "type", "タイプ"),
}

SUPPORTED_QUESTION_TYPES = {
    "company_motivation",
    "intern_reason",
    "intern_goals",
    "gakuchika",
    "self_pr",
    "post_join_goals",
    "role_course_reason",
    "work_values",
}
ACTIVE_STATUSES = {"active", "published", "ready", "in_use", ""}
MIN_TEXT_LENGTH = 40
QUESTION_ACTION_PHRASES = (
    "教えてください",
    "記述してください",
    "記入してください",
    "ご記入ください",
    "お書きください",
    "説明してください",
    "答えてください",
    "選択した理由",
    "選んだ理由",
    "志望理由",
    "志望動機",
)
QUESTION_TYPE_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "intern_reason",
        (
            "インターンに応募した理由",
            "このインターンシップに応募した理由",
            "本インターンシップを志望する理由",
            "インターン志望動機",
            "インターンを志望",
            "インターンの応募理由",
            "応募された動機",
            "参加する理由",
            "参加を希望する理由",
            "ワークショップに応募",
            "サマープログラムの志望理由",
            "インターンシップへの応募動機",
        ),
    ),
    (
        "intern_goals",
        (
            "インターンで",
            "経験したいこと",
            "やってみたい仕事",
            "やってみたいこと",
            "学びたいこと",
            "身につけたいこと",
            "得たいこと",
            "期待すること",
            "取り組んでみたいテーマ",
            "どのような経験をしたい",
            "今後どのように生かしていきたい",
        ),
    ),
    (
        "post_join_goals",
        (
            "どのような仕事をし",
            "何を成し遂げたい",
            "入社してからやりたいこと",
            "当社で成し遂げたい",
            "将来実現したい",
            "将来なりたい社会人像",
            "将来像",
            "会社に入ってやりたいこと",
            "長期的に何をやってみたい",
            "仕事を通じて成し遂げたい",
        ),
    ),
    (
        "role_course_reason",
        (
            "希望コースを選択",
            "コースを選択した理由",
            "コースを選んだ理由",
            "職種を選択した理由",
            "職種を選んだ理由",
            "その職種を志望する理由",
            "業務領域",
            "希望する理由",
            "選択したテーマ",
            "テーマを選んだ理由",
            "応募部門を志望する理由",
            "コースの志望理由",
            "デジタル企画を選択した理由",
            "部門を志望する理由",
        ),
    ),
    (
        "work_values",
        (
            "働くうえで大切にしている",
            "働く上で大切にしている",
            "仕事で重視する価値観",
            "大切にしている価値観",
            "仕事観",
            "大切にしたい価値観",
            "大切にしたい軸",
            "大切にしたいと思っている価値観",
            "考え方・価値観",
        ),
    ),
    (
        "gakuchika",
        (
            "学生時代に力を入れたこと",
            "挑戦し成し遂げたこと",
            "乗り越えた困難",
            "取り組んだ",
            "取り組んでいること",
            "力を入れて学んでいる",
            "研究活動",
            "最も力を入れて",
            "最も成果を出した",
            "最も挑戦した",
            "困難",
            "課題を見つけ",
            "リーダーシップを発揮",
            "周囲を巻き込んで",
            "協力し、何かを成し遂げた",
            "強みが発揮されたエピソード",
            "チームワーク",
            "挑戦（",
        ),
    ),
    (
        "self_pr",
        (
            "自己pr",
            "自己ｐｒ",
            "自己紹介と強み",
            "自分の強み",
            "あなたの強み",
            "セールスポイント",
            "prしてください",
        ),
    ),
    (
        "company_motivation",
        (
            "志望理由",
            "志望動機",
            "なぜ当社",
            "なぜ弊社",
            "当社を志望",
            "貴社を志望",
        ),
    ),
)


@dataclass
class ExtractedQuestion:
    question: str
    answer: str
    char_max: int | None
    question_type: str | None
    included: bool
    exclusion_reason: str | None = None


def _extract_plain_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [_extract_plain_text(item) for item in value]
        return "".join(part for part in parts if part).strip()
    if not isinstance(value, dict):
        return str(value).strip()

    for key in ("plain_text", "content"):
        if isinstance(value.get(key), str) and value[key].strip():
            return value[key].strip()

    value_type = value.get("type")
    if value_type and isinstance(value.get(value_type), dict):
        return _extract_plain_text(value[value_type])

    for key in ("title", "rich_text"):
        if isinstance(value.get(key), list):
            return _extract_plain_text(value[key])

    for key in ("name",):
        if isinstance(value.get(key), str) and value[key].strip():
            return value[key].strip()

    return ""


def _extract_property_value(prop: Any) -> Any:
    if prop is None:
        return None
    if isinstance(prop, str):
        return prop.strip()
    if isinstance(prop, (int, float, bool)):
        return prop
    if isinstance(prop, list):
        return [_extract_property_value(item) for item in prop]
    if not isinstance(prop, dict):
        return str(prop).strip()

    value_type = prop.get("type")
    if value_type == "title":
        return _extract_plain_text(prop.get("title", []))
    if value_type == "rich_text":
        return _extract_plain_text(prop.get("rich_text", []))
    if value_type == "number":
        return prop.get("number")
    if value_type == "select":
        select_value = prop.get("select")
        if isinstance(select_value, dict):
            return _extract_plain_text(select_value.get("name"))
        return _extract_plain_text(select_value)
    if value_type == "status":
        status_value = prop.get("status")
        if isinstance(status_value, dict):
            return _extract_plain_text(status_value.get("name"))
        return _extract_plain_text(status_value)
    if value_type == "multi_select":
        values = prop.get("multi_select", [])
        return [_extract_plain_text(item.get("name") if isinstance(item, dict) else item) for item in values]
    if value_type == "checkbox":
        return bool(prop.get("checkbox"))
    if value_type == "url":
        return _extract_plain_text(prop.get("url"))
    if value_type == "email":
        return _extract_plain_text(prop.get("email"))
    if value_type == "phone_number":
        return _extract_plain_text(prop.get("phone_number"))
    if value_type == "date":
        date_value = prop.get("date")
        if isinstance(date_value, dict):
            return _extract_plain_text(date_value.get("start"))
        return _extract_plain_text(date_value)
    if value_type in {"created_time", "last_edited_time"}:
        return _extract_plain_text(prop.get(value_type))

    if "name" in prop and isinstance(prop.get("name"), str):
        return prop["name"].strip()
    if "plain_text" in prop or "content" in prop:
        return _extract_plain_text(prop)
    if "properties" in prop:
        return prop["properties"]
    return _extract_plain_text(prop)


def _find_property(properties: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    lowered = {key.lower(): value for key, value in properties.items()}
    for alias in aliases:
        if alias in properties:
            return properties[alias]
        lowered_match = lowered.get(alias.lower())
        if lowered_match is not None:
            return lowered_match
    return None


def _normalize_question_type(value: str) -> str:
    normalized = value.strip()
    normalized = re.sub(r"[\s\-／/]+", "_", normalized)
    lowered = normalized.lower()
    alias_map = {
        "自己pr": "self_pr",
        "自己ｐｒ": "self_pr",
        "selfpr": "self_pr",
        "intern_reason": "intern_reason",
        "intern_goals": "intern_goals",
    }
    return alias_map.get(lowered, lowered)


def _normalize_char_max(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(value)
    text = _extract_plain_text(value)
    if not text:
        return None
    digits = [int(number) for number in re.findall(r"\d+", text)]
    if not digits:
        return None
    sizable = [number for number in digits if number >= 50]
    if sizable:
        return max(sizable)
    return max(digits)


def _extract_body_from_fetch_text(text: str) -> str:
    match = re.search(r"<content>\n?(.*?)\n?</content>", text, flags=re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()


def _extract_body_text(page: dict[str, Any], properties: dict[str, Any]) -> str:
    explicit_question_type = _extract_plain_text(
        _extract_property_value(_find_property(properties, PROPERTY_ALIASES["question_type"]))
    )
    property_text = _extract_property_value(_find_property(properties, PROPERTY_ALIASES["text"]))
    text = _extract_plain_text(property_text)
    if text and explicit_question_type:
        return text

    for key in ("markdown", "content", "body"):
        fallback = _extract_plain_text(page.get(key))
        if fallback:
            return fallback

    text_fallback = _extract_plain_text(page.get("text"))
    if text_fallback:
        return _extract_body_from_fetch_text(text_fallback)

    if text:
        return text

    for key in ("plain_text",):
        fallback = _extract_plain_text(page.get(key))
        if fallback:
            return fallback
    return ""


def _coerce_status(value: Any) -> str:
    text = _extract_plain_text(value).lower()
    return text or "active"


def _is_active_status(status: str) -> bool:
    return status in ACTIVE_STATUSES


def _page_title(page: dict[str, Any], properties: dict[str, Any]) -> str:
    value = _extract_property_value(_find_property(properties, PROPERTY_ALIASES["title"]))
    title = _extract_plain_text(value)
    if title:
        return title
    return _extract_plain_text(page.get("title"))


def _normalize_company_name(title: str) -> str | None:
    cleaned = re.sub(r"\s*ＥＳ\s*$", "", title, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*ES\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip(" -_/　")
    return cleaned or None


def _company_name(page: dict[str, Any], properties: dict[str, Any], title: str) -> str | None:
    company_value = _extract_property_value(_find_property(properties, PROPERTY_ALIASES["company_name"]))
    if isinstance(company_value, list):
        for item in company_value:
            name = _extract_plain_text(item)
            if name and not name.startswith("https://"):
                return name
    name = _extract_plain_text(company_value)
    if name and not name.startswith("https://"):
        return name
    page_company = _extract_plain_text(page.get("company_name"))
    if page_company:
        return page_company
    return _normalize_company_name(title)


def _prepare_body_text(text: str) -> str:
    cleaned = html.unescape(text)
    cleaned = re.sub(r"<br\s*/?>", "\n", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<empty-block\s*/>", "\n", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</?(?:content|details|summary|span|underline|columns|column)[^>]*>", "\n", cleaned)
    cleaned = re.sub(r"</?[^>]+>", "", cleaned)
    cleaned = cleaned.replace("\r\n", "\n")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _strip_markdown(line: str) -> str:
    plain = line.strip()
    plain = re.sub(r"^#+\s*", "", plain)
    plain = re.sub(r"^\*+\s*", "", plain)
    plain = re.sub(r"\*+$", "", plain)
    plain = re.sub(r"^[-*]\s+", "", plain)
    plain = re.sub(r"\s+", " ", plain)
    return plain.strip()


def _is_answer_heading(raw_line: str, plain_line: str) -> bool:
    if not raw_line.startswith("**"):
        return False
    if any(token in plain_line for token in QUESTION_ACTION_PHRASES):
        return False
    if plain_line.endswith(("?", "？")):
        return False
    return "字" in plain_line or plain_line.startswith("◆")


def _is_question_line(raw_line: str, plain_line: str) -> bool:
    if not plain_line:
        return False
    if plain_line.startswith(("【背景】", "【ゴール】", "【役割】", "【こだわり】", "【結果", "【今後")):
        return False
    if plain_line.startswith(("趣味", "スポーツ", "クラブ", "アルバイト", "GitHub", "所属ゼミ")):
        return False
    if plain_line.startswith(("質問:", "質問：", "◆設問")):
        return True
    if raw_line.startswith(("###", "##", "#", "**")):
        if plain_line.endswith(("?", "？")):
            return True
        if any(phrase in plain_line for phrase in QUESTION_ACTION_PHRASES):
            return True
    return False


def _extract_question_blocks(text: str) -> list[dict[str, Any]]:
    prepared = _prepare_body_text(text)
    lines = [line.rstrip() for line in prepared.splitlines()]
    blocks: list[dict[str, Any]] = []
    current: dict[str, list[str]] | None = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        plain_line = _strip_markdown(line)
        if not plain_line:
            continue

        if _is_question_line(line, plain_line):
            if current is not None:
                blocks.append(current)
            current = {"question_lines": [plain_line], "meta_lines": [], "answer_lines": []}
            continue

        if current is None:
            continue

        if not current["answer_lines"] and _is_answer_heading(line, plain_line):
            current["meta_lines"].append(plain_line)
            continue

        current["answer_lines"].append(plain_line)

    if current is not None:
        blocks.append(current)

    extracted: list[dict[str, Any]] = []
    for block in blocks:
        question = " ".join(block["question_lines"]).strip()
        meta = " ".join(block["meta_lines"]).strip()
        answer = "\n".join(block["answer_lines"]).strip()
        extracted.append(
            {
                "question": question,
                "meta": meta,
                "answer": answer,
                "char_max": _normalize_char_max(f"{question} {meta}".strip()),
            }
        )
    return extracted


def _classify_question_type(question: str, meta: str = "", answer: str = "") -> str | None:
    combined = f"{question} {meta}".strip().lower()
    if not combined:
        return None

    if any(keyword in combined for keyword in ("大切にしたい価値観", "考え方・価値観", "仕事で重視する価値観")):
        return "work_values"

    if any(keyword in combined for keyword in ("将来なりたい社会人像", "将来像", "会社に入ってやりたいこと", "長期的に何をやってみたい")):
        return "post_join_goals"

    if any(
        keyword in combined
        for keyword in (
            "テーマ・職種を希望する理由",
            "選択したテーマ",
            "テーマを選んだ理由",
            "デジタル企画を選択した理由",
            "希望するコース",
            "コースの志望理由",
            "応募部門を志望する理由",
        )
    ):
        return "role_course_reason"

    if any(
        keyword in combined
        for keyword in (
            "今回のインターンシップにご応募いただいた動機",
            "インターンシップへの応募動機",
            "インターンシップに応募した動機",
            "サマープログラムの志望理由",
            "ワークショップに応募",
            "応募された動機",
            "参加する理由",
            "参加を希望する理由",
        )
    ):
        return "intern_reason"

    if any(
        keyword in combined
        for keyword in (
            "得たいこと",
            "期待すること",
            "取り組んでみたいテーマ",
            "どのような経験をしたい",
            "今後どのように生かしていきたい",
        )
    ):
        return "intern_goals"

    if any(
        keyword in combined
        for keyword in (
            "自己pr",
            "自己ｐｒ",
            "自分の強み",
            "あなたの強み",
            "セールスポイント",
            "最も力を入れて",
            "最も成果を出した",
            "最も挑戦した",
            "周囲を巻き込んで",
            "チームワーク",
            "強みが発揮されたエピソード",
        )
    ):
        if any(keyword in combined for keyword in ("自己pr", "自己ｐｒ", "自分の強み", "あなたの強み", "セールスポイント")):
            return "self_pr"
    if any(
        keyword in combined
        for keyword in (
            "課題を見つけ",
            "リーダーシップを発揮",
            "困難",
        )
    ):
        return "gakuchika"

    if "志望動機" in combined or "志望理由" in combined:
        answer_prefix = answer[:160].lower()
        if "インターン" in answer_prefix:
            return "intern_reason"

    for question_type, keywords in QUESTION_TYPE_RULES:
        if any(keyword.lower() in combined for keyword in keywords):
            return question_type
    return None


def _make_reference_id(page_id: str, question_type: str, question: str, char_max: int | None, answer: str) -> str:
    digest_source = "|".join(
        [
            page_id.strip(),
            question_type.strip(),
            question.strip(),
            str(char_max or ""),
            answer.strip()[:120],
        ]
    )
    digest = hashlib.sha1(digest_source.encode("utf-8")).hexdigest()[:10]
    return f"{question_type}_{digest}"


def _reference_title(page_title: str, question: str, char_max: int | None) -> str:
    question_text = re.sub(r"^(質問:|質問：)", "", question).strip()
    question_text = question_text[:40].strip()
    title = page_title.strip() or "Reference ES"
    if question_text:
        title = f"{title} {question_text}"
    if char_max:
        title = f"{title} {char_max}字"
    return title


def _normalize_single_reference(
    *,
    page_id: str,
    page_title: str,
    company_name: str | None,
    question_type: str,
    char_max: int | None,
    text: str,
) -> dict[str, Any] | None:
    cleaned_text = text.strip()
    if len(cleaned_text) < MIN_TEXT_LENGTH:
        return None
    return {
        "id": _make_reference_id(page_id, question_type, page_title, char_max, cleaned_text),
        "question_type": question_type,
        "company_name": company_name,
        "char_max": char_max,
        "title": page_title,
        "text": cleaned_text,
    }


def _extract_reference_bundle_from_page(page: dict[str, Any], index: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    properties = page.get("properties") if isinstance(page.get("properties"), dict) else {}
    page_id = _extract_plain_text(page.get("id")) or f"notion_row_{index:03d}"
    page_title = _page_title(page, properties) or page_id
    status = _coerce_status(_extract_property_value(_find_property(properties, PROPERTY_ALIASES["status"])))
    page_type = _extract_plain_text(_extract_property_value(_find_property(properties, PROPERTY_ALIASES["type"])))
    body_text = _extract_body_text(page, properties)
    company_name = _company_name(page, properties, page_title)
    explicit_question_type = _normalize_question_type(
        _extract_plain_text(_extract_property_value(_find_property(properties, PROPERTY_ALIASES["question_type"])))
    )
    report: dict[str, Any] = {
        "page_id": page_id,
        "title": page_title,
        "company_name": company_name,
        "status": status,
        "page_type": page_type or None,
        "body_text": body_text.strip(),
        "items": [],
    }

    if not _is_active_status(status):
        report["page_exclusion_reason"] = f"inactive_status:{status}"
        return [], report

    if page_type and page_type != "ES":
        report["page_exclusion_reason"] = f"unsupported_page_type:{page_type}"
        return [], report

    if explicit_question_type:
        normalized = _normalize_single_reference(
            page_id=page_id,
            page_title=page_title,
            company_name=company_name,
            question_type=explicit_question_type,
            char_max=_normalize_char_max(_extract_property_value(_find_property(properties, PROPERTY_ALIASES["char_max"]))),
            text=body_text,
        )
        if normalized is None:
            report["items"].append(
                asdict(
                    ExtractedQuestion(
                        question=page_title,
                        answer=body_text.strip(),
                        char_max=_normalize_char_max(
                            _extract_property_value(_find_property(properties, PROPERTY_ALIASES["char_max"]))
                        ),
                        question_type=explicit_question_type,
                        included=False,
                        exclusion_reason="text_too_short",
                    )
                )
            )
            return [], report
        report["items"].append(
            asdict(
                ExtractedQuestion(
                    question=page_title,
                    answer=body_text.strip(),
                    char_max=normalized["char_max"],
                    question_type=explicit_question_type,
                    included=True,
                )
            )
        )
        return [normalized], report

    references: list[dict[str, Any]] = []
    for block in _extract_question_blocks(body_text):
        question = block["question"]
        meta = block["meta"]
        answer = block["answer"].strip()
        char_max = block["char_max"]
        question_type = _classify_question_type(question, meta, answer)
        exclusion_reason: str | None = None
        included = False

        if len(answer) < MIN_TEXT_LENGTH:
            exclusion_reason = "text_too_short"
        elif question_type not in SUPPORTED_QUESTION_TYPES:
            exclusion_reason = "unsupported_question_type"
        else:
            reference = {
                "id": _make_reference_id(page_id, question_type, question, char_max, answer),
                "question_type": question_type,
                "company_name": company_name,
                "char_max": char_max,
                "title": _reference_title(page_title, question, char_max),
                "text": answer,
            }
            references.append(reference)
            included = True

        report["items"].append(
            asdict(
                ExtractedQuestion(
                    question=f"{question} {meta}".strip(),
                    answer=answer,
                    char_max=char_max,
                    question_type=question_type,
                    included=included,
                    exclusion_reason=exclusion_reason,
                )
            )
        )

    return references, report


def _extract_pages(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    if isinstance(payload.get("results"), list):
        return [item for item in payload["results"] if isinstance(item, dict)]
    if isinstance(payload.get("pages"), list):
        return [item for item in payload["pages"] if isinstance(item, dict)]
    if isinstance(payload.get("data"), list):
        return [item for item in payload["data"] if isinstance(item, dict)]
    if isinstance(payload.get("properties"), dict):
        return [payload]
    return []


def build_reference_import_bundle(payload: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    references: list[dict[str, Any]] = []
    page_reports: list[dict[str, Any]] = []
    pages = _extract_pages(payload)

    for index, page in enumerate(pages, 1):
        page_references, page_report = _extract_reference_bundle_from_page(page, index)
        references.extend(page_references)
        page_reports.append(page_report)

    references.sort(
        key=lambda ref: (
            ref.get("question_type") or "",
            ref.get("company_name") or "",
            ref.get("char_max") or 9999,
            ref.get("title") or "",
        )
    )
    normalized = {"version": 1, "references": references}
    raw_report = {
        "version": 1,
        "source": "notion_reference_es_importer",
        "page_count": len(page_reports),
        "reference_count": len(references),
        "pages": page_reports,
    }
    return normalized, raw_report


def normalize_notion_reference_payload(payload: Any) -> dict[str, Any]:
    normalized, _ = build_reference_import_bundle(payload)
    return normalized


def build_reference_import_report(payload: Any) -> dict[str, Any]:
    _, report = build_reference_import_bundle(payload)
    return report


def load_notion_payload(input_path: str | Path) -> Any:
    return json.loads(Path(input_path).read_text(encoding="utf-8"))


def write_reference_payload(payload: dict[str, Any], output_path: str | Path = DEFAULT_OUTPUT_PATH) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def write_raw_payload(payload: Any, output_path: str | Path = DEFAULT_RAW_OUTPUT_PATH) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path
