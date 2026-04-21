"""
interview_prompts.py — 面接シミュレーションの行動指示・採点ルブリック

プランテンプレート (_PLAN_FALLBACK, _OPENING_FALLBACK, _TURN_FALLBACK, _CONTINUE_FALLBACK, _FEEDBACK_FALLBACK) から参照される共通ブロック集。

設計根拠:
- 厚労省「公正な採用選考」14 事項の差別禁止 (INTERVIEW_GROUNDING_RULES 項目 6)
- 行動面接 (STAR+L) の学習観点追加 (DEEPENING_TECHNIQUE_INSTRUCTIONS)
- 3 ギア適応難易度モデル (STRICTNESS_INSTRUCTIONS)
"""

from typing import Any, Iterable


# ---------------------------------------------------------------------------
# (A) グラウンディング / 安全ルール
# ---------------------------------------------------------------------------
# Phase 2 Stage 1-2: grounding を core と legal_compliance に分離。
# - GROUNDING_CORE: 質問生成の基本安全ルール (捏造禁止・根拠明示・材料主義)。
# - GROUNDING_LEGAL_COMPLIANCE: 厚労省「公正な採用選考」の差別禁止 14 事項。
#   新規質問を生成する hot path (opening/turn) のみで必要。
#   feedback は既存発言の採点のみなので不要、continue も短尺のため最小化。
GROUNDING_CORE = """## 安全・グラウンディング (基本)
- 根拠は会話履歴・応募者材料・企業情報に明示された内容のみ。未発言の経験・スキル・志望理由を前提にしない
- seed/RAG の固有名詞は断定せず質問形式で使う。矛盾する前提・存在しない制度/事業/商品名を創作しない
- seed/RAG 情報がある場合、企業固有の事業・制度・課題に触れる質問を優先する
- 企業の事業内容・財務数値を seed にない範囲で断定しない
- 材料不足なら広い質問で引き出す。捏造禁止
"""

GROUNDING_LEGAL_COMPLIANCE = """## 差別禁止 (厚労省 公正な採用選考)
以下は絶対に質問しない: 本籍・出生地 / 家族 / 住宅 / 家庭環境 / 宗教・支持政党・思想・尊敬人物 / 労組・学生運動 / 愛読書・新聞 / 結婚・出産予定 / 身元調査・不要な健康診断
"""

# 後方互換: Phase 1 からの `INTERVIEW_GROUNDING_RULES` import / 既存テスト
# (`test_grounding_rules_present_in_builders` 等) を壊さないため、統合版を維持する。
# 見出し '## 安全・グラウンディング' も GROUNDING_CORE で保持されている。
INTERVIEW_GROUNDING_RULES = GROUNDING_CORE + "\n" + GROUNDING_LEGAL_COMPLIANCE


# ---------------------------------------------------------------------------
# (B) 厳しさ (3 ギア適応難易度)
# ---------------------------------------------------------------------------
STRICTNESS_INSTRUCTIONS: dict[str, str] = {
    "supportive": """### やさしめモード (supportive — 探索モード)
- 1 論点の深掘り最大 2 回。肯定から入り、答えやすい切り口で経験を引き出す
- 成功体験を積ませる進行。詰めの問いに偏らない
- フィードバックは良い点を先に、改善提案は建設的かつ具体的に""",
    "standard": """### 標準モード (standard — ガイドモード)
- 1 論点の深掘り最大 3 回。直接指摘より「気づかせる質問」を優先
- 抽象回答には具体例・数字・固有名詞を求める
- 深掘り 5 型 (Why/What/How/Context/Result) をバランスよく使う
- フィードバックは事実ベース、強み/改善点を同比重で""",
    "strict": """### 厳しめモード (strict — チャレンジモード)
- 1 論点の深掘り最大 4 回。矛盾・論理飛躍・抽象表現を直接指摘可
- 圧迫寄り (前提揺さぶり/逆質問/想定外シナリオ) 可。ただし人格否定・差別的質問は絶対禁止
- 「最悪ケース練習」フレーミングで提示、本人攻撃にしない
- フィードバックは「4 以上でなければ本番で弱い」トーンで率直に""",
}


