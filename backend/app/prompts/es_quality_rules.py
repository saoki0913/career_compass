"""Prompt-only ES quality and style guidance.

This module intentionally contains prompt guidance only. Validation remains in
`backend/app/services/es_review/validation.py`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StyleRule:
    text: str
    scope: str  # "all", "company", "short_only", "mid_long"
    applicable_templates: frozenset[str] | None = None
    priority: str = "should"  # "must", "should", "watch"


STYLE_RULES: list[StyleRule] = [
    StyleRule(
        "1文目は設問への答えを結論として言い切る（前置きや背景説明から入らない）",
        "all",
        priority="must",
    ),
    StyleRule("各文は役割を1つに絞り、同趣旨を言い換えて引き延ばさない", "all"),
    StyleRule("企業接点・貢献・活かし方は必要なら1文に圧縮してよく、段階を無理に増やさない", "all"),
    StyleRule(
        "ユーザーの元回答に含まれる数値・固有名詞（○人、○か月、ツール名、イベント名など）は必ず保持する",
        "all",
        priority="must",
    ),
    StyleRule("「整理した」「取り組んだ」「向き合った」のような抽象動詞だけで済ませず、具体的な行動（何をどうしたか）を1つ以上含める", "all"),
    StyleRule("同じ文末表現（〜したい、〜と考える、〜と考えている、〜していきたい）が連続しないよう、語尾を変化させる", "all"),
    StyleRule("「貢献する」「成長する」だけで終わらず、何にどう貢献するか・どの方向に成長するかを1語以上具体化する", "all"),
    StyleRule(
        "指定の字数下限を下回る改善案は再検証で弾かれる。要約しすぎず、下限まで本文を伸ばす",
        "mid_long",
        priority="watch",
    ),
    StyleRule(
        "下限が200字を超える設問では、具体を削りすぎず下限付近まで本文を伸ばす",
        "mid_long",
        priority="watch",
    ),
    StyleRule("短い字数制限では結論と根拠を凝縮し、冗長な修飾を削る", "short_only", priority="watch"),
    StyleRule(
        "抽象ラベルだけで終わらせず、行動の対象・範囲・頻度・比較を具体化する。ただし元回答にない数字は作らない",
        "all",
        frozenset({"self_pr", "work_values"}),
    ),
    StyleRule(
        "強みや価値観は抽象語の反復で済ませず、具体的な行動動詞を最低1組入れて再現性を示す",
        "all",
        frozenset({"self_pr", "work_values"}),
    ),
    StyleRule(
        "複数の施策がある場合は①②を文中にインラインで置く（リスト化しない）。簡潔な列挙（「①XX②YYの2施策」）は1文内でよいが、各施策を説明するときは「①では」を短い冒頭にして各項目を完結した文にする（句点「。」で区切る）",
        "all",
        frozenset({"gakuchika"}),
        priority="should",
    ),
    StyleRule(
        "理由・目標を複数挙げるときは「理由は二点ある。第一に〜第二に〜」等で数と順序を宣言する（ナンバリングは任意で、1つの理由だけなら不要）",
        "all",
        frozenset({"company_motivation", "intern_reason", "intern_goals", "post_join_goals", "role_course_reason"}),
        priority="should",
    ),
    StyleRule(
        "「関係者を巻き込みながら」「新たな価値を」「幅広い視野」等のLLM特有フレーズは、ユーザーの元回答に含まれていない限り使わない",
        "all",
        priority="watch",
    ),
]


TEMPLATE_GUIDANCE: dict[str, list[str]] = {
    "company_motivation": [
        "企業が重視する事業・価値観・方向性を1軸に絞り、自分の経験と接続する",
        "競合他社にも言える一般論ではなく、その企業で取り組みたい具体的な行動まで示す",
        "面接で深掘りされても答えられる範囲で、学生らしい成長意欲と学習姿勢を出す",
        "志望理由を複数述べるときは「理由は二点ある。」の形で数を宣言し、各理由を「第一に、[理由の核]からだ。」で始め、補足文を1〜2文つけて完結させる。各理由ブロック内は「根拠(経験)→企業接点→貢献像」の順で組み立てる",
    ],
    "gakuchika": [
        "冒頭で活動内容と自分の役割を示し、課題・行動・成果の順で追える本文にする",
        "元回答にある人数・期間・回数・成果などの数値を保持し、行動の具体性を落とさない",
        "締めは感想ではなく、得られた成果・変化・学びを客観的に示す",
        "複数の施策がある場合は①②を文中にインラインで使う。簡潔な列挙は1文内（「①XX②YYの2施策を実施した」）でよいが、各施策を説明するときは「①では」を短い冒頭にして各項目を完結した文にする（悪い例:「①XXでは…し、②YYでは…した。」→ 正しい例: 宣言「そこで2つの施策を実施した。」+展開「①では…した。②では…した。」）。「一つ目は〜二つ目は〜」のようなリスト風の羅列にしない",
    ],
    "intern_reason": [
        "参加理由、活かせる経験、持ち帰りたい学びを分けて示す",
        "企業が重視する能力・文化との接点を、設問の意図から外れない範囲で書く",
        "プログラム要素に具体的に触れ、受け身ではなく主体的に学びに行く姿勢を出す",
        "参加理由が複数ある場合は「理由は二つある。」で数を宣言し、各理由を「1つ目は、[理由の核]である。」で始め、補足文を1〜2文つけて完結させる。各理由ブロック内は「参加理由→経験接点→学び目標」の順で組み立てる",
    ],
    "intern_goals": [
        "冒頭で学びたいテーマ・スキルを明示し、現在の課題やスキルギャップにつなげる",
        "インターンで取り組みたいテーマ・技術領域を具体化する",
        "インターン後のキャリアビジョンと学びの関係を自然に示す",
        "学びたいことが複数ある場合は「目標は2つある。1つ目は〜2つ目は〜」で数を宣言し、各目標を「学びたいこと→現状の課題→成長後の姿」で完結させる",
    ],
    "post_join_goals": [
        "冒頭で携わりたい領域・活動を具体的に示す",
        "経験や原体験から入社後の行動へ論理をつなげる",
        "短期目標と中長期目標を並べる場合は、本文内で順序を明示し、時間軸ごとの役割を分ける",
        "企業固有のサービス・プロダクト・事業方向性に触れる場合は1軸に絞る",
        "入社後の目標が複数ある場合は数を宣言し（「やりたいことは二つある。」等）、各目標を「1つ目は、[目標の核]である。」で始め、補足文を1〜2文つけて完結させる。各目標ブロック内は「目標→原体験→企業での実現方法」の順で組み立てる",
    ],
    "role_course_reason": [
        "冒頭でその職種・コースの魅力を具体的に述べる",
        "経験を述べる文では、何を・どう行い・どんな結果につながったかを含める",
        "企業固有の職種特性・制度に触れる場合は、自分の適性と接続する",
        "選択理由が複数ある場合は「理由は二つある。」で数を宣言し、各理由を「第一に、[理由の核]からである。」で始め、補足文を1〜2文つけて完結させる。各理由ブロック内は「職種の魅力→適性の根拠→将来の貢献」の順で組み立てる",
    ],
    "self_pr": [
        "冒頭で強みを端的に表現し、設問への答えとして成立させる",
        "経験を述べる文では、場面・行動・結果を分けて具体化する",
        "締めでは強みを仕事でどう活かすかまで接続する",
        "強みの根拠エピソードが複数ある場合は、各エピソードを「強み→場面→行動→結果」で完結させる",
    ],
    "work_values": [
        "冒頭で価値観を端的なフレーズで表現する",
        "経験を述べる文では、価値観が表れた具体的な行動を示す",
        "締めでは価値観が仕事上の行動にどう反映されるかを示す",
        "価値観の裏付けが複数ある場合は、各エピソードを「価値観→場面→行動→変化」で完結させる",
    ],
    "basic": [
        "冒頭で設問への答えを端的に示す",
        "根拠は経験や行動で裏付ける",
        "主張が複数ある場合は、各項目を「主張→根拠→展望」で完結させる",
    ],
}


ABSTRACT_EXAMPLES: dict[str, tuple[str, str]] = {
    "company_motivation": (
        "[企業の特徴への共感]を理由に、[自分の経験・関心]を[入社後の具体行動]につなげたい。",
        "[元回答の経験]で培った視点を、[企業の事業・価値観]に沿った価値発揮へ生かしたい。",
    ),
    "intern_reason": (
        "[参加したい理由]を、[活かせる経験]と[持ち帰りたい学び]に分けて述べる。",
        "[元回答の経験]を土台に、[プログラム要素]を通じて[具体的な力]を伸ばしたい。",
    ),
    "intern_goals": (
        "[学びたいテーマ]を冒頭で示し、[現在の課題]から[インターンで試したい行動]へつなぐ。",
        "[元回答の経験]で見えた不足を、[プログラム要素]の中で具体的に深めたい。",
    ),
    "gakuchika": (
        "[活動内容]で[自分の役割]を担い、[課題]に対して[具体的行動]を行った。",
        "[人数・期間・成果など元回答の具体語]を保ち、[行動]と[成果・学び]を因果でつなぐ。",
    ),
    "post_join_goals": (
        "[入社後に携わりたい領域]で、[元回答の経験]を生かして[具体的な行動]に取り組みたい。",
        "[原体験・強み]を起点に、[企業の事業方向性]と接続した価値発揮を示す。",
    ),
    "role_course_reason": (
        "[職種・コースの魅力]を冒頭で示し、[元回答の経験]から[その役割で出したい価値]へつなぐ。",
        "[何を・どう・どんな結果]を含め、[職種特性]との適性を具体化する。",
    ),
    "work_values": (
        "[価値観の核]を端的に示し、[具体的な行動]で裏付ける。",
        "[元回答の経験]に表れた判断や行動を、[仕事での反映例]へつなぐ。",
    ),
}


def _dedupe_text_items(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _build_contextual_rules(
    template_type: str,
    char_max: int | None,
    grounding_mode: str,
) -> str:
    band = "short" if (char_max and char_max <= 220) else "mid_long"
    is_company_template = grounding_mode not in ("none",)

    grouped_rules: dict[str, list[str]] = {"must": [], "should": [], "watch": []}
    for rule in STYLE_RULES:
        if rule.applicable_templates and template_type not in rule.applicable_templates:
            continue
        should_include = False
        if rule.scope == "all":
            should_include = True
        elif rule.scope == "company" and is_company_template:
            should_include = True
        elif rule.scope == "short_only" and band == "short":
            should_include = True
        elif rule.scope == "mid_long" and band == "mid_long":
            should_include = True
        if should_include:
            grouped_rules[rule.priority].append(rule.text)

    must_lines = "\n".join(
        f"  {index}. {text}" for index, text in enumerate(grouped_rules["must"], start=1)
    )
    should_lines = "\n".join(
        f"  {index}. {text}" for index, text in enumerate(grouped_rules["should"], start=1)
    )
    watch_lines = "\n".join(f"- {text}" for text in grouped_rules["watch"])

    blocks: list[str] = []
    if must_lines:
        blocks.append(f"【MUST（絶対守る）】\n{must_lines}")
    if should_lines:
        blocks.append(f"【SHOULD（できる限り）】\n{should_lines}")
    if watch_lines:
        blocks.append(f"【WATCH（注意）】\n{watch_lines}")
    return "【結論ファースト（全設問・全文字数）】\n" + "\n".join(blocks)


def format_template_guidance(template_type: str) -> str:
    guidance = _dedupe_text_items(TEMPLATE_GUIDANCE.get(template_type, []))
    if not guidance:
        return ""
    return "【テンプレート別ガイダンス】\n" + "\n".join(f"- {item}" for item in guidance)


def get_abstract_examples(template_type: str) -> tuple[str, str]:
    return ABSTRACT_EXAMPLES.get(
        template_type,
        (
            "[設問への答え]を冒頭で示し、[元回答の経験・考え]で裏付ける。",
            "[具体的な行動・学び]を、[今後の接続]へ自然につなげる。",
        ),
    )


__all__ = [
    "STYLE_RULES",
    "format_template_guidance",
    "get_abstract_examples",
    "_build_contextual_rules",
]
