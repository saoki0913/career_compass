"""Reference ES loader for quality profiling."""

from __future__ import annotations

from pathlib import Path
from statistics import pstdev
from typing import Optional
import json
import re

DEFAULT_REFERENCE_ES_PATH = (
    Path(__file__).resolve().parents[3] / "private" / "reference_es" / "es_references.json"
)
REFERENCE_ES_PATH = DEFAULT_REFERENCE_ES_PATH
REFERENCE_ES_CORPUS_DIR = Path(__file__).resolve().parents[1] / "reference" / "es_review"
REFERENCE_ES_TEXT_ARTIFACT_PATTERNS = (
    "【内容・詳細】",
    "文字以上",
    "文字以下",
    "お聞かせください",
    "教えてください",
)

QUESTION_TYPE_QUALITY_HINTS: dict[str, list[str]] = {
    "basic": [
        "冒頭1文で設問への答えを結論として明確に言い切る",
        "1文目では新情報として結論だけを言い切り、設問文の言い換えから入らない",
        "全体は3〜4文を目安にし、各文に役割を持たせて冗長な導入を置かない",
        "1文の中で結論と根拠を抱え込みすぎず、役割を分ける",
        "根拠は経験・行動・結果の順で具体化する",
        "抽象語だけで終わらず、読み手がイメージできる材料を入れる",
        "価値観と行動例を同じ文で混線させず、抽象→具体の順で置く",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "自己評価には必ず行動または結果の裏付けを1文内に同居させる",
    ],
    "company_motivation": [
        "1文目でその企業を志望する理由の核を結論として言い切る",
        "1文目で志望理由の核を言い切り、設問の復唱や前置きから始めない",
        "全体は4文前後で、結論→企業理解→自分との接点→貢献の順に畳む",
        "企業理解と自分の経験は別の文で整理し、1文に詰め込みすぎない",
        "自分の経験と企業の接点を一本の論理でつなぐ",
        "入社後にどう貢献したいかまで自然に接続する",
        "企業固有表現は1軸に絞り、事業・価値観・制度を列挙しない",
        "企業固有の事業名・制度名・理念キーワードを少なくとも1つ含める",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "企業固有情報は1軸（事業 or 価値観 or 制度のいずれか）に絞り、1文で完結させる",
    ],
    "intern_reason": [
        "1文目で参加理由の核を結論として言い切る",
        "1文目で参加理由を言い切り、説明の前置きを入れない",
        "全体は3文前後に収め、課題感と参加目的を重複させない",
        "現状課題と学びたいことを同じ文で反復せず、役割を分ける",
        "現状の課題感と参加目的を接続する",
        "受け身ではなく主体的に学びに行く姿勢を示す",
        "インターン名は冒頭1回までに留め、2回目以降は「本インターンシップ」や「本プログラム」に言い換える",
        "企業固有表現はプログラム理解か現場理解のどちらか1軸に絞る",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "学びたいことは最重要の1点に絞り、それが参加理由の核と直結するように書く",
    ],
    "intern_goals": [
        "1文目で達成したいことを結論として言い切る",
        "1文目で達成したいことを明示し、抽象的な導入を置かない",
        "全体は3文前後で、学びたいことを増やしすぎず焦点を保つ",
        "学びたいことと活かしたい強みを1文に詰め込みすぎない",
        "業務理解と自己の強みを接続する",
        "インターン後にどう成長したいかまで示す",
        "インターン名は冒頭1回までに留め、2回目以降は「本インターンシップ」や「本プログラム」に言い換える",
        "企業固有表現は1テーマに絞り、事業と制度を同列列挙しない",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "学びと貢献は別文に分け、学びたい内容を具体的に1つ挙げる",
    ],
    "gakuchika": [
        "1文目で取り組みの核を結論として言い切り、役割も短く添える",
        "1文目で何に取り組み、どんな役割を担ったかを置く",
        "全体は4文前後で、課題説明を長くしすぎず行動と成果に字数を使う",
        "課題説明と行動説明を同じ文で混線させず、読み手が追える順に並べる",
        "数字や比較表現で成果の大きさを示す",
        "課題の規模感（人数、期間、頻度）を示す数値を保持する",
        "経験から得た強みを企業での再現性につなぐ",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "複数施策は時系列と順序が分かるように配置し、各施策に結果を1語以上付ける",
        "成果の数字は文の主語か目的語の位置に置き、読み手の目に入る配置にする",
    ],
    "self_pr": [
        "1文目で強みの核を結論として言い切る",
        "1文目で強みを言い切り、自己紹介的な前置きを置かない",
        "全体は3〜4文を目安にし、強みの説明と活かし方を重複させない",
        "強みの定義と裏付け経験を別の文で整理し、同一文に詰め込みすぎない",
        "強みを裏付ける経験・工夫・成果を具体的に置き、人数・期間・件数・比率などの数値を最低1つ入れる",
        "強みの根拠となる行動を動詞レベルで具体化する（「整理した」ではなく「ホワイトボードに書き出した」等の行動動詞を使う）",
        "その強みを仕事や志望企業・職種でどう活かすかまでつなぐ",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "強みの名前は1回だけ出し、2回目以降は具体行動で示す",
    ],
    "post_join_goals": [
        "1文目で入社後に実現したいことを結論として言い切る",
        "1文目で入社後に実現したいことを言い切る",
        "全体は4文前後で、将来像の説明を広げすぎず事業理解と接続する",
        "実現したいこととその背景理由を別の文で整理する",
        "事業理解に基づいた実現イメージを置く",
        "原体験や強みから将来像へ論理をつなぐ",
        "企業固有表現は1テーマに絞り、事業・制度・カルチャーを一度に並べない",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "短期目標と中長期ビジョンは文を分け、時間軸ごとに役割を分担する",
    ],
    "role_course_reason": [
        "1文目でその職種・コースを選ぶ理由を結論として言い切る",
        "1文目でその職種を選ぶ理由を言い切り、一般論から入らない",
        "全体は4文前後で、職種理解と自分の適性を別々の文で整理する",
        "職種理解と企業理解を同じ文に押し込まず、役割の理由を先に立てる",
        "業務理解と自分の適性を結びつける",
        "その職種でどう成長し価値を出すかまで書く",
        "職種名・コース名は冒頭1回までに留め、2回目以降は「本コース」や「当該職種」に言い換える",
        "企業固有表現は職種理解を補強する範囲に留め、軸を増やしすぎない",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "適性・業務理解・将来像は文ごとに役割を分け、1文1論点で積む",
    ],
    "work_values": [
        "1文目で大切にしている価値観の核を結論として言い切る",
        "価値観を抽象語で終わらせず、人数・期間・件数・比率などの数値か複数場面の具体例で裏付ける",
        "全体は3文前後で、価値観の説明と行動例を混線させない",
        "価値観とその背景体験を1文に詰め込まず、抽象→具体の順で並べる",
        "複数場面で一貫して表れる姿勢として示し、行動動詞が見える具体例にする",
        "仕事でどう生きるかまで接続する",
        "冒頭は設問とは別の角度から切り出す（設問の語句を転写しない）",
        "文末は3文ごとに語尾を変える（〜だ/〜である/体言止め/〜した を交互に使う）",
        "自己評価には必ず行動または結果の裏付けを1文内に同居させる",
    ],
}

