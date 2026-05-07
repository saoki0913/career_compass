"""Common ES template prompt helpers."""

from __future__ import annotations



# ---------------------------------------------------------------------------
# 9-F helper: prose_style block for mid/long answers (char_max > 220)
# ---------------------------------------------------------------------------

def _format_prose_style_block(char_max: int | None) -> str:
    """Return a <prose_style> block for longer answers where natural writing matters.

    Only emitted when char_max > 220 to avoid cluttering short-answer prompts.
    """
    if not char_max or char_max <= 220:
        return ""
    return """
<prose_style>
- 文と文の間は、前文の固有名詞か固有動詞を次文の主語に据えてつなぐ（「この」「その」「こうした」で始めない）
- 読み手に伝わる順序で配置する（結論→根拠→展望）
- 改行や空行を入れず、1段落の連続した文章として仕上げる
- 同じ意味の言い換え（パラフレーズ）で字数を稼がない。1文=1新情報
- 「実感した」「確信した」「痛感した」で締めず、最終文は具体的な行動名詞で終わる
- ユーザーの口語表現（「すごく」「めっちゃ」等）は書き言葉に直しつつ、動詞の核は保つ
</prose_style>"""


def get_company_honorific(industry: str | None) -> str:
    """Return the appropriate honorific for a company based on its industry.

    銀行→貴行, 信用金庫→貴庫, 事務所→貴所, 学校/大学→貴校, 病院→貴院, その他→貴社
    """
    if not industry:
        return "貴社"
    if "信用金庫" in industry:
        return "貴庫"
    if "銀行" in industry:
        return "貴行"
    if "事務所" in industry:
        return "貴所"
    if "学校" in industry or "大学" in industry:
        return "貴校"
    if "病院" in industry:
        return "貴院"
    return "貴社"

