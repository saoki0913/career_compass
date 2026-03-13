"""Local-only reference ES loader for quality profiling and overlap guard."""

from __future__ import annotations

from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional
import json
import re

REFERENCE_ES_PATH = (
    Path(__file__).resolve().parents[3] / "private" / "reference_es" / "es_references.json"
)

QUESTION_TYPE_QUALITY_HINTS: dict[str, list[str]] = {
    "basic": [
        "冒頭1文で設問への答えを明確に置く",
        "根拠は経験・行動・結果の順で具体化する",
        "抽象語だけで終わらず、読み手がイメージできる材料を入れる",
    ],
    "company_motivation": [
        "なぜその企業なのかを事業・価値観・職種理解まで落とし込む",
        "自分の経験と企業の接点を一本の論理でつなぐ",
        "入社後にどう貢献したいかまで自然に接続する",
    ],
    "intern_reason": [
        "そのインターンで得たい経験を具体的に述べる",
        "現状の課題感と参加目的を接続する",
        "受け身ではなく主体的に学びに行く姿勢を示す",
    ],
    "intern_goals": [
        "やりたいこと・学びたいことを1〜2点に絞る",
        "業務理解と自己の強みを接続する",
        "インターン後にどう成長したいかまで示す",
    ],
    "gakuchika": [
        "役割・課題・行動・成果を省略せず入れる",
        "数字や比較表現で成果の大きさを示す",
        "経験から得た強みを企業での再現性につなぐ",
    ],
    "self_pr": [
        "冒頭で強みを一言で明示する",
        "強みを裏付ける経験・工夫・成果を具体的に置く",
        "その強みを仕事や志望企業・職種でどう活かすかまでつなぐ",
    ],
    "post_join_goals": [
        "短期の挑戦と中長期のビジョンを混同しない",
        "事業理解に基づいた実現イメージを置く",
        "原体験や強みから将来像へ論理をつなぐ",
    ],
    "role_course_reason": [
        "その職種を選ぶ理由を経験ベースで示す",
        "業務理解と自分の適性を結びつける",
        "その職種でどう成長し価値を出すかまで書く",
    ],
    "work_values": [
        "価値観を抽象語で終わらせず行動例で裏付ける",
        "複数場面で一貫して表れる姿勢として示す",
        "仕事でどう生きるかまで接続する",
    ],
}

QUESTION_TYPE_SKELETONS: dict[str, list[str]] = {
    "basic": [
        "冒頭で設問への答えを一文で示す",
        "根拠となる経験・行動を一つ具体化する",
        "最後に仕事や今後への接続を短く置く",
    ],
    "company_motivation": [
        "冒頭で志望理由を端的に言い切る",
        "企業理解の軸を1点に絞って示す",
        "自分の経験や関心との接点を結ぶ",
        "入社後にどう価値を出したいかで締める",
    ],
    "intern_reason": [
        "冒頭で参加理由を明確に示す",
        "根拠となる経験や課題感を置く",
        "そのインターンで得たい経験や学びを添える",
    ],
    "intern_goals": [
        "冒頭で学びたいこと・達成したいことを示す",
        "背景にある経験や問題意識を置く",
        "インターン後の成長イメージで締める",
    ],
    "gakuchika": [
        "冒頭で取り組みの全体像と役割を示す",
        "課題と行動を具体的に述べる",
        "成果や変化を示す",
        "学びや再現性で締める",
    ],
    "self_pr": [
        "冒頭で強みを一言で示す",
        "強みを裏付ける経験・工夫・成果を置く",
        "その強みを仕事でどう活かすかにつなぐ",
    ],
    "post_join_goals": [
        "冒頭で手掛けたいこと・目指す姿を示す",
        "企業の事業や方向性との接点を置く",
        "獲得したい経験・スキルを具体化する",
        "中長期の成長イメージで締める",
    ],
    "role_course_reason": [
        "冒頭でその職種・コースを選ぶ理由を示す",
        "経験や強みとの接点を具体化する",
        "その役割でどう価値を出したいかで締める",
    ],
    "work_values": [
        "冒頭で大切にしている価値観を示す",
        "価値観が表れた行動例を置く",
        "仕事でどう生きるかに接続する",
    ],
}