QUESTION_TYPE_SENTENCE_FLOWS: dict[str, dict[str, str]] = {
    "basic": {
        "sentence_1_role": "設問への答えを端的に言い切る（結論）",
        "sentence_2_role": "結論を裏付ける経験・行動を具体的に述べる（根拠）",
        "sentence_3_role": "行動の成果や学びを示す（成果）",
        "sentence_4_role": "今後への接続または応用を述べる（展望）",
        "transition_pattern": "前文の固有名詞を次文の主語に据える",
    },
    "company_motivation": {
        "sentence_1_role": "なぜその企業かの核心を言い切る（志望理由の結論）",
        "sentence_2_role": "企業の何に共感/注目しているかを1軸で述べる（企業理解）",
        "sentence_3_role": "自分のどの経験がそこにつながるかを述べる（接点）",
        "sentence_4_role": "入社後に何をしたいかを具体的に述べる（貢献）",
        "transition_pattern": "志望理由のキーワードで企業特性につなぎ、「私は〜の経験から」で自分に戻す",
    },
    "gakuchika": {
        "sentence_1_role": "何に取り組み、どんな立場だったか（結論+役割）",
        "sentence_2_role": "何が課題だったか（状況・課題）",
        "sentence_3_role": "何をどう工夫したか（行動）-- 最も字数を割く",
        "sentence_4_role": "どうなったか（成果）-- 数値があれば必ずここに",
        "transition_pattern": "前文の固有名詞を次文の主語に据える。課題→行動→成果は因果でつなぐ",
    },
    "self_pr": {
        "sentence_1_role": "強みを一言で定義する（結論）",
        "sentence_2_role": "強みを裏付ける具体的な経験を述べる（根拠）",
        "sentence_3_role": "経験の中での具体的行動と成果（行動+成果）",
        "sentence_4_role": "その強みを仕事でどう活かすか（応用）",
        "transition_pattern": "強みの具体行動を受けて、仕事での再現につなぐ",
    },
    "work_values": {
        "sentence_1_role": "大切にしている価値観を端的に言い切る（結論）",
        "sentence_2_role": "その価値観が形成された具体的な経験（根拠）",
        "sentence_3_role": "価値観に基づいて判断・行動した具体例（行動）",
        "sentence_4_role": "仕事でその価値観をどう発揮するか（展望）",
        "transition_pattern": "価値観→形成経験→実践例→仕事での発揮を因果でつなぐ",
    },
    "intern_reason": {
        "sentence_1_role": "参加理由の核を言い切る（結論）",
        "sentence_2_role": "現状の課題感や関心を述べる（背景）",
        "sentence_3_role": "インターンで何を学びたいかを具体的に（目的）",
        "transition_pattern": "課題感とインターン内容を直接結びつける",
    },
    "intern_goals": {
        "sentence_1_role": "達成したいことを言い切る（結論）",
        "sentence_2_role": "業務理解で何を得たいか（学び）",
        "sentence_3_role": "自分の強みをどう活かすか、成長後の姿（展望）",
        "transition_pattern": "学びたい内容と自分の強みを接続する",
    },
    "post_join_goals": {
        "sentence_1_role": "入社後に実現したいことを言い切る（結論）",
        "sentence_2_role": "その目標を持つに至った経験・背景（根拠）",
        "sentence_3_role": "企業の環境・事業をどう活用するか（企業接続）",
        "sentence_4_role": "具体的にどんな成果を目指すか（貢献）",
        "transition_pattern": "目標→経験→企業環境→具体成果を論理的に接続する",
    },
    "role_course_reason": {
        "sentence_1_role": "その職種/コースを選ぶ理由の核（結論）",
        "sentence_2_role": "自分の適性や経験との接点（根拠）",
        "sentence_3_role": "その職種/コースで何を実現したいか（展望）",
        "transition_pattern": "職種特性と自分の経験を具体的に結びつける",
    },
}