# ---------------------------------------------------------------------------
# (C-0) 面接官共通ルール — 全ペルソナの前段に build_behavioral_block が出力する
# ---------------------------------------------------------------------------
INTERVIEWER_COMMON_RULES = """## 面接官口調
- question は質問文のみ。挨拶・感想・評価・要約・共感・前置き禁止。丁寧語基調
- 禁止例: 「一貫していますね」「良い点ですね」「なるほど」「これまでの話を聞くと」
- 疑問文か指示文で開始。応募者への言及から始めない"""

# ---------------------------------------------------------------------------
# (C) 面接官ペルソナ
# ---------------------------------------------------------------------------
INTERVIEWER_PERSONA_INSTRUCTIONS: dict[str, str] = {
    "hr": """### 人事面接官ペルソナ (hr)
- 志望動機の本気度・人物面・カルチャーフィット重視
- 周囲との関わり方 (立ち位置・衝突時の振る舞い・巻き込み方) を掘る
- 価値観・行動原理と会社文化の整合を確かめる
- 即戦力性より長く働く動機と地に足の付き方""",
    "line_manager": """### 現場面接官ペルソナ (line_manager)
- 実務能力・即戦力性重視
- 「具体的にどうやったか」「技術的にどう判断したか」を一段深く
- 行動の再現性 (他の状況でも同じ意思決定ができるか)
- 抽象感想でなく、選択肢の比較・判断根拠・結果の数値を求める""",
    "executive": """### 役員面接官ペルソナ (executive)
- 覚悟・長期ビジョン・経営視点との相性重視
- 「なぜうちでなければならないか」「10 年後どうなりたいか」が中心
- 抽象的な問いで、思考の深さ・前提の置き方・言語化精度を見る
- 細部の手順より、価値観の根っこと意思決定の軸""",
    "mixed_panel": """### 複合面接官ペルソナ (mixed_panel)
- 人事/現場/役員の視点を切り替えながら 1 論点を確かめる (一貫性確認に寄る)
- 3ターンごとに人事→現場→役員の順で視点を切り替え、異なる角度から一貫性を確かめる
- 視点切り替え時は前の視点の情報を踏まえて続ける
- 回答に視点間の矛盾が出ないかを重視""",
}


# ---------------------------------------------------------------------------
# (D) 面接段階
# ---------------------------------------------------------------------------
INTERVIEW_STAGE_INSTRUCTIONS: dict[str, str] = {
    "early": """### 面接段階: early (一次面接相当)
- 基本確認のフェーズ。深い企業理解までは求めない
- 自己紹介・ガクチカ・志望理由の概要から、関心の方向性を把握する
- 細部の数字や経営視点まで詰めず、対話の地ならしを優先する""",
    "mid": """### 面接段階: mid (二次面接相当)
- 深掘り本番。STAR+L で構造的に経験と志望理由を掘る
- ES の記述と語った内容の一貫性を確認する
- 「他社でも通る一般論」になっている箇所を具体化させる""",
    "final": """### 面接段階: final (最終面接相当)
- 覚悟確認のフェーズ。志望度・他社比較・キャリアビジョンを問う
- 「経営視点で見たときのこの会社の魅力」「10 年後の自分」を語らせる
- 入社後のフィット感、長期で残る理由を掘る""",
}


# ---------------------------------------------------------------------------
# (E) 深掘りテクニック
# ---------------------------------------------------------------------------
DEEPENING_TECHNIQUE_INSTRUCTIONS = """## 深掘りテクニック
- 深掘り 5 型: Why / What / How / Context / Result (成果と本人寄与を切り分け)
- STAR+L: Situation → Task → Action (個人行動) → Result (数字・固有名詞) → Learning (企業・職種への接続)
- 補助: 前提揺さぶり / 仮説検証「他に検討した選択肢は」 / 一貫性チェック「ES と今の話の接続」
"""