def _load_reference_payload() -> dict:
    if not REFERENCE_ES_PATH.exists():
        return {"references": []}
    try:
        return json.loads(REFERENCE_ES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"references": []}


def _reference_sort_key(
    reference: dict,
    question_type: str,
    char_max: Optional[int],
    company_name: Optional[str],
) -> tuple[int, int, int]:
    type_penalty = 0 if reference.get("question_type") == question_type else 10
    reference_company = (reference.get("company_name") or "").strip().lower()
    target_company = (company_name or "").strip().lower()
    company_penalty = 0 if reference_company and target_company and reference_company == target_company else 1
    if char_max is None or reference.get("char_max") is None:
        char_penalty = 999
    else:
        char_penalty = abs(int(reference["char_max"]) - int(char_max))
    return (type_penalty, company_penalty, char_penalty)


def load_reference_examples(
    question_type: str,
    *,
    char_max: Optional[int] = None,
    company_name: Optional[str] = None,
    max_items: int = 2,
) -> list[dict]:
    payload = _load_reference_payload()
    references = payload.get("references", [])
    matched = [
        ref
        for ref in references
        if isinstance(ref, dict) and ref.get("question_type") == question_type
    ]
    matched.sort(
        key=lambda ref: _reference_sort_key(
            ref,
            question_type=question_type,
            char_max=char_max,
            company_name=company_name,
        )
    )
    return matched[:max_items]


def _normalize_for_overlap(text: str) -> str:
    return re.sub(r"[\s\u3000、。,.!！?？「」『』（）()［］\[\]・/／\-:：;；]", "", text or "").lower()


OVERLAP_BOILERPLATE_PATTERNS = [
    "志望する理由",
    "選択した理由",
    "活かしたい",
    "価値を出したい",
    "貢献したい",
    "成長したい",
    "挑戦したい",
    "実現したい",
    "経験を活かして",
    "なぜなら",
    "考えている",
]


def _strip_overlap_boilerplate(text: str, *, company_name: Optional[str], question_type: str) -> str:
    normalized = _normalize_for_overlap(text)
    for pattern in OVERLAP_BOILERPLATE_PATTERNS:
        normalized = normalized.replace(_normalize_for_overlap(pattern), "")
    if company_name:
        normalized = normalized.replace(_normalize_for_overlap(company_name), "")
    normalized = normalized.replace(_normalize_for_overlap(question_type), "")
    return normalized


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?])", (text or "").strip())
    return [part.strip() for part in parts if part.strip()]


def _contains_digit(text: str) -> bool:
    return bool(re.search(r"\d", text or ""))


def _count_concrete_markers(text: str) -> int:
    markers = re.findall(r"\d+[%％人名件社年カ月ヶ月月日週倍]", text or "")
    return len(markers)


def _looks_conclusion_first(text: str) -> bool:
    first_sentence = _split_sentences(text)[:1]
    if not first_sentence:
        return False
    head = first_sentence[0]
    return any(
        token in head
        for token in (
            "理由は",
            "志望する理由",
            "志望する。",
            "成し遂げたい",
            "大切にしている",
            "力を入れたこと",
            "私の",
        )
    )


