#!/usr/bin/env python3
"""Generate synthetic ES review seed cases from private reference ES data."""

from __future__ import annotations

import argparse
import json
import random
import re
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[3]
REFERENCE_PATH = ROOT / "private" / "reference_es" / "es_references.json"

COMPANYLESS_TEMPLATES = {"gakuchika", "self_pr", "work_values"}

ISSUE_LIBRARY = {
    "drop_conclusion": {
        "category": "結論の明確さ",
        "issue": "冒頭で何を伝えたいのかが明確ではなく、読み手が主張を掴みにくい。",
        "suggestion": "最初の一文で結論を言い切り、その後に根拠を接続する。",
    },
    "remove_specifics": {
        "category": "具体性",
        "issue": "経験の中身や工夫が抽象化されており、強みの根拠が弱い。",
        "suggestion": "行動や工夫を一段具体化し、読み手が場面を想像できる材料を入れる。",
    },
    "remove_numbers": {
        "category": "成果の裏付け",
        "issue": "成果の大きさが伝わらず、説得力が不足している。",
        "suggestion": "数字や比較表現を戻し、結果の変化が分かるようにする。",
    },
    "remove_company_anchor": {
        "category": "企業接続",
        "issue": "なぜその企業なのかの接点が弱く、他社でも通る表現に寄っている。",
        "suggestion": "企業の事業や価値観との接点を一点に絞って明示する。",
    },
    "remove_future": {
        "category": "将来接続",
        "issue": "入社後・参加後にどう活かしたいかが弱く、志望理由として閉じきれていない。",
        "suggestion": "経験をどう活かし、今後どう価値を出したいかまでつなぐ。",
    },
    "role_blur": {
        "category": "職種適合",
        "issue": "職種・コースを選ぶ理由がぼやけており、役割理解が伝わりにくい。",
        "suggestion": "その職種で活きる経験や適性を本文中で明示する。",
    },
    "compress_aggressively": {
        "category": "深さ不足",
        "issue": "短くまとめすぎており、志望動機や強みの深さが十分に伝わらない。",
        "suggestion": "重要な根拠を一つ戻し、結論を支える情報量を確保する。",
    },
    "genericize_terms": {
        "category": "表現の汎用化",
        "issue": "抽象語が多く、本人ならではの経験や関心が薄く見える。",
        "suggestion": "一般語を減らし、自分の経験から出てくる言葉に置き換える。",
    },
}


def _load_references(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [item for item in payload.get("references", []) if isinstance(item, dict)]


def _sentence_split(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?])", text.strip())
    return [part.strip() for part in parts if part.strip()]


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def _remove_digits(text: str) -> str:
    text = re.sub(r"\d+(?:\.\d+)?[%％]?", "", text)
    text = re.sub(r"\b[A-Z]{2,}\b", "", text)
    return re.sub(r"([、,]){2,}", r"\1", text)


