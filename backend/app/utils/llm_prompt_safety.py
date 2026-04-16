from __future__ import annotations

import re as _re
import unicodedata

# Homoglyph confusables map: visually similar chars -> ASCII equivalents.
# Covers Cyrillic, Greek, and other common look-alikes used to bypass pattern
# matching. Only characters relevant to injection keyword detection are listed.
_CONFUSABLES: dict[str, str] = {
    '\u0430': 'a',  # Cyrillic а
    '\u0435': 'e',  # Cyrillic е
    '\u043e': 'o',  # Cyrillic о
    '\u0440': 'p',  # Cyrillic р
    '\u0441': 'c',  # Cyrillic с
    '\u0443': 'y',  # Cyrillic у (visual: y)
    '\u0456': 'i',  # Cyrillic і (Byelorussian-Ukrainian)
    '\u0458': 'j',  # Cyrillic ј
    '\u04bb': 'h',  # Cyrillic һ
    '\u0501': 'd',  # Cyrillic ԁ
    '\u051b': 'q',  # Cyrillic ԛ
    '\u0455': 's',  # Cyrillic ѕ
    '\u04cf': 'l',  # Cyrillic ӏ
    '\u0475': 'v',  # Cyrillic ѵ (izhitsa)
    '\u0410': 'A',  # Cyrillic А
    '\u0412': 'B',  # Cyrillic В
    '\u0415': 'E',  # Cyrillic Е
    '\u041a': 'K',  # Cyrillic К
    '\u041c': 'M',  # Cyrillic М
    '\u041d': 'H',  # Cyrillic Н
    '\u041e': 'O',  # Cyrillic О
    '\u0420': 'P',  # Cyrillic Р
    '\u0421': 'C',  # Cyrillic С
    '\u0422': 'T',  # Cyrillic Т
    '\u0425': 'X',  # Cyrillic Х
    '\u0406': 'I',  # Cyrillic І
}
_CONFUSABLES_TRANS = str.maketrans(_CONFUSABLES)


class PromptSafetyError(ValueError):
    def __init__(self, reasons: list[str]):
        super().__init__("unsafe_prompt_input")
        self.reasons = reasons


def sanitize_prompt_input(text: str, max_length: int = 5000) -> str:
    """Sanitize user input before embedding in LLM prompts."""
    if not text:
        return ""
    text = text[:max_length]
    text = _re.sub(r"^#{1,6}\s", "", text, flags=_re.MULTILINE)
    text = text.replace("```", "")
    return text


def sanitize_es_content(text: str, max_length: int = 5000) -> str:
    """Sanitize ES content before LLM processing."""
    if not text:
        return ""

    text = sanitize_prompt_input(text, max_length)

    allowed_controls = {"\n", "\r", "\t", " "}
    text = "".join(
        char
        if char in allowed_controls or not (ord(char) < 32 or 127 <= ord(char) < 160)
        else ""
        for char in text
    )

    text = _re.sub(
        r"^\s*(system|assistant|human|user)\s*:\s*",
        "",
        text,
        flags=_re.MULTILINE | _re.IGNORECASE,
    )

    xml_tag_pattern = (
        r"<\s*/?\s*(system|assistant|human|user|instructions|instruction|prompt|context|role)\s*>"
    )
    text = _re.sub(xml_tag_pattern, "", text, flags=_re.IGNORECASE)

    return text