# ---------------------------------------------------------------------------
# (F) 面接方式
# ---------------------------------------------------------------------------
INTERVIEW_FORMAT_INSTRUCTIONS: dict[str, str] = {
    "standard_behavioral": """### 行動面接 (standard_behavioral)
- STAR+L で経験 → 行動 → 学びを掘る
- 弱点 (抽象回答・質問とのズレ・暗記臭・ES との不整合) を引き出す
- 1 ターン 1 論点、複合質問で逃げ道を作らない""",
    "case": """### ケース面接 (case)
- 企業情報から会社らしい題材を選んで提示 (CASE BRIEF があればそれを最優先)
- 結論より、前提整理・分解・優先順位など思考プロセスの透明性を重視
- 仮説と根拠の対応、選択肢の比較、検証可能性を確認""",
    "technical": """### 技術面接 (technical)
- role_track に応じた題材 (frontend=描画性能/レンダリング/a11y、backend=API 設計/スケール、data_ai=特徴量/評価指標、infra=可用性/障害対応 等)
- 設計判断の背景・選択肢・トレードオフ・関与範囲を確認
- 暗記知識の正誤でなく、判断の言語化を見る""",
    "life_history": """### 人生面接 (life_history)
- 学生時代以前を含む転機・価値観の時系列を整理
- 行動と価値観の一貫性、自己理解の深さを確認
- ケース論点や数値詰めへすり替えず、ナラティブを保つ""",
}


# ---------------------------------------------------------------------------
# (G) 採点ルブリック
# ---------------------------------------------------------------------------
SCORING_RUBRIC = """## 採点ルブリック (BARS + Evidence-Linked)
7 軸 × 6 段階で採点。各軸で採点根拠 (応募者発言の引用) / 採点理由 / 確信度を必ず返す。

### 7 軸
company_fit=企業との相性 / role_fit=職種との相性 / specificity=具体性 / logic=論理性 / persuasiveness=説得力 / consistency=一貫性 / credibility=信憑性

### BARS anchor (6 段階 × evidence 要件、共通)
- 0: 言及なし/評価不能 — evidence 0、confidence=low
- 1: 主張不明、根拠ゼロ — evidence 0-1、confidence=low
- 2: 根拠薄い、他社でも通る一般論 — evidence 1-2、confidence=low〜medium
- 3: 主張と根拠の対応あるが具体性不足 — evidence 2、confidence=medium
- 4: 主張+根拠+具体例が揃い説得力あり — evidence 2-3、confidence=medium〜high
- 5: 独自視点+深い自己理解 — evidence 3、confidence=high 必須

### Evidence 出力ルール (捏造厳禁、未発言を根拠にしない)
- score_evidence_by_axis: 応募者発言の引用 (各軸最大 3、各 30 字以内)
- score_rationale_by_axis: 1-2 文で採点理由
- confidence_by_axis: high(evidence 3+) / medium(evidence 1-2) / low(evidence 0)

### 軸別 3 点 anchor
- company_fit: 事業理解はあるが「なぜこの企業か」の根拠が弱い
- role_fit: 職種概要は理解、具体業務への言及が表面的
- specificity: エピソードはあるが数字・固有名詞が不足
- logic: 主張と根拠の対応はあるが因果に飛躍
- persuasiveness: 論旨は伝わるが独自視点・熱量が弱い
- consistency: 矛盾はないがES・志望動機との一貫性が不十分
- credibility: 事実は語れるが学び・再現性の説明が不十分

### 厳しさ別トーン
- supportive: 良い点強調、改善は建設的、点は少し甘め (evidence 必須)
- standard: 基準通り、事実ベース
- strict:「4 以上でなければ本番で弱い」、改善点を率直に
"""


# ---------------------------------------------------------------------------
# (H) 反復防止
# ---------------------------------------------------------------------------
REPETITION_PREVENTION_RULES = """## 反復防止
- 直近 3〜5 ターンの question_summaries と重複する論点・切り口を避ける
- covered_topics + intent_key がマッチする質問は再発行しない
- 深掘り 5 型で同じ型を 2 連続超えない。浅い回答でも同じ問いを繰り返さず切り口を変える
"""


# ---------------------------------------------------------------------------
# (I) 質問設計
# ---------------------------------------------------------------------------
QUESTION_DESIGN_RULES = """## 質問設計
- 1 ターン 1 論点、複合質問禁止、1〜2 分で答えられる長さ
- 曖昧な深掘り (「もう少し詳しく」「他にありますか」) 禁止。具体的な切り口を示す
- 否定形 (「〜は気にしませんよね」) や複合質問 (A と B の関係は) を避ける
- 自然な日本語。テンプレ的機械並び替えを避ける
"""