def _genericize_terms(text: str) -> str:
    replacements = {
        "AI": "技術",
        "チャットアプリ": "サービス",
        "Web開発": "開発",
        "研究": "学び",
        "インターン": "経験",
        "業務フロー": "仕組み",
        "課題解決": "価値提供",
        "社会に貢献": "役に立つ",
        "コンサルタント": "仕事",
        "データ": "情報",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text


def _extract_role_name(text: str) -> str | None:
    patterns = [
        r"([一-龥ァ-ヶA-Za-z0-9・\-]+?)職",
        r"([一-龥ァ-ヶA-Za-z0-9・\-]+?)コース",
        r"([一-龥ァ-ヶA-Za-z0-9・\-]+?)部門",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            value = match.group(1).strip()
            if 1 <= len(value) <= 16:
                return value
    return None


def _build_question(template_type: str, company_name: str | None, role_name: str | None) -> str:
    company = company_name or "当社"
    role = role_name or "この職種"
    templates = {
        "company_motivation": f"{company}を志望する理由を教えてください。",
        "intern_reason": f"{company}のインターンを志望する理由を教えてください。",
        "intern_goals": f"{company}のインターンで学びたいこと・やりたいことを教えてください。",
        "gakuchika": "学生時代に力を入れたことを教えてください。",
        "self_pr": "自己PRをしてください。",
        "post_join_goals": f"{company}で入社後にやりたいことを教えてください。",
        "role_course_reason": f"{role}を選択した理由を教えてください。",
        "work_values": "働くうえで大切にしている価値観を教えてください。",
        "basic": "あなたが伝えたいことを教えてください。",
    }
    return templates.get(template_type, templates["basic"])


def _drop_conclusion(sentences: list[str]) -> list[str]:
    if len(sentences) <= 1:
        return sentences
    return sentences[1:] + [sentences[0]]


def _remove_specifics(sentences: list[str]) -> list[str]:
    stripped: list[str] = []
    for sentence in sentences:
        next_sentence = re.sub(r"[^。]*?(具体的には|たとえば|例えば|際、|中で|として|を通じて)", "", sentence)
        next_sentence = re.sub(r"[^。]*?(改善|向上|実現|達成|担当|推進)", "", next_sentence)
        stripped.append(next_sentence or sentence)
    return stripped


def _remove_company_anchor(sentences: list[str], company_name: str | None) -> list[str]:
    anchored: list[str] = []
    for sentence in sentences:
        next_sentence = sentence.replace(company_name or "", "貴社")
        if any(token in next_sentence for token in ("貴社", "御社", "当社", "企業", "事業", "価値観")):
            next_sentence = next_sentence.replace("貴社", "").replace("御社", "")
        anchored.append(next_sentence)
    return [sentence for sentence in anchored if sentence.strip()]


def _remove_future(sentences: list[str]) -> list[str]:
    filtered = [
        sentence
        for sentence in sentences
        if not any(token in sentence for token in ("成長", "貢献", "入社後", "将来", "活かし", "挑戦"))
    ]
    return filtered or sentences[:-1] or sentences


def _role_blur(sentences: list[str], role_name: str | None) -> list[str]:
    if not role_name:
        return sentences
    blurred = []
    for sentence in sentences:
        next_sentence = sentence.replace(role_name, "この仕事")
        next_sentence = next_sentence.replace(f"{role_name}職", "この仕事")
        blurred.append(next_sentence)
    return blurred


def _compress_aggressively(sentences: list[str]) -> list[str]:
    if len(sentences) <= 2:
        return sentences[:1]
    kept = [sentences[0], sentences[-1]]
    return kept


def _apply_transforms(
    reference: dict,
    transform_names: tuple[str, ...],
) -> tuple[str, list[dict[str, str]]]:
    text = str(reference.get("text") or "").strip()
    company_name = str(reference.get("company_name") or "").strip() or None
    role_name = _extract_role_name(text)
    sentences = _sentence_split(text)

    transform_functions: dict[str, Callable[[list[str]], list[str]]] = {
        "drop_conclusion": _drop_conclusion,
        "remove_specifics": _remove_specifics,
        "remove_numbers": lambda items: [_remove_digits(item) for item in items],
        "remove_company_anchor": lambda items: _remove_company_anchor(items, company_name),
        "remove_future": _remove_future,
        "role_blur": lambda items: _role_blur(items, role_name),
        "compress_aggressively": _compress_aggressively,
        "genericize_terms": lambda items: [_genericize_terms(item) for item in items],
    }

    current = sentences
    issues: list[dict[str, str]] = []
    for transform_name in transform_names:
        if transform_name not in transform_functions:
            continue
        current = transform_functions[transform_name](current)
        issue = ISSUE_LIBRARY.get(transform_name)
        if issue and issue not in issues:
            issues.append(issue)

    answer = "".join(current).strip()
    answer = re.sub(r"\s+", "", answer)
    answer = re.sub(r"。{2,}", "。", answer)
    answer = answer.replace("、、", "、")
    if answer and not answer.endswith(("。", "！", "？")):
        answer += "。"

    if _normalize_text(answer) == _normalize_text(text):
        answer = _genericize_terms(answer)

    return answer, issues[:3]


def _fallback_issues(template_type: str, company_name: str | None, role_name: str | None) -> list[dict[str, str]]:
    base = [
        {
            "category": "具体性",
            "issue": "経験や工夫の描写が薄く、読み手が印象を持ちにくい。",
            "suggestion": "自分が取った行動や判断を一段具体化して書く。",
        },
        {
            "category": "構成",
            "issue": "結論と根拠のつながりが弱く、主張が散って見える。",
            "suggestion": "結論を先に置き、その後に根拠を支える順で並べる。",
        },
        {
            "category": "将来接続",
            "issue": "この経験を今後どう活かすかが弱く、志望理由として締まりに欠ける。",
            "suggestion": "経験から得た強みを次の挑戦にどうつなげるかまで書く。",
        },
    ]
    if template_type not in COMPANYLESS_TEMPLATES and company_name:
        base[2] = {
            "category": "企業接続",
            "issue": f"{company_name}を選ぶ理由が薄く、他社でも通る表現に見える。",
            "suggestion": "企業の方向性や価値観と、自分の経験の接点を一点だけ明示する。",
        }
    if template_type == "role_course_reason" and role_name:
        base[1] = {
            "category": "職種適合",
            "issue": f"{role_name}を選ぶ理由が十分に立っておらず、適性が伝わりにくい。",
            "suggestion": "その職種で活きる経験や関心を本文に戻す。",
        }
    return base


def _build_variant_recipes(role_name: str | None, company_name: str | None) -> list[tuple[str, ...]]:
    recipes: list[tuple[str, ...]] = [
        ("drop_conclusion", "compress_aggressively"),
        ("remove_specifics", "genericize_terms"),
        ("remove_numbers", "remove_future"),
        ("remove_company_anchor", "genericize_terms"),
        ("drop_conclusion", "remove_future"),
        ("remove_specifics", "remove_numbers", "compress_aggressively"),
        ("genericize_terms", "compress_aggressively"),
        ("remove_numbers", "genericize_terms"),
    ]
    if company_name:
        recipes.append(("remove_company_anchor", "remove_future", "compress_aggressively"))
    if role_name:
        recipes.append(("role_blur", "remove_specifics"))
        recipes.append(("role_blur", "remove_future", "genericize_terms"))
    return recipes


def _build_case(reference: dict, variant_index: int, transform_names: tuple[str, ...]) -> dict | None:
    text = str(reference.get("text") or "").strip()
    if not text:
        return None
    company_name = str(reference.get("company_name") or "").strip() or None
    role_name = _extract_role_name(text)
    answer, issues = _apply_transforms(reference, transform_names)
    if not answer or len(_normalize_text(answer)) < max(20, len(_normalize_text(text)) // 5):
        return None
    if _normalize_text(answer) == _normalize_text(text):
        return None

    template_type = str(reference.get("question_type") or "basic")
    char_max = max(int(reference.get("char_max") or len(text)), len(text))
    target_length = min(char_max, len(text))
    char_min = max(0, target_length - 10)
    teacher_top3 = issues[:3]
    if len(teacher_top3) < 3:
        for issue in _fallback_issues(template_type, company_name, role_name):
            if issue not in teacher_top3:
                teacher_top3.append(issue)
            if len(teacher_top3) == 3:
                break

    return {
        "id": f"{reference.get('id')}::v{variant_index:02d}",
        "template_type": template_type,
        "question": _build_question(template_type, company_name, role_name),
        "answer": answer,
        "company_name": company_name,
        "char_max": char_max,
        "char_min": char_min,
        "role_name": role_name,
        "grounding_mode": "company_general" if company_name and template_type not in COMPANYLESS_TEMPLATES else "none",
        "allowed_user_facts": [{"source": "current_answer", "text": answer}],
        "teacher_top3": teacher_top3,
        "teacher_rewrite": text,
        "split_key": str(reference.get("id") or ""),
        "metadata": {
            "source_reference_id": reference.get("id"),
            "variant_index": variant_index,
            "transforms": list(transform_names),
            "reference_title": reference.get("title"),
        },
    }


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic seed cases for Qwen ES review training.")
    parser.add_argument(
        "--references",
        default=str(REFERENCE_PATH),
        help="Path to private reference ES payload",
    )
    parser.add_argument(
        "--output",
        default=str(ROOT / "ml" / "es_review_qwen" / "data" / "generated" / "seed_cases.jsonl"),
        help="Output JSONL path",
    )
    parser.add_argument("--max-references", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    references = _load_references(Path(args.references))
    if args.max_references:
        references = references[: args.max_references]

    rows: list[dict] = []
    for reference in references:
        text = str(reference.get("text") or "").strip()
        role_name = _extract_role_name(text)
        company_name = str(reference.get("company_name") or "").strip() or None
        recipes = _build_variant_recipes(role_name, company_name)
        random.shuffle(recipes)
        for index, recipe in enumerate(recipes, start=1):
            case = _build_case(reference, index, recipe)
            if case is not None:
                rows.append(case)

    _write_jsonl(Path(args.output), rows)
    summary = {
        "references": len(references),
        "cases": len(rows),
        "output": str(args.output),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
