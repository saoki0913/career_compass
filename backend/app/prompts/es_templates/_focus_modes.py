"""Focus-mode prompt guidance for ES template retries."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FocusModeContext:
    """Context for dynamic focus mode prompt generation."""

    char_min: int | None = None
    char_max: int | None = None
    current_length: int | None = None
    shortfall: int | None = None
    delta_band: str | None = None
    latest_failed_length: int | None = None
    template_type: str | None = None


def _dedupe_text_items(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _dynamic_length_focus_min(ctx: FocusModeContext | None) -> str:
    """Generate delta-band-aware length_focus_min guidance."""
    if not ctx or not ctx.delta_band:
        return "\n".join([
            "【今回の修正フォーカス】",
            "- 不足字数を埋めることを最優先にする",
            "- 一般論の水増しではなく、既存の経験・役割・企業接点のつながりを補う",
            "- 最小字数に届くまで、最後の1文も使って意味を保ったまま伸ばす",
        ])

    shortfall_line = ""
    if ctx.current_length and ctx.char_min and ctx.shortfall:
        shortfall_line = f"- 現在{ctx.current_length}字、目標{ctx.char_min}字まで{ctx.shortfall}字不足"

    strategy_map = {
        "large": (
            "- 既存事実の範囲で2〜3文追加する。結論を動かさず、根拠経験→学び→企業/役割接点を順に展開する\n"
            "- 1文あたり30〜50字を目安に、行動の背景・判断理由・得られた示唆を補う"
        ),
        "medium": (
            "- 既存の経験・行動・学び・企業接点から1文追加して目標へ近づける\n"
            "- 追加する1文は、既存文脈の具体化か因果の補足にする"
        ),
        "small": (
            "- 既存文脈の1〜2箇所に修飾句（対象・手段・結果の具体化）を加えて到達する\n"
            "- 行動の対象・範囲・手段を1語追加するか、成果を1句で具体化する"
        ),
        "tiny": (
            "- 既存文の1箇所に修飾語（数値・対象名・方法）を加えるだけで到達する\n"
            "- 意味を変えず、描写の密度を上げる"
        ),
    }

    strategy = strategy_map.get(ctx.delta_band, strategy_map["medium"])

    lines = ["【今回の修正フォーカス: 文字数不足の解消】"]
    if shortfall_line:
        lines.append(shortfall_line)
    lines.append(strategy)
    lines.append("- 一般論の水増しではなく、元回答にある事実・経験・判断のつながりを補う")
    lines.append("- 新しい経験・数値・役職・企業施策を捏造しない")
    if ctx.char_max:
        lines.append(
            f"- 伸ばした後に{ctx.char_max}字を超える場合は、重複する接続語・抽象語・補助説明を削って上限内に戻す"
        )
    return "\n".join(lines)


_STATIC_GUIDANCE_MAP: dict[str, str] = {
    "normal": "",
    "length_focus_max": "\n".join([
        "【今回の修正フォーカス】",
        "- 最大字数を超えないことを最優先にする",
        "- 意味の重複、冗長な接続、同趣旨の言い換えから先に削る",
        "- 核心の経験・企業接点・結論は残したまま、圧縮して収める",
    ]),
    "style_focus": "\n".join([
        "【今回の修正フォーカス】",
        "- 全文をだ・である調に統一する",
        "- 文末を`だ/である/体言止め`のいずれかに統一する。`した`は許容する",
        "- 文末だけを機械的に変えず、読点配置も含め1本の本文として自然に整える",
    ]),
    "grounding_focus": "\n".join([
        "【今回の修正フォーカス】",
        "- 企業や役割との接点を1点だけ明確にする",
        "- 企業根拠カードから方向性・価値観を1句拾い、自分の経験との接点として1文で組み込む",
        "- 固有名詞を増やしすぎず、方向性・価値観・役割期待の抽象度で接続する",
    ]),
    "fact_preservation_focus": "\n".join([
        "【今回の修正フォーカス】",
        "- 元回答の数値・役職名・経験名を一切改変しない",
        "- 新しい実績、割合、役割、経験を足さない",
        "- 表現だけを整え、事実関係は元回答どおりに保つ",
    ]),
    "answer_focus": "\n".join([
        "【今回の修正フォーカス】",
        "- 冒頭で結論ファーストに書き、読み手に伝えたいことが1文目で明確に伝わる構成にする",
        "- 前置き・背景説明は2文目以降へ送り、1文目は答えの核だけを置く",
        "- 設問文のオウム返しや言い換えで始めない",
    ]),
    "opening_focus": "\n".join([
        "【今回の修正フォーカス】",
        "- 設問文の言い換えで始めず、結論から書き出す",
        "- 冒頭2文で結論+根拠のみ。設問文のオウム返し、前置き句、背景説明の3つを排除する",
        "- 冒頭2文の役割を整理し、前置きを削る",
    ]),
    "quantify_focus": "\n".join([
        "【今回の修正フォーカス】",
        "- 抽象ラベルだけで終わらせず、行動の対象・範囲・頻度・比較を具体化する。ただし元回答にない数字は作らない",
        "- 強みや価値観は具体的な行動動詞で裏づけ、再現性が見える形にする",
    ]),
    "structure_focus": "\n".join([
        "【今回の修正フォーカス】",
        "- 箇条書きや断片ではなく、つながった本文として書き切る",
        "- 文と文をつなぐ接続表現を入れ、最後の文を「。」で終える",
        "- 1文ごとの役割を整理し、途中で切れないようにする。段落ではなく1本の散文にする",
    ]),
    "positive_reframe_focus": "\n".join([
        "【今回の修正フォーカス】",
        "- 自己否定語をそのまま残さず、元の事実を保ったまま前向きな表現へ言い換える",
        "- 準備・責任感・学習姿勢・確認力など、仕事で再現できる行動特性として示す",
    ]),
    "fact_safety_length": "\n".join([
        "【今回の複合修正フォーカス】",
        "- 最優先は事実保全。元回答にない数値・役職・実績・経験は足さない",
        "- 文字数不足や超過は、既存事実の説明密度と文の接続だけで調整する",
        "- 事実を守れない場合は、文字数より事実保全を優先する",
    ]),
    "fact_safety_structure": "\n".join([
        "【今回の複合修正フォーカス】",
        "- 最優先は事実保全。元回答にない具体情報を追加しない",
        "- 箇条書き・断片・前置き過多を直し、1本の本文として書き切る",
        "- 表現を整える範囲に留め、経験の種類や成果を変えない",
    ]),
    "length_answer_focus": "\n".join([
        "【今回の複合修正フォーカス】",
        "Step 1: 冒頭を結論ファーストに書き直す。読み手に伝えたいことが1文目で明確に伝わる構成にする",
        "Step 2: 結論を維持したまま、目標字数まで既存事実の展開で伸ばす",
        "- 背景説明を足す前に、結論→行動→学びの順で本文を再配置する",
        "- 水増しの一般論ではなく、元回答の行動や判断を具体化する",
    ]),
    "length_grounding": "\n".join([
        "【今回の複合修正フォーカス】",
        "Step 1: 企業・役割接点を1点に絞って本文へ自然に入れる",
        "Step 2: 接点を維持したまま、目標字数まで既存事実の説明密度で伸ばす",
        "- 根拠の薄い企業固有情報を増やさず、確認済みの方向性だけで接続する",
        "- 企業接点のために元回答の経験や成果を変えない",
    ]),
    "length_style_structure": "\n".join([
        "【今回の複合修正フォーカス】",
        "Step 1: 文を途中で切らず最後まで言い切る。全文をだ・である調の1本の散文にする",
        "Step 2: 構造を整えたまま、目標字数まで既存事実の説明密度を上げて伸ばす",
        "- 箇条書き・番号列挙・途中切れを避ける",
        "- 文同士の接続を整えて自然に収める",
    ]),
    "length_quantify": "\n".join([
        "【今回の複合修正フォーカス】",
        "Step 1: 元回答にある数値・範囲・頻度を保持する",
        "Step 2: 保持した事実に対象・行動・比較の説明を補い、目標字数まで伸ばす",
        "- 新しい数字を作らず、具体性は行動動詞と対象の明示で補う",
        "- 抽象的な強みだけでなく、再現できる行動として書く",
    ]),
    "company_reference_length": "\n".join([
        "【今回の複合修正フォーカス】",
        "Step 1: 企業敬称・企業接続の誤用をなくす。「貴社」「貴行」を使わず自分の経験を主語にする",
        "Step 2: 誤用を除いたまま、目標字数まで自分の行動・工夫・学びの説明で伸ばす",
        "- 企業名なし設問では企業名に依存しない表現で完結する",
    ]),
}


def _format_focus_mode_guidance(
    focus_mode: str | list[str],
    *,
    context: FocusModeContext | None = None,
) -> str:
    """Format focus mode guidance block(s) for injection into prompts.

    When context is provided, length_focus_min generates delta-band-aware guidance.
    Other modes use improved static text.
    """
    if isinstance(focus_mode, str):
        focus_modes = [focus_mode]
    else:
        focus_modes = list(focus_mode or [])

    blocks: list[str] = []
    for mode in _dedupe_text_items(focus_modes):
        if mode == "length_focus_min":
            blocks.append(_dynamic_length_focus_min(context))
        else:
            text = _STATIC_GUIDANCE_MAP.get(mode or "normal", "").strip()
            if text:
                blocks.append(text)

    return "\n\n".join(blocks)