# ---------------------------------------------------------------------------
# (J) builder
# ---------------------------------------------------------------------------
_DEFAULT_INCLUDE = frozenset(
    {
        "grounding_core",
        "grounding_legal",
        "strictness",
        "interviewer",
        "stage",
        "deepening",
        "format",
        "rubric",
        "repetition",
        "question_design",
    }
)


def _normalize_include(include: Iterable[str] | None) -> set[str]:
    if include is None:
        return set(_DEFAULT_INCLUDE)
    selected = {str(item).strip() for item in include if str(item).strip()}
    # Phase 2 Stage 1-3: "grounding" は後方互換エイリアス。
    # core + legal の両方を展開する。
    if "grounding" in selected:
        selected.discard("grounding")
        selected.add("grounding_core")
        selected.add("grounding_legal")
    return selected


def build_behavioral_block(
    setup: dict[str, Any],
    *,
    include: Iterable[str] | None = None,
) -> str:
    """setup に応じて行動指示ブロックを組み立てる。

    Args:
        setup: `_build_setup()` の戻り値想定 dict。
            `strictness_mode` / `interviewer_type` / `interview_stage` /
            `interview_format` を読み、該当する条件分岐ブロックだけを抽出する。
        include: 有効化するブロック名の集合。`None` のときは全ブロックを含める。
            指定可能なキー:
              - "grounding_core" : GROUNDING_CORE (基本安全ルール)
              - "grounding_legal": GROUNDING_LEGAL_COMPLIANCE (厚労省差別禁止)
              - "grounding"      : 後方互換エイリアス。core + legal を両方展開
              - "strictness"     : STRICTNESS_INSTRUCTIONS[setup["strictness_mode"]]
              - "interviewer"    : INTERVIEWER_PERSONA_INSTRUCTIONS[setup["interviewer_type"]]
              - "stage"          : INTERVIEW_STAGE_INSTRUCTIONS[setup["interview_stage"]]
              - "deepening"      : DEEPENING_TECHNIQUE_INSTRUCTIONS
              - "format"         : INTERVIEW_FORMAT_INSTRUCTIONS[setup["interview_format"]]
              - "rubric"         : SCORING_RUBRIC
              - "repetition"     : REPETITION_PREVENTION_RULES
              - "question_design": QUESTION_DESIGN_RULES

    Phase 2 Stage 1-3 では各 fallback テンプレートから以下のように呼び出される:
        - plan      : {"grounding_core", "format", "stage"}
                      (質問生成しないので legal 不要)
        - opening   : {"grounding_core", "grounding_legal", "strictness",
                      "interviewer", "stage", "format", "question_design"}
        - turn      : {"grounding_core", "grounding_legal", "strictness",
                      "interviewer", "stage", "deepening", "format",
                      "question_design", "repetition"}
        - continue  : {"grounding_core", "strictness", "interviewer",
                      "stage", "question_design"}
                      (再開は最小、legal は省略)
        - feedback  : {"grounding_core", "rubric"}
                      (既存発言の採点のみなので legal 不要)
    """

    selected = _normalize_include(include)
    sections: list[str] = []

    if "grounding_core" in selected:
        sections.append(GROUNDING_CORE.rstrip())

    if "grounding_legal" in selected:
        sections.append(GROUNDING_LEGAL_COMPLIANCE.rstrip())

    if "strictness" in selected:
        key = str(setup.get("strictness_mode") or "standard").strip() or "standard"
        block = STRICTNESS_INSTRUCTIONS.get(key) or STRICTNESS_INSTRUCTIONS["standard"]
        sections.append(block.rstrip())

    if "interviewer" in selected:
        sections.append(INTERVIEWER_COMMON_RULES.rstrip())
        key = str(setup.get("interviewer_type") or "hr").strip() or "hr"
        block = INTERVIEWER_PERSONA_INSTRUCTIONS.get(key) or INTERVIEWER_PERSONA_INSTRUCTIONS["hr"]
        sections.append(block.rstrip())

    if "stage" in selected:
        key = str(setup.get("interview_stage") or "mid").strip() or "mid"
        block = INTERVIEW_STAGE_INSTRUCTIONS.get(key) or INTERVIEW_STAGE_INSTRUCTIONS["mid"]
        sections.append(block.rstrip())

    if "deepening" in selected:
        sections.append(DEEPENING_TECHNIQUE_INSTRUCTIONS.rstrip())

    if "format" in selected:
        key = str(setup.get("interview_format") or "standard_behavioral").strip() or "standard_behavioral"
        block = INTERVIEW_FORMAT_INSTRUCTIONS.get(key) or INTERVIEW_FORMAT_INSTRUCTIONS["standard_behavioral"]
        sections.append(block.rstrip())

    if "rubric" in selected:
        sections.append(SCORING_RUBRIC.rstrip())

    if "question_design" in selected:
        sections.append(QUESTION_DESIGN_RULES.rstrip())

    if "repetition" in selected:
        sections.append(REPETITION_PREVENTION_RULES.rstrip())

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# (K) FOLLOWUP_STYLE_POLICY (Phase 2 Stage 4)
# ---------------------------------------------------------------------------
# (format, stage, answer_gap) -> allowed followup_styles を決定論で絞り、
# turn プロンプトに allowed set (3-5 候補) だけを提示する。
# 33 種並列列挙で曖昧だった 1 ターン深掘り粒度を動的化する。
# ANSWER_GAP_DESCRIPTIONS のキーは `detect_answer_gap` の戻り値と 1:1 対応する。