def build_reference_quality_profile(
    question_type: str,
    *,
    char_max: Optional[int] = None,
    company_name: Optional[str] = None,
) -> Optional[dict]:
    references = load_reference_examples(
        question_type,
        char_max=char_max,
        company_name=company_name,
        max_items=3,
    )
    if not references:
        return None

    texts = [(ref.get("text") or "").strip() for ref in references]
    texts = [text for text in texts if text]
    if not texts:
        return None

    return {
        "reference_count": len(texts),
        "average_chars": round(sum(len(text) for text in texts) / len(texts)),
        "average_sentences": round(
            sum(len(_split_sentences(text)) for text in texts) / len(texts), 1
        ),
        "digit_rate": round(
            100 * sum(1 for text in texts if _contains_digit(text)) / len(texts)
        ),
        "concrete_marker_average": round(
            sum(_count_concrete_markers(text) for text in texts) / len(texts), 1
        ),
        "conclusion_first_rate": round(
            100 * sum(1 for text in texts if _looks_conclusion_first(text)) / len(texts)
        ),
        "quality_hints": QUESTION_TYPE_QUALITY_HINTS.get(
            question_type, QUESTION_TYPE_QUALITY_HINTS["basic"]
        ),
        "skeleton": QUESTION_TYPE_SKELETONS.get(
            question_type, QUESTION_TYPE_SKELETONS["basic"]
        ),
    }


def build_reference_quality_block(
    question_type: str,
    *,
    char_max: Optional[int] = None,
    company_name: Optional[str] = None,
) -> str:
    profile = build_reference_quality_profile(
        question_type,
        char_max=char_max,
        company_name=company_name,
    )
    if not profile:
        return ""
    hint_lines = "\n".join(f"- {hint}" for hint in profile["quality_hints"])
    skeleton_lines = "\n".join(f"- {item}" for item in profile["skeleton"])

    return f"""【参考ESから抽出した品質ヒント】
- 参考件数: {profile["reference_count"]}件
- 目安文字数: 約{profile["average_chars"]}字
- 目安文数: 約{profile["average_sentences"]}文
- 数字を含む割合: {profile["digit_rate"]}%
- 結論先行率: {profile["conclusion_first_rate"]}%
- 参考ESの本文・語句・特徴的な言い回し・細かな構成順を再利用しない

【この設問で意識する品質】
{hint_lines}

【参考ESから抽出した骨子】
{skeleton_lines}
- 骨子は論点配置の参考に留め、文章や流れをそのままなぞらない"""


def detect_reference_text_overlap(
    candidate_text: str,
    question_type: str,
    *,
    char_max: Optional[int] = None,
    company_name: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    candidate_norm = _normalize_for_overlap(candidate_text)
    candidate_core = _strip_overlap_boilerplate(
        candidate_text,
        company_name=company_name,
        question_type=question_type,
    )
    if len(candidate_norm) < 20:
        return False, None

    references = load_reference_examples(
        question_type,
        char_max=char_max,
        company_name=company_name,
        max_items=5,
    )
    if not references:
        return False, None

    for reference in references:
        reference_text = (reference.get("text") or "").strip()
        reference_norm = _normalize_for_overlap(reference_text)
        reference_core = _strip_overlap_boilerplate(
            reference_text,
            company_name=company_name,
            question_type=question_type,
        )
        if len(reference_norm) < 20 or len(reference_core) < 18 or len(candidate_core) < 18:
            continue

        matcher = SequenceMatcher(None, candidate_core, reference_core)
        longest = max((block.size for block in matcher.get_matching_blocks()), default=0)
        shorter_len = min(len(candidate_core), len(reference_core))
        threshold = min(52, max(28, int(shorter_len * 0.32)))
        if longest >= threshold:
            return True, f"rare_long_match:{reference.get('id', 'unknown')}:{longest}"

        moderate_matches = 0
        for sentence in _split_sentences(candidate_text):
            sentence_norm = _strip_overlap_boilerplate(
                sentence,
                company_name=company_name,
                question_type=question_type,
            )
            if len(sentence_norm) >= 22 and sentence_norm in reference_core:
                moderate_matches += 1
        if moderate_matches >= 2:
            return True, f"multi_sentence_match:{reference.get('id', 'unknown')}:{moderate_matches}"

    return False, None