QUESTION_TYPE_SKELETONS: dict[str, list[str]] = {
    "basic": [
        "冒頭で設問への答えを一文で示す（全体の15%）",
        "根拠となる経験・行動を一つ具体化する（全体の60%）",
        "最後に仕事や今後への接続を短く置く（全体の25%）",
    ],
    "company_motivation": [
        "冒頭で志望理由を端的に言い切る（全体の15%）",
        "企業理解の軸を1点に絞って示す（全体の25%）",
        "自分の経験や関心との接点を結ぶ（全体の35%）",
        "入社後にどう価値を出したいかで締める（全体の25%）",
    ],
    "intern_reason": [
        "冒頭で参加理由を明確に示す（全体の20%）",
        "根拠となる経験や課題感を置く（全体の45%）",
        "そのインターンで得たい経験や学びを添える（全体の35%）",
    ],
    "intern_goals": [
        "冒頭で学びたいこと・達成したいことを示す（全体の20%）",
        "背景にある経験や問題意識を置く（全体の45%）",
        "インターン後の成長イメージで締める（全体の35%）",
    ],
    "gakuchika": [
        "冒頭で取り組みの全体像と役割を示す（全体の15%）",
        "課題と行動を具体的に述べる（全体の45%）",
        "成果や変化を示す（全体の25%）",
        "学びや再現性で締める（全体の15%）",
    ],
    "self_pr": [
        "冒頭で強みを一言で示す（全体の15%）",
        "強みを裏付ける経験・工夫・成果を置く（全体の55%）",
        "その強みを仕事でどう活かすかにつなぐ（全体の30%）",
    ],
    "post_join_goals": [
        "冒頭で手掛けたいこと・目指す姿を示す（全体の15%）",
        "企業の事業や方向性との接点を置く（全体の25%）",
        "獲得したい経験・スキルを具体化する（全体の35%）",
        "中長期の成長イメージで締める（全体の25%）",
    ],
    "role_course_reason": [
        "冒頭でその職種・コースを選ぶ理由を示す（全体の20%）",
        "経験や強みとの接点を具体化する（全体の50%）",
        "その役割でどう価値を出したいかで締める（全体の30%）",
    ],
    "work_values": [
        "冒頭で大切にしている価値観を示す（全体の20%）",
        "価値観が表れた行動例を置く（全体の50%）",
        "仕事でどう生きるかに接続する（全体の30%）",
    ],
}