ANSWER_GAP_DESCRIPTIONS: dict[str, str] = {
    "abstract": "具体性不足 (数字・固有名詞ゼロの抽象回答)",
    "consistent_gap": "ES との矛盾、直前回答との不一致",
    "missing_hypothesis": "仮説提示なし (ケース面接で結論のみ)",
    "surface_analysis": "結論のみで根拠薄 (深掘り不十分)",
    "lacks_tradeoff": "トレードオフ議論なし (技術面接で唯一解のみ提示)",
    "low_ownership": "チーム成果のみで個人行動不明",
    "low_commitment": "志望度が弱い (最終面接で他社も同じ理由)",
    "thin_narrative": "転機の語りが浅い (人生面接)",
    "sufficient": "問題なし (次トピックへ shift)",
}

FOLLOWUP_STYLE_POLICY: dict[tuple[str, str, str], tuple[str, ...]] = {
    # (interview_format, interview_stage, answer_gap) -> allowed followup_styles

    # --- standard_behavioral ---
    ("standard_behavioral", "early", "abstract"): ("specificity_check", "reason_check"),
    ("standard_behavioral", "early", "sufficient"): ("theme_choice_check", "reason_check"),
    ("standard_behavioral", "mid", "abstract"): ("specificity_check", "theme_choice_check", "counter_hypothesis"),
    ("standard_behavioral", "mid", "consistent_gap"): ("consistency_check", "reason_check"),
    ("standard_behavioral", "mid", "surface_analysis"): ("specificity_check", "counter_hypothesis"),
    ("standard_behavioral", "mid", "low_ownership"): ("specificity_check", "reason_check"),
    ("standard_behavioral", "mid", "sufficient"): ("theme_choice_check",),
    ("standard_behavioral", "final", "low_commitment"): ("future_vision_check", "company_reason_check"),
    ("standard_behavioral", "final", "abstract"): ("company_reason_check", "specificity_check"),
    ("standard_behavioral", "final", "sufficient"): ("future_vision_check", "company_reason_check"),

    # --- case ---
    ("case", "early", "missing_hypothesis"): ("theme_choice_check", "counter_hypothesis"),
    ("case", "early", "sufficient"): ("specificity_check", "theme_choice_check"),
    ("case", "mid", "missing_hypothesis"): ("counter_hypothesis", "theme_choice_check"),
    ("case", "mid", "surface_analysis"): ("specificity_check", "counter_hypothesis"),
    ("case", "mid", "abstract"): ("specificity_check", "reason_check"),
    ("case", "mid", "sufficient"): ("theme_choice_check", "counter_hypothesis"),
    ("case", "final", "low_commitment"): ("future_vision_check", "company_reason_check"),
    ("case", "final", "sufficient"): ("future_vision_check",),

    # --- technical ---
    ("technical", "early", "lacks_tradeoff"): ("technical_difficulty_check", "specificity_check"),
    ("technical", "early", "sufficient"): ("technical_difficulty_check", "reason_check"),
    ("technical", "mid", "lacks_tradeoff"): ("technical_difficulty_check", "counter_hypothesis"),
    ("technical", "mid", "low_ownership"): ("specificity_check", "reason_check"),
    ("technical", "mid", "abstract"): ("specificity_check", "technical_difficulty_check"),
    ("technical", "mid", "sufficient"): ("technical_difficulty_check",),
    # Phase 2 Stage 4: technical/final/abstract を明示登録 (generic fallback の
    # 3 要素だと turn prompt token budget をわずかに越えるため、2 要素に絞る)。
    ("technical", "final", "abstract"): ("specificity_check", "reason_check"),
    ("technical", "final", "low_ownership"): ("specificity_check", "reason_check"),
    ("technical", "final", "sufficient"): ("future_vision_check", "company_reason_check"),

    # --- life_history ---
    ("life_history", "early", "thin_narrative"): ("value_change_check", "theme_choice_check"),
    ("life_history", "early", "sufficient"): ("theme_choice_check", "value_change_check"),
    ("life_history", "mid", "thin_narrative"): ("value_change_check", "consistency_check"),
    ("life_history", "mid", "sufficient"): ("value_change_check", "theme_choice_check"),
    ("life_history", "final", "low_commitment"): ("future_vision_check", "value_change_check"),
    ("life_history", "final", "sufficient"): ("future_vision_check",),
}

