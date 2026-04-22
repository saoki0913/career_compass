"""
Shared text-analysis helpers and pattern constants for the Gakuchika feature.

This module is intentionally dependency-free (pure functions + constants) so
that it can be imported from evaluators, normalization, prompts and routers
without introducing circular dependencies.

Responsibility:
- Japanese keyword pattern dictionaries (TASK / ACTION / RESULT / LEARNING …)
- Low-level text checks (``_contains_any``, ``_contains_digit``, ``_normalize_text``)
- Simple classifiers (``_classify_input_richness``, ``_role_required``)
- Focus-key meta fallbacks (``BUILD_FOCUS_FALLBACKS``, ``DEEPDIVE_FOCUS_FALLBACKS``)

Phase detection (``_determine_deepdive_phase``) is intentionally kept in
``app.routers.gakuchika`` as per the A.4 architecture gate decision: phase
judgement is an orchestration responsibility of the handler, not a text
utility.  The helper here only covers reusable text analysis.
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Focus-key taxonomies
# ---------------------------------------------------------------------------

BUILD_ELEMENTS: tuple[str, ...] = ("overview", "context", "task", "action", "result", "learning")
CORE_BUILD_ELEMENTS: tuple[str, ...] = ("context", "task", "action", "result")
DRAFT_QUALITY_CHECK_KEYS: tuple[str, ...] = (
    "task_clarity",
    "action_ownership",
    "role_clarity",
    "role_required",
    "result_traceability",
    "learning_reusability",
)
DEEPDIVE_FOCUSES: tuple[str, ...] = (
    "role",
    "challenge",
    "action_reason",
    "result_evidence",
    "learning_transfer",
    "credibility",
    "future",
    "backstory",
)

# ---------------------------------------------------------------------------
# Japanese phrase pattern catalogues
# ---------------------------------------------------------------------------

ROLE_REQUIRED_HINT_PATTERNS: tuple[str, ...] = (
    "チーム",
    "メンバー",
    "サークル",
    "研究室",
    "ゼミ",
    "アルバイト",
    "委員",
    "運営",
    "店舗",
    "部活",
    "複数",
    "企画",
)
ROLE_CLARITY_PATTERNS: tuple[str, ...] = (
    "主担当",
    "担当",
    "リーダー",
    "役割",
    "分担",
    "責任",
    "任され",
    "私が",
    "私は",
    "自分が",
)
TASK_PATTERNS: tuple[str, ...] = (
    "課題",
    "問題",
    "悩み",
    "不足",
    "滞り",
    "停滞",
    "伸び悩み",
    "困って",
    "混雑",
    "詰まり",
    "非効率",
    "逃して",
)
TASK_IMPLICIT_PATTERNS: tuple[str, ...] = (
    "変えたい",
    "改善したい",
    "解決したい",
    "減らしたい",
    "無くしたい",
    "なくしたい",
    "増やしたい",
    "伸ばしたい",
    "上げたい",
    "目指した",
    "目指して",
    "改善を図",
    "手を打",
)
ACTION_PATTERNS: tuple[str, ...] = (
    "提案",
    "導入",
    "作成",
    "設計",
    "改善",
    "見直",
    "分析",
    "整理",
    "調整",
    "実施",
    "企画",
    "再設計",
)
ACTION_WEAK_PATTERNS: tuple[str, ...] = ("頑張", "工夫", "意識", "努力", "対応", "取り組")
OTHER_ACTOR_PATTERNS: tuple[str, ...] = (
    "先輩が担当",
    "主に先輩",
    "他のメンバーが担当",
    "サポートに回った",
    "提案はしたが",
    "実行は主に",
    "先輩の提案",
    "指示された",
    "手伝いました",
    "手伝った",
)
RESULT_PATTERNS: tuple[str, ...] = (
    "増",
    "減",
    "向上",
    "改善",
    "安定",
    "短縮",
    "達成",
    "上が",
    "下が",
    "変わ",
    "任され",
    "評価",
)
LEARNING_PATTERNS: tuple[str, ...] = ("学び", "学ん", "気づ", "再現", "活か", "次", "今後", "原則")
LEARNING_GENERIC_PATTERNS: tuple[str, ...] = ("大切", "重要", "必要", "協力の大切さ", "継続の大切さ")
ACTION_REASON_PATTERNS: tuple[str, ...] = ("理由", "判断", "なぜ", "比較", "根拠", "優先", "見立て")
CONNECTIVE_PATTERNS: tuple[str, ...] = ("ため", "ので", "から", "結果", "その結果", "ことにより", "につなが")

# Situation/setup hints: short answers can still satisfy "context" without hitting a raw char threshold.
CONTEXT_HINT_PATTERNS: tuple[str, ...] = (
    "インターン",
    "配属",
    "アルバイト",
    "バイト",
    "サークル",
    "ゼミ",
    "研究室",
    "部活",
    "チーム",
    "部署",
    "職場",
    "現場",
    "プロジェクト",
    "会社",
    "当時",
    "背景",
    "環境",
    "所属",
    "学年",
    "大学",
    "高校",
    "役割",
)

# Generic result-marker vocabulary reused across normalization and diagnostics
RESULT_SOFT_MARKERS: tuple[str, ...] = (
    "前後",
    "変化",
    "反応",
    "評価",
    "増",
    "減",
    "向上",
    "改善",
)

# Learning transfer vocabulary reused across evaluators / diagnostics
LEARNING_TRANSFER_PATTERNS: tuple[str, ...] = ("活か", "今後", "再現", "原則", "次")

# Uncertainty / hedging markers. When the user admits they do not know or cannot
# quantify, surface keyword hits should NOT be treated as valid evidence.
UNCERTAINTY_MARKERS: tuple[str, ...] = (
    "分からな",
    "わからな",
    "不明",
    "覚えていな",
    "曖昧",
    "はっきりとは",
    "数字までは",
    "正確には分",
    "断言はでき",
)

# Shallow reason hedges: generic feeling expressions that replace a real reason.
# 例: 「大事だと思ったから」「重要だと思った」— 理由を問われての回答であっても実体がない。
SHALLOW_REASON_HEDGES: tuple[str, ...] = (
    "大事だと思",
    "重要だと思",
    "必要だと思",
    "大切だと思",
)

# Future-wish learning expressions that lack concrete takeaway.
# 例: 「今後にも活かしたいです」単独では learning_transfer を満たさない。
LEARNING_WISH_ONLY_PATTERNS: tuple[str, ...] = (
    "活かしたい",
    "活かしていきたい",
    "次は頑張",
)

# Concrete past-tense / principle-level learning verbs. Presence of these means
# the learner has actually extracted a takeaway, not just expressed intent.
LEARNING_CONCRETE_PATTERNS: tuple[str, ...] = (
    "学び",
    "学ん",
    "気づ",
    "再現可能",
    "原則として",
)

# ---------------------------------------------------------------------------
# Focus-key meta fallbacks
# ---------------------------------------------------------------------------

BUILD_FOCUS_FALLBACKS: dict[str, dict[str, str]] = {
    "overview": {
        "question": "この経験では、まず何に取り組んでいたのか教えていただけますか。",
        "answer_hint": "活動名だけでなく、どんな役割やテーマの経験だったかまで書くとまとまりやすいです。",
        "progress_label": "取り組みを整理中",
    },
    "context": {
        "question": "いただいた内容を一緒に整理していきますね。まず、そのときどんな場面や相手と進めていた経験でしたか。",
        "answer_hint": "時期、場面、関わっていた相手や規模感が分かると書きやすくなります。",
        "progress_label": "状況を整理中",
    },
    "task": {
        "question": "その経験で、特にどんな課題に向き合う必要があったのですか。",
        "answer_hint": "何がうまくいっていなかったのか、なぜそれを課題だと見たのかが分かると強くなります。",
        "progress_label": "課題を整理中",
    },
    "action": {
        "question": "その課題に対して、ご自身はまず何をしたのですか。",
        "answer_hint": "頑張った気持ちより、自分が実際に取った行動や工夫を書くと伝わりやすいです。",
        "progress_label": "行動を整理中",
    },
    "result": {
        "question": "その行動のあと、どんな変化や成果がありましたか。",
        "answer_hint": "数字がなくても、前後差や周囲の反応など変化が分かる形で書くと十分です。",
        "progress_label": "結果を整理中",
    },
    "learning": {
        "question": "その経験を通じて、どんな学びや気づきが残りましたか。",
        "answer_hint": "抽象的な反省ではなく、今後にも活かせそうな気づきを一つ書くとまとまります。",
        "progress_label": "学びを整理中",
    },
    "role": {
        "question": "その経験では、ご自身が主にどこを担当していたのか教えていただけますか。",
        "answer_hint": "自分が任されていた範囲と、周囲と分担していた範囲を分けて書くと伝わりやすいです。",
        "progress_label": "役割を整理中",
    },
}

DEEPDIVE_FOCUS_FALLBACKS: dict[str, dict[str, str]] = {
    "role": {
        "question": "その場面では、ご自身がどこまでを担っていたのか教えていただけますか。",
        "answer_hint": "自分が任されていた範囲と、周囲と分担していた範囲を分けて答えると伝わりやすいです。",
        "progress_label": "役割を整理中",
    },
    "challenge": {
        "question": "その状況を、なぜ本当に解くべき課題だと判断したのですか。",
        "answer_hint": "当時見えていた事実や違和感を根拠にすると、判断の筋が伝わります。",
        "progress_label": "課題認識を整理中",
    },
    "action_reason": {
        "question": "その方法を選んだのは、どんな理由や比較があったからですか。",
        "answer_hint": "他のやり方ではなくその打ち手を選んだ判断軸を書くと、行動の説得力が増します。",
        "progress_label": "判断理由を整理中",
    },
    "result_evidence": {
        "question": "その工夫が効いたと判断したのは、どんな前後差や反応が見えたからですか。",
        "answer_hint": "数字、行動の変化、周囲の反応など、成果を裏づける事実を書くとまとまります。",
        "progress_label": "成果の根拠を整理中",
    },
    "learning_transfer": {
        "question": "その経験から得た学びは、次の場面でどう活かせると思いますか。",
        "answer_hint": "感想ではなく、再現できる行動原則として言い換えると強くなります。",
        "progress_label": "学びを整理中",
    },
    "credibility": {
        "question": "その成果の中で、ご自身が特に担った部分はどこでしたか。",
        "answer_hint": "役割範囲を具体的にすると、話の信頼感が上がります。",
        "progress_label": "信憑性を整理中",
    },
    "future": {
        "question": "この経験を踏まえて、今後はどんな挑戦につなげていきたいですか。",
        "answer_hint": "今回の経験で得た強みや学びが、次にどう活きるかを書くとつながりが出ます。",
        "progress_label": "将来展望を整理中",
    },
    "backstory": {
        "question": "そもそもその経験に力を入れようと思った背景には、どんな原体験や価値観がありましたか。",
        "answer_hint": "今の行動につながるきっかけや背景が分かるように書くと、人物像が伝わります。",
        "progress_label": "背景を整理中",
    },
}


# ---------------------------------------------------------------------------
# Primitive text utilities
# ---------------------------------------------------------------------------

def _contains_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(pattern in text for pattern in patterns)


def _contains_digit(text: str) -> bool:
    return bool(re.search(r"\d", text))


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _role_required(text: str) -> bool:
    normalized = _normalize_text(text)
    return _contains_any(normalized, ROLE_REQUIRED_HINT_PATTERNS) or (
        _contains_any(normalized, RESULT_PATTERNS) and _contains_digit(normalized)
    )


def _classify_input_richness(text: str) -> str:
    normalized = _normalize_text(text)
    if not normalized:
        return "seed_only"

    sentences = [part for part in re.split(r"[。！？\n]", normalized) if part.strip()]
    score = 0
    if _contains_any(normalized, TASK_PATTERNS):
        score += 1
    if _contains_any(normalized, ACTION_PATTERNS):
        score += 1
    if _contains_any(normalized, RESULT_PATTERNS) or _contains_digit(normalized):
        score += 1
    if _contains_any(normalized, CONNECTIVE_PATTERNS):
        score += 1
    if len(normalized) <= 18 and len(sentences) <= 1:
        return "seed_only"
    if score >= 3 and len(normalized) >= 55:
        return "almost_draftable"
    if len(normalized) <= 24 and score == 0:
        return "seed_only"
    return "rough_episode"


def _context_core_satisfied(normalized: str) -> bool:
    if len(normalized) >= 12:
        return True
    if len(normalized) >= 6 and _contains_any(normalized, CONTEXT_HINT_PATTERNS):
        return True
    return False


# ---------------------------------------------------------------------------
# Focus-key meta selectors
# ---------------------------------------------------------------------------

def _fallback_build_meta(focus_key: str) -> dict[str, str]:
    if focus_key == "role":
        return DEEPDIVE_FOCUS_FALLBACKS["role"]
    return BUILD_FOCUS_FALLBACKS.get(focus_key, BUILD_FOCUS_FALLBACKS["overview"])


def _fallback_deepdive_meta(focus_key: str) -> dict[str, str]:
    return DEEPDIVE_FOCUS_FALLBACKS.get(focus_key, DEEPDIVE_FOCUS_FALLBACKS["challenge"])


def _build_focus_meta(focus_key: str) -> dict[str, str]:
    if focus_key == "role":
        return _fallback_deepdive_meta("role")
    return _fallback_build_meta(focus_key)


# ---------------------------------------------------------------------------
# Cleaners: generic payload sanitisers used by normalisers
# ---------------------------------------------------------------------------

def _clean_string(value: object) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def _clean_string_list(value: object, *, max_items: int = 6) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        if isinstance(item, str):
            text = item.strip()
            if text:
                cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _clean_bool_map(value: object, allowed_keys: tuple[str, ...]) -> dict[str, bool]:
    if not isinstance(value, dict):
        return {}
    cleaned: dict[str, bool] = {}
    for key in allowed_keys:
        if key in value:
            cleaned[key] = bool(value[key])
    return cleaned