def detect_es_injection_risk(text: str) -> tuple[str, list[str]]:
    """Classify prompt-injection-like patterns in ES input."""
    if not text:
        return "none", []

    # NFKC normalization + zero-width character handling + confusable
    # homoglyph mapping (V-3 security fix)
    text = unicodedata.normalize('NFKC', text)
    # Replace zero-width chars with spaces (they may act as invisible word
    # separators in injection payloads), then collapse runs of whitespace.
    text = _re.sub(r'[\u200b-\u200d\ufeff\u00ad]+', ' ', text)
    text = _re.sub(r' {2,}', ' ', text)
    text = text.translate(_CONFUSABLES_TRANS)
    normalized = text.lower()
    reasons: list[str] = []
    risk = "none"

    def _matches(patterns: list[str], haystack: str = text) -> bool:
        return any(
            _re.search(pattern, haystack, flags=_re.IGNORECASE | _re.MULTILINE)
            for pattern in patterns
        )

    high_patterns = [
        (r"ignore\s+(all|any|previous|above)\s+instructions", "英語で無視命令"),
        (r"(system|developer)\s+prompt", "システム/開発者プロンプト要求"),
        (
            r"(reveal|show|print).*(prompt|instruction|secret|api key|token)",
            "内部情報の開示要求",
        ),
        (r"(what|which).*(model|provider).*(are you|using)", "モデル/プロバイダ情報の要求"),
        (r"(model name|provider name|deployment name)", "モデル名の要求"),
        (r"これまでの指示を無視", "日本語の無視命令"),
        (r"(システム|開発者).*(プロンプト|指示)", "内部プロンプトへの言及"),
        (r"(内部|機密).*(表示|開示|出力)", "内部情報の開示要求"),
        (
            r"(あなた|君).*(モデル|model|provider).*(教えて|表示|開示|出力)",
            "モデル情報の開示要求",
        ),
        (r"(モデル名|使用モデル|利用モデル|プロバイダ名).*(教えて|表示|開示|出力)", "モデル名の開示要求"),
    ]
    medium_patterns = [
        (r"```", "コードブロック記法"),
        (r"<\s*/?\s*(system|assistant|user|prompt|instructions?)\s*>", "XML風タグ"),
        (r"^\s*(system|assistant|user|human)\s*:", "ロール接頭辞"),
        (r"(step by step|chain of thought|cot)", "推論開示要求"),
        (r"(前の命令|上記の指示).*(従わず|無視)", "命令上書きの試行"),
    ]

    for pattern, reason in high_patterns:
        if _re.search(pattern, normalized, flags=_re.IGNORECASE | _re.MULTILINE):
            reasons.append(reason)

    reveal_verbs = [
        r"(reveal|show|print|dump|display|extract|exfiltrate|leak)",
        r"(表示|見せ|開示|出力|抜き出|取得|抽出|漏えい|教えて)",
    ]
    reference_targets = [
        r"(reference\s*es|参考\s*es|参考文章|例文|模範解答|通過es)",
    ]
    prompt_targets = [
        r"(prompt|instruction|secret|api key|token|password|credential)",
        r"(プロンプト|指示|機密|秘密|apiキー|トークン|認証情報|ログイン情報)",
    ]
    pii_targets = [
        r"(個人情報|氏名|名前|メールアドレス|email|住所|電話番号|phone number|password|パスワード|ログインid|login id)",
    ]
    sql_patterns = [
        r"\bselect\b",
        r"\bunion\b",
        r"\binformation_schema\b",
        r"\bsqlite_master\b",
        r"\bpg_[a-z_]+\b",
        r"\bfrom\b",
        r"\bwhere\b",
    ]
    execution_targets = [
        r"(function call|tool call|use tool|open.*browser|run.*terminal|run.*psql|run.*sql|use.*database|use.*shell|use.*cli)",
        r"((ツール|ブラウザ|ターミナル|端末|データベース|sql\s*editor|シェル|コマンド).*(使って|実行して|叩いて|開いて)|psqlを実行)",
    ]

    if _matches(reference_targets) and _matches(reveal_verbs):
        reasons.append("参考ESの開示要求")
    if _matches(prompt_targets) and _matches(reveal_verbs):
        reasons.append("内部情報の開示要求")
    if _matches(execution_targets):
        reasons.append("外部機能の実行誘導")
    if _matches(sql_patterns) and (
        _matches(reveal_verbs) or _matches(pii_targets) or _matches([r"\busers?\b", r"会員", r"応募者"])
    ):
        reasons.append("SQLによる情報抽出要求")
    if _matches(pii_targets) and (_matches(reveal_verbs) or _matches(sql_patterns)):
        reasons.append("個人情報の抽出要求")

    if reasons:
        return "high", reasons

    for pattern, reason in medium_patterns:
        if _re.search(pattern, text, flags=_re.IGNORECASE | _re.MULTILINE):
            reasons.append(reason)

    if reasons:
        risk = "medium"

    return risk, reasons


def sanitize_user_prompt_text(
    text: str,
    *,
    max_length: int = 5000,
    rich_text: bool = False,
) -> str:
    risk, reasons = detect_es_injection_risk(text)
    if risk == "high":
        raise PromptSafetyError(reasons)
    if rich_text:
        return sanitize_es_content(text, max_length=max_length)
    return sanitize_prompt_input(text, max_length=max_length)