# 汎用 fallback (policy にキーが無い場合は format ベースで返す)
GENERIC_STYLES_BY_FORMAT: dict[str, tuple[str, ...]] = {
    "standard_behavioral": ("reason_check", "specificity_check", "theme_choice_check"),
    "case": ("theme_choice_check", "counter_hypothesis", "specificity_check"),
    "technical": ("technical_difficulty_check", "specificity_check", "reason_check"),
    "life_history": ("value_change_check", "theme_choice_check"),
}


def choose_followup_style(
    interview_format: str,
    interview_stage: str,
    answer_gap: str,
) -> tuple[str, ...]:
    """(format, stage, answer_gap) から allowed followup_styles を決定論で返す。

    policy にキーが無い場合は format ベースの fallback を返す。
    戻り値は常に空でない tuple。
    """
    key = (interview_format, interview_stage, answer_gap)
    allowed = FOLLOWUP_STYLE_POLICY.get(key)
    if allowed:
        return allowed
    return GENERIC_STYLES_BY_FORMAT.get(
        interview_format, ("reason_check", "specificity_check")
    )


# ---------------------------------------------------------------------------
# Version metadata (Phase 2)
# ---------------------------------------------------------------------------
# Phase 2 Stage 0-3: 評価ハーネスのための世代追跡。
# 評価スコアが prompt 変更のどの世代に由来するか追跡可能にし、
# 将来の A/B test 基盤とする。turn_event / feedback_history に保存される。
PROMPT_VERSION = "2026-04-21-phase3-quality"  # prompt ブロック (本ファイル) を実質的に変更した際にインクリメント
FOLLOWUP_POLICY_VERSION = "v1.0"  # FOLLOWUP_STYLE_POLICY 変更時にインクリメント (Stage 4 で本格導入)


__all__ = [
    "GROUNDING_CORE",
    "GROUNDING_LEGAL_COMPLIANCE",
    "INTERVIEW_GROUNDING_RULES",
    "STRICTNESS_INSTRUCTIONS",
    "INTERVIEWER_PERSONA_INSTRUCTIONS",
    "INTERVIEW_STAGE_INSTRUCTIONS",
    "DEEPENING_TECHNIQUE_INSTRUCTIONS",
    "INTERVIEW_FORMAT_INSTRUCTIONS",
    "SCORING_RUBRIC",
    "REPETITION_PREVENTION_RULES",
    "QUESTION_DESIGN_RULES",
    "build_behavioral_block",
    "PROMPT_VERSION",
    "FOLLOWUP_POLICY_VERSION",
    "ANSWER_GAP_DESCRIPTIONS",
    "FOLLOWUP_STYLE_POLICY",
    "GENERIC_STYLES_BY_FORMAT",
    "choose_followup_style",
]