def _load_legacy_reference_payload() -> dict:
    if not REFERENCE_ES_PATH.exists():
        return {"references": []}
    try:
        return json.loads(REFERENCE_ES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"references": []}


def _load_reference_jsonl(path: Path, question_type: str) -> list[dict]:
    references: list[dict] = []
    if not path.exists():
        return references
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return references
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        try:
            record = json.loads(stripped)
        except Exception:
            continue
        if not isinstance(record, dict):
            continue
        if record.get("question_type") != question_type:
            continue
        if record.get("capture_kind") != "full_text":
            continue
        if record.get("usage_consent") is not True or record.get("anonymized") is not True:
            continue
        if not record.get("source_provenance"):
            continue
        text = (record.get("text") or "").strip()
        if not _is_reference_text_usable(text, record.get("char_max")):
            continue
        references.append(record)
    return references


def _load_reference_payload(question_type: str | None = None) -> dict:
    if REFERENCE_ES_PATH != DEFAULT_REFERENCE_ES_PATH:
        return _load_legacy_reference_payload()
    if question_type:
        jsonl_path = REFERENCE_ES_CORPUS_DIR / question_type / "references.jsonl"
        return {"references": _load_reference_jsonl(jsonl_path, question_type)}
    return {"references": []}


def _safe_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _is_reference_text_usable(text: str, char_max: object) -> bool:
    stripped = text.strip()
    if len(stripped) < 20:
        return False
    if any(pattern in stripped for pattern in REFERENCE_ES_TEXT_ARTIFACT_PATTERNS):
        return False
    limit = _safe_int(char_max)
    if limit is not None and len(stripped) > max(limit + 80, int(limit * 1.35)):
        return False
    return True


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
    reference_char_max = _safe_int(reference.get("char_max"))
    if char_max is None or reference_char_max is None:
        char_penalty = 999
    else:
        char_penalty = abs(reference_char_max - int(char_max))
    return (type_penalty, company_penalty, char_penalty)


def load_reference_examples(
    question_type: str,
    *,
    char_max: Optional[int] = None,
    company_name: Optional[str] = None,
    max_items: int = 2,
) -> list[dict]:
    payload = _load_reference_payload(question_type)
    references = payload.get("references", [])
    matched = [
        ref
        for ref in references
        if isinstance(ref, dict)
        and ref.get("question_type") == question_type
        and ref.get("capture_kind") != "summary"
        and len((ref.get("text") or "").strip()) >= 20
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
            "力を入れた",
            "私の",
        )
    )


def _safe_pstdev(values: list[float]) -> float:
    if len(values) <= 1:
        return 0.0
    return float(pstdev(values))


def _variance_band(*, average: float, stddev: float, medium_ratio: float, high_ratio: float) -> str:
    baseline = max(1.0, average)
    ratio = stddev / baseline
    if ratio >= high_ratio:
        return "high"
    if ratio >= medium_ratio:
        return "medium"
    return "low"


def _merge_variance_bands(*bands: str) -> str:
    if "high" in bands:
        return "high"
    if "medium" in bands:
        return "medium"
    return "low"


def _build_conditional_quality_hints(
    *,
    average_chars: int,
    average_sentences: float,
    concrete_marker_average: float,
    conclusion_first_rate: int,
    variance_band: str,
    current_answer: str | None,
) -> list[str]:
    if not current_answer:
        return []

    hints: list[str] = []
    current_text = (current_answer or "").strip()
    if not current_text:
        return hints

    current_chars = len(current_text)
    current_sentences = len(_split_sentences(current_text))
    current_concrete_markers = _count_concrete_markers(current_text)

    char_gap = current_chars - average_chars
    if abs(char_gap) >= max(45, int(max(average_chars, 1) * 0.18)):
        if char_gap < 0:
            hints.append("今回の回答は参考群よりかなり短い。一般論を足すのではなく、行動・成果・企業接点のどれか1点を補って厚みを出す。")
        else:
            hints.append("今回の回答は参考群よりかなり長い。結論と根拠を残したまま、重複説明や同趣旨の言い換えを削って圧縮する。")

    if abs(current_sentences - average_sentences) >= 1.6:
        if current_sentences < average_sentences:
            hints.append("文数が少なめで役割が詰まりやすい。結論・根拠・接続の役割を分け、1文に情報を抱え込まない。")
        else:
            hints.append("文数が多めで論点が散りやすい。近い役割の文を統合し、主張の芯を3〜4文に寄せる。")

    if concrete_marker_average >= 1.5 and current_concrete_markers + 1 < concrete_marker_average:
        hints.append("具体性が参考群より弱い。数字、比較、役割、成果のうち1つだけでも明示して、抽象語だけで終えない。")

    if variance_band == "high":
        hints.append("参考群のばらつきが大きい。型にはめすぎず、論点順だけを参考にして自分の事実に合う長さと構成を選ぶ。")

    if conclusion_first_rate >= 80 and not _looks_conclusion_first(current_text):
        hints.append("冒頭1文で取り組みの核を置き、背景や前置きは2文目以降へ送る")

    if concrete_marker_average >= 1.0 and not _contains_digit(current_text):
        hints.append("数字や比較で成果や規模感を示し、抽象語だけで終えない")

    return hints


def build_reference_quality_profile(
    question_type: str,
    *,
    char_max: Optional[int] = None,
    company_name: Optional[str] = None,
    current_answer: Optional[str] = None,
) -> Optional[dict]:
    references = load_reference_examples(
        question_type,
        char_max=char_max,
        company_name=company_name,
        max_items=3,
    )
    if not references:
        return {
            "reference_count": 0,
            "average_chars": 0,
            "average_sentences": 0.0,
            "char_stddev": 0.0,
            "sentence_stddev": 0.0,
            "digit_rate": 0,
            "concrete_marker_average": 0.0,
            "concrete_marker_stddev": 0.0,
            "conclusion_first_rate": 0,
            "variance_band": "none",
            "quality_hints": QUESTION_TYPE_QUALITY_HINTS.get(
                question_type, QUESTION_TYPE_QUALITY_HINTS["basic"]
            ),
            "skeleton": QUESTION_TYPE_SKELETONS.get(
                question_type, QUESTION_TYPE_SKELETONS["basic"]
            ),
            "conditional_hints": [],
            "conditional_hints_applied": False,
        }

    texts = [(ref.get("text") or "").strip() for ref in references]
    texts = [text for text in texts if text]
    if not texts:
        return None

    char_lengths = [len(text) for text in texts]
    sentence_counts = [len(_split_sentences(text)) for text in texts]
    concrete_counts = [_count_concrete_markers(text) for text in texts]
    average_chars = round(sum(char_lengths) / len(char_lengths))
    average_sentences = round(sum(sentence_counts) / len(sentence_counts), 1)
    concrete_marker_average = round(sum(concrete_counts) / len(concrete_counts), 1)
    char_stddev = round(_safe_pstdev([float(value) for value in char_lengths]), 1)
    sentence_stddev = round(_safe_pstdev([float(value) for value in sentence_counts]), 1)
    concrete_marker_stddev = round(_safe_pstdev([float(value) for value in concrete_counts]), 1)
    variance_band = _merge_variance_bands(
        _variance_band(
            average=float(average_chars),
            stddev=float(char_stddev),
            medium_ratio=0.08,
            high_ratio=0.18,
        ),
        _variance_band(
            average=max(float(average_sentences), 1.0),
            stddev=float(sentence_stddev),
            medium_ratio=0.15,
            high_ratio=0.3,
        ),
        _variance_band(
            average=max(float(concrete_marker_average), 1.0),
            stddev=float(concrete_marker_stddev),
            medium_ratio=0.3,
            high_ratio=0.55,
        ),
    )
    conclusion_first_rate = round(
        100 * sum(1 for text in texts if _looks_conclusion_first(text)) / len(texts)
    )
    conditional_hints = _build_conditional_quality_hints(
        average_chars=average_chars,
        average_sentences=average_sentences,
        concrete_marker_average=concrete_marker_average,
        conclusion_first_rate=conclusion_first_rate,
        variance_band=variance_band,
        current_answer=current_answer,
    )

    return {
        "reference_count": len(texts),
        "average_chars": average_chars,
        "average_sentences": average_sentences,
        "char_stddev": char_stddev,
        "sentence_stddev": sentence_stddev,
        "digit_rate": round(
            100 * sum(1 for text in texts if _contains_digit(text)) / len(texts)
        ),
        "concrete_marker_average": concrete_marker_average,
        "concrete_marker_stddev": concrete_marker_stddev,
        "conclusion_first_rate": conclusion_first_rate,
        "variance_band": variance_band,
        "quality_hints": QUESTION_TYPE_QUALITY_HINTS.get(
            question_type, QUESTION_TYPE_QUALITY_HINTS["basic"]
        ),
        "skeleton": QUESTION_TYPE_SKELETONS.get(
            question_type, QUESTION_TYPE_SKELETONS["basic"]
        ),
        "conditional_hints": conditional_hints,
        "conditional_hints_applied": bool(conditional_hints),
    }


def build_reference_quality_block(
    question_type: str,
    *,
    char_max: Optional[int] = None,
    company_name: Optional[str] = None,
    current_answer: Optional[str] = None,
) -> str:
    profile = build_reference_quality_profile(
        question_type,
        char_max=char_max,
        company_name=company_name,
        current_answer=current_answer,
    )
    if not profile:
        return ""
    hint_lines = "\n".join(f"- {hint}" for hint in profile["quality_hints"])
    skeleton_lines = "\n".join(f"- {item}" for item in profile["skeleton"])

    conclusion_first_guidance = ""
    if profile["conclusion_first_rate"] > 60:
        conclusion_first_guidance = "\n- 冒頭1文で結論を置き、背景説明は2文目以降へ送る"
    conditional_hint_lines = "\n".join(
        f"- {hint}" for hint in profile.get("conditional_hints", [])
    )
    conditional_hint_block = (
        f"\n【今回の回答に対する追加ヒント】\n{conditional_hint_lines}"
        if conditional_hint_lines
        else ""
    )

    from app.prompts.logic_patterns import build_logic_patterns_block

    structural_block = build_logic_patterns_block(question_type, char_max=char_max)

    sentence_flow = QUESTION_TYPE_SENTENCE_FLOWS.get(question_type)
    if sentence_flow:
        flow_lines = []
        for key, value in sentence_flow.items():
            if key.startswith("sentence_"):
                flow_lines.append(f"- {value}")
            elif key == "transition_pattern":
                flow_lines.append(f"- 接続: {value}")
        structural_block += f"\n\n【文レベルの流れ】\n" + "\n".join(flow_lines)

    return f"""【参考ESから抽出した品質ヒント】
- 参考件数: {profile["reference_count"]}件
- 目安文字数: 約{profile["average_chars"]}字
- 目安文数: 約{profile["average_sentences"]}文
- 文字数ばらつき: {profile["char_stddev"]}
- 文数ばらつき: {profile["sentence_stddev"]}
- 数字を含む割合: {profile["digit_rate"]}%
- 具体性マーカー平均: {profile["concrete_marker_average"]}
- 結論先行率: {profile["conclusion_first_rate"]}%
- 参考群のばらつき: {profile["variance_band"]}
- 参考ESの本文・語句・特徴的な言い回し・細かな構成順を再利用しない
- 骨子は論点の順序の参考にだけ使い、型文や言い回しをコピーしない

【この設問で意識する品質】
{hint_lines}{conclusion_first_guidance}{conditional_hint_block}

【参考ESから抽出した骨子】
{skeleton_lines}
- 骨子は論点配置の参考に留め、文章や流れをそのままなぞらない{structural_block}"""
