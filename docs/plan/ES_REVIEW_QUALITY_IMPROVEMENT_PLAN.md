---
topic: es-review
plan_date: 2026-04-12
based_on_review: feature/es_review_quality_audit_20260412.md
phase10_trigger: scripts/dev/run_es_review_sample_http.py 目視レビュー (2026-04-16)
status: 完了 (Phase 10 検証済み)
---

# ES添削 品質改善計画

**作成日:** 2026-04-12
**最終更新:** 2026-04-17 (v11: Phase 10 Live 検証完了、完了へ移行)
**根拠:** `docs/review/feature/es_review_quality_audit_20260412.md` + 品質評価レポート (総合 B+) + 就活ES文章品質調査 + `scripts/dev/run_es_review_sample_http.py` 目視レビュー (2026-04-16, Claude Sonnet, 9 設問タイプ各1件)
**コード状態:** Phase 1-10 実装済み / Live テスト検証済み (Phase 10 smoke 再実行 2026-04-17)
**ステータス:** 完了 (Phase 10 検証済み)
**検証レポート:** Phase 1-9: `docs/review/feature/es_review_quality_audit_20260414.md` / Phase 10: `docs/review/feature/es_review_quality_audit_20260417.md`

---

## 背景

品質監査レポート v2 (2026-04-12) および総合品質評価レポートの分析結果に基づき、以下の残存課題に対処する:

- `company_tokens:missing` が 3件残存 (assistive grounding の不安定性)
- `user_fact_tokens:missing` が 2件残存 (短字数帯での事実圧縮)
- AI臭 B-Phase2 が calibration 待ちで実質未稼働 (tier は 0/1 のみ、Tier 2 到達不可)
- `self_pr_assistive_medium` で「貴社」が出力に混入 (assistive 経路の敬称規約が曖昧)
- **AI臭検出・排除が C+ 評価** — 検出ロジックは先進的だがリジェクションが B-Phase1 のまま未有効化
- **文末反復検出とプロンプト指示の不整合** — プロンプトは「2文連続禁止」だがバリデーションは3連続で検出
- **文字数制御が B- 評価** — gap 緩和偏重で生成精度改善が不足、LENGTH_FIX 1回制限
- **グローバルルール 12項目の attention 分散リスク** — 全テンプレートに一律適用でLLMの遵守率が低下
- **散文品質の3大課題** — (1) LLM が段落分けの改行を挿入し Web 提出フォームで崩れる (2)「〜した。〜した。〜した。」の文末単調で稚拙な印象 (3) 箇条書き的な事実羅列で一本の散文として流れが悪い

### 品質評価スコアリング

| 評価軸 | スコア | 判定 |
|---|---|---|
| プロンプト設計の精緻さ | A- | 9テンプレート×多軸品質基準は業界最高水準。指示の attention 分散リスクあり |
| AI臭検出・排除 | C+ | 検出ロジックは先進的だがリジェクションが未有効化 |
| 文字数制御 | B- | モデル別チューニングは優秀だが、gap 緩和偏重で生成精度改善が不足 |
| 企業グラウンディング | A | RAG 3レベル×エビデンスカード×カバレッジ評価は非常に堅実 |
| リトライパイプライン | B+ | 5段階設計は妥当だが Length Fix 1回制限と degraded 採用基準に課題 |
| テストカバレッジ | B | 3層テストは良いが AI臭リジェクションと degraded パスのテストが不足 |
| 競合優位性 | A- | テンプレート特化×企業RAG×AI臭検出の組み合わせは全競合に対して差別化済み |

**総合: B+（選考通過品質に近いが、AI臭リジェクション未有効化が最大のボトルネック）**

### 設計判断の根拠

| 判断 | 根拠 |
|---|---|
| AI_SIGNATURE_PHRASES の拡張は行わない | ユーザー判断: 誤検出リスクが増大するため |
| max_tokens 倍率は変更しない | ユーザー判断: プロンプト側でセルフカウント指示により対応 |
| Burstiness（文長分散）メトリクスは採用しない | ES は 3-10 文で CV 推定に必要な 20-30 文に満たず統計的に不可能。Turnitin/GPTZero も短文では false positive が急増し閾値を引き上げている |

### 目視レビューによる追加課題 (2026-04-16)

Phase 1-9 の Live 検証後、`scripts/dev/run_es_review_sample_http.py` で実運用再現条件
（`char_min=390, char_max=400`, FastAPI HTTP 経由, Claude Sonnet）の 9 設問タイプ出力を目視レビュー。
自動テストでは検出できない **文章表現レベルの品質課題** が 5 件判明し、Phase 10 で対処する。

| # | 設問タイプ | 観察された問題 | 代表例 |
|---|---|---|---|
| 10-1 | 全テンプレート | 冒頭文が冗長（「〜が目標である。」「〜を身につけることが目標である。」） | `[3/9] post_join_goals`, `[8/9] intern_goals`, `[9/9] gakuchika` |
| 10-2 | company_motivation, basic, post_join_goals 等 | 本文内で企業名を複数回直接記載（`三菱商事の〜、三菱商事では〜`） | `[1/9]`, `[3/9]`, `[5/9]` |
| 10-3 | intern_reason, intern_goals, role_course_reason | インターン名・コース名の固有名詞をそのまま本文に記載 | `[7/9]`「Business Intelligence Internship」, `[8/9]`「BIインターン」 |
| 10-4 | self_pr, work_values | 抽象性・冗長性が高い（数値欠如・成果の再現性が弱い・同趣旨の繰り返し） | `[4/9] self_pr`, `[5/9] work_values` |
| 10-5 | gakuchika | 複数施策を並列で論じるときに構造が崩れる（「また〜、さらに〜」の羅列） | `[9/9] gakuchika` |

この 5 課題は validation 層での検出が難しく（数値含有率や固有名詞の重複度合いを false positive なく規制するのは困難）、
プロンプト層での誘導で吸収する方針を採る。詳細は `## Phase 10: 目視レビュー基づく散文品質改善` を参照。

---

## 研究根拠: ES 文章品質の外部ソース

施策 9（散文品質改善）の設計根拠として、就活 ES の文章品質に関する信頼性の高い外部ソースを調査した。

### 文末バリエーション

| ルール | ソース | 信頼度 |
|---|---|---|
| 同じ文末は2連続が限度。3連続は NG | 石渡嶺司（大学ジャーナリスト）/ [現代ビジネス](https://gendai.media/articles/-/79618?page=2) | 高 |
| 2回続くのは許容範囲、3回連続は違和感 | [ミキワメ（旧レクミー）](https://www.recme.jp/media/202002249690) | 中〜高 |
| ですます調は語尾のバリエーションが乏しく単調 | [キャリアチケット](https://careerticket.jp/media/article/1884/) | 中 |
| である調は語尾の種類が豊富で単調になりにくい | [キミスカ就活研究室](https://kimisuka.com/contents/es/17351) | 中 |
| 体言止めは1項目につき1回、多くても2回まで | 石渡嶺司 / [現代ビジネス](https://gendai.media/articles/-/79618?page=2) | 高 |

**具体的バリエーション技法:**

| 技法 | 例 | ソース |
|---|---|---|
| 体言止め | 「〜した経験。」 | 石渡嶺司 / 現代ビジネス |
| 中止法 | 「英語力を磨き、〜を積んだ。」 | [PORTキャリア](https://www.theport.jp/portcareer/article/143216/) |
| 「〜のです」変換 | 「〜しました」→「〜したのです」 | 石渡嶺司 / 現代ビジネス |
| 理由表現 | 「〜からだ」「〜ためだ」 | 複数ソース共通 |
| 倒置法 | 「重要だと、私は考えます。」 | [CheerCareer](https://cheercareer.jp/ip_blogs/708) |

### 一文の長さ

| ルール | ソース | 信頼度 |
|---|---|---|
| 一文 40〜60 文字が最適 | 波多野完治（心理学者、1960年代）/ [note 片桐光知子](https://note.com/michiko_katagiri/n/n3bba8c6dd4ec) | 高（学術根拠） |
| ES では一文 40 文字程度を目安に | [CheerCareer](https://cheercareer.jp/ip_blogs/1101) | 中 |
| Web 提出では一文 50 文字以内 | [インターンシップガイド](https://internshipguide.jp/columns/view/es-new-line) | 中 |
| 80 文字超で文頭の記憶が消え始める | [wordrabbit](https://wordrabbit.jp/blog/102) | 中 |

### Web 提出 ES の改行問題

| 知見 | ソース |
|---|---|
| Web ES では改行が自動削除されるシステムが多い | [インターンシップガイド](https://internshipguide.jp/columns/view/es-new-line) |
| 改行なしでも選考上の問題はない | [就活塾NAVI](https://shunavi.net/column/es_kaigyou) |
| 一段落ベタ打ちテキストでも読みやすい文章力が求められる | 複数ソース共通 |

### 構成・構造

| ルール | ソース |
|---|---|
| 結論ファースト（PREP法）は ES 作成の鉄則 | [リクナビ](https://job.rikunabi.com/contents/entrysheet/4570/) |
| 「結論・根拠・展望」の3段落構成が基本 | [キミスカ](https://kimisuka.com/contents/es/17329) |
| STAR法（ガクチカ）では Action に最大配分 | [就活市場](https://shukatsu-ichiba.com/article/14380) |
| 記入欄の 80% 以上を埋めることが必須 | [キミスカ](https://kimisuka.com/contents/es/17329) |

### 施策 9 への適用

上記調査から、以下の3点をプロンプト改修の柱として採用:

1. **改行禁止の明示** — Web ES は改行が自動削除されるため、出力契約に「1段落の連続した文章」を義務づける
2. **文末バリエーション技法の指定** — 中止法・理由表現を中心に具体技法を `<prose_style>` で提示。体言止めは過剰使用回避のため passing mention に留める
3. **「2文連続禁止」への閾値統一** — 複数ソースが「3連続 NG、2連続は許容範囲だが少ない方が良い」と一致。プロンプトでは「2文連続禁止」、バリデーションでは「3連続検出」の防御的多層構造を採用

---

## 設計原則: 敬称可否の判定軸

**`effective_company_grounding` (実効ポリシー) に全レイヤーを統一する。**

`template_def["company_usage"]` (静的) ではなく、RAG 可用性・証拠カバレッジ・ソース不一致を反映した `effective_company_grounding` を唯一の判定軸とする。

**理由:** required テンプレート (`company_motivation` 等) でも、RAG 不足時に `_resolve_effective_grounding_level()` (es_review.py L296-322) が grounding level を `"deep"→"light"` に降格し、`grounding_level_to_policy("light")` → `"assistive"` に落ちる。`company_usage` で判定すると「prompt は敬称を促すが validator は敬称を禁止する」矛盾が生じる。

**統一先:**

| レイヤー | 参照する値 | 変数名 |
|---|---|---|
| builder (rewrite/fallback) | `effective_company_grounding` | L1545-1547 で計算済み |
| builder (length-fix) | `effective_company_grounding` | 新パラメータとして受け取る |
| `_format_company_guidance` | `company_grounding` パラメータ | 既に effective 値が渡されている |
| validator | `effective_company_grounding_policy` | 既にパラメータとして受け取り済み (L563) |
| retry | コードベースの分岐のみ | 判定軸不要 |
| degraded block | コードベースの分岐のみ | 判定軸不要 |
| live gate | `review_meta.company_grounding_policy` | 実際のレビュー実行時の effective 値 |

---

## 設計原則: 御社/貴社の判定

**`御社` を `COMPANY_HONORIFIC_TOKENS` に追加してはならない。**

| | 貴社 | 御社 |
|---|---|---|
| 用途 | 書き言葉（ES・メール・手紙） | 話し言葉（面接・電話） |
| ESでの使用 | 正しい | 不適切 |
| 現在の分類 | `COMPANY_HONORIFIC_TOKENS` | `COMPANY_REFERENCE_TOKENS` |

`COMPANY_HONORIFIC_TOKENS` は `es_review_validation.py:430,522` で required グラウンディングの「正しい敬称が使われているか」の**肯定判定**にも使われる。`御社` を追加すると ES に御社を書いても正しいと判定してしまう。

**正しいアプローチ:** `御社` は `COMPANY_REFERENCE_TOKENS` に留めたまま、ES に `御社` が出現した場合は validation 層で正しい敬称（`貴社` / 業界別）に自動置換する。

---

## 改善施策

### 施策 1: Assistive grounding プロンプト強化

**対象ファイル:** `backend/app/prompts/es_templates.py` の `build_template_rewrite_prompt` (L1490) / `build_template_fallback_rewrite_prompt` (L1640)

**問題:** `effective_company_grounding == "assistive"` のとき、LLM が企業固有語を出力に含めない。特に低コストモデル (claude-haiku) + short/medium 帯で顕著。

**方針:**
- **`_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` には触れない** (静的文字列で条件分岐不可、companyless にも漏れる)
- `build_template_rewrite_prompt` / `build_template_fallback_rewrite_prompt` 内で、以下の条件を満たすときに `<constraints>` ブロックの後に追加指示を動的注入:
  - `effective_company_grounding == "assistive"` (施策 2-A で算出済み)
  - `grounding_mode != "none"` (企業 RAG が利用可能)
  - `company_name` が存在
- 注入内容: 「企業の方向性や価値観に1回だけ具体的に触れ、{company_name}の固有情報を最低1語含める」

**実装詳細:**

#### 1-A: builder 2関数に動的 grounding 指示を注入

`build_template_rewrite_prompt`: L1574 の `</constraints>` 直後、L1576 の length policy の前に:
```python
assistive_grounding_block = ""
if effective_company_grounding == "assistive" and grounding_mode != "none" and company_name:
    assistive_grounding_block = f"""
<assistive_grounding>
企業の方向性や価値観に1回だけ具体的に触れ、{company_name}の固有情報を最低1語含める。
</assistive_grounding>
"""
```
`{assistive_grounding_block}` を system_prompt の f-string に挿入。`effective_company_grounding` は施策 2-A で L1547 の後に算出済み。

`build_template_fallback_rewrite_prompt`: L1717 の `</constraints>` 直後に同様。

#### 1-B: retry_guidance に `grounding` キー追加

TEMPLATE_DEFS の3テンプレートに追加:

| テンプレート | 行 | 追加 |
|---|---|---|
| `basic` | L190-193 | `"grounding": "企業の方向性や価値観との接点を1点だけ具体的に入れる"` |
| `self_pr` | L394-397 | 同上 |
| `work_values` | L512-514 | 同上 |

gakuchika はスキップ（`company_usage: "none"`）。

**前提:** 施策 2 の敬称規約統一が先に完了していること。

---

### 施策 2: Assistive 経路の敬称規約統一

**問題:** 現行 prompt 契約に **二重管理** がある:
- **builder 側** (L1522/L1670): `grounding_mode != "none"` なら一律「企業名ではなく敬称を使う」
- **`_format_company_guidance` 側** (L915-948): assistive 条件で「貴社で活かす系の接続を義務づけない」「企業敬称は使わない（grounding_mode==none 時）」を別途指示

builder だけ直すと prompt 内で「敬称を使わない」と「貴社で活かす系」が混在し、LLM への指示が衝突する。

**方針:**
- **effective_company_grounding == "assistive" のとき敬称を禁止する。** 企業に言及する場合は企業名・事業名・価値観等の固有語で触れ、「貴社」「御社」は使わない。
- prompt 契約 → `_format_company_guidance` → validator → retry → degraded block → length-fix prompt → live gate が一貫して `effective_company_grounding` を参照する。

**実装詳細:**

#### 2-H: `御社` → 正しい敬称への自動置換（~~HONORIFIC_TOKENS への追加~~）

> **v5 修正:** 旧 2-H（`COMPANY_HONORIFIC_TOKENS` に `御社` を追加）は不適切。`御社` は `COMPANY_REFERENCE_TOKENS` に留め、validation 層で自動置換する。

**`backend/app/routers/es_review_validation.py`** の `_validate_rewrite_candidate()` 内、`_fit_rewrite_text_deterministically()` 返却後（L597 付近）:

```python
def _auto_replace_gosha(text: str, industry: str | None) -> tuple[str, list[dict]]:
    """ESでの「御社」を正しい敬称（貴社/貴行等）に自動置換."""
    replacements: list[dict] = []
    if "御社" not in text:
        return text, replacements
    correct_honorific = get_company_honorific(industry)  # es_templates.py:150
    count = text.count("御社")
    text = text.replace("御社", correct_honorific)
    replacements.append({
        "original": "御社", "replaced_with": correct_honorific, "count": count
    })
    return text, replacements
```

**呼び出し条件:**
- `grounding_mode != "none"` のときのみ実行
- companyless では既存の `company_reference_in_companyless` failure で処理
- assistive モードでも自動置換を実行するが、後続の `assistive_honorific` チェック（施策 2-C）で置換後の `貴社` を検出してリジェクト → 正しい動作

**`_validate_rewrite_candidate()` に `industry` パラメータ追加:**
- `es_review.py` の呼び出し元から `industry` を渡す

**`gosha_replacements` メタデータ:** 置換が発生した場合、`length_meta` dict に `"gosha_replacements"` キーとして記録（テレメトリ用）。

#### 2-A: builder 2関数の 2-way → 3-way 分岐 (effective policy ベース)

**`backend/app/prompts/es_templates.py`**

**`build_template_rewrite_prompt`**: 現在の `company_mention_rule` (L1519-1522) は `effective_company_grounding` (L1545-1547) の **前** に定義されている。3-way 分岐は `effective_company_grounding` を使うため、**L1547 の後に移動する**:

```python
# L1547 の後に配置
honorific = get_company_honorific(industry)
if grounding_mode == "none":
    company_mention_rule = "この設問では企業名・企業敬称（貴社・御社・貴行等）を絶対に使わない。自分の経験と強みだけで完結させる"
elif effective_company_grounding == "assistive":
    company_mention_rule = "企業に言及するときは企業名や固有の事業・価値観で触れる。敬称（貴社・御社等）は使わない"
else:
    company_mention_rule = f"本文で企業に言及するときは企業名ではなく「{honorific}」を使う"
```

元の L1518-1522 は削除する。L1569 の `{company_mention_rule}` 参照はそのまま動作する。

**`build_template_fallback_rewrite_prompt`**: 同様に、`company_mention_rule` (L1667-1670) を `effective_company_grounding` (L1692-1694) の **後** に移動。

#### 2-B: `_format_company_guidance` の assistive 文言更新

**`backend/app/prompts/es_templates.py`**

`_format_company_guidance` は `company_grounding` パラメータを受け取り (L889)、これは呼び出し元から `effective_company_grounding` が渡されている (L1605, L1744)。既に effective ベースで動作している。

assistive + `grounding_mode != "none"` の4箇所に敬称禁止ルールを追加:

| 箇所 | 行 | 変更内容 |
|------|------|---------|
| gakuchika + cards あり | L924-931 | 末尾に `"- 「貴社」「御社」等の企業敬称は使わない"` 追加 |
| non-gakuchika + cards あり | L940-948 | 末尾に `"- 「貴社」「御社」等の企業敬称は使わず、企業名や固有の事業・価値観で触れる"` 追加 |
| gakuchika + cards なし | L983-987 | 末尾に `- 「貴社」「御社」等の企業敬称は使わない` 追加 |
| non-gakuchika + cards なし | L994-998 | 末尾に `- 「貴社」「御社」等の企業敬称は使わず、企業名や固有の事業・価値観で触れる` 追加 |

#### 2-C: validator に `assistive_honorific` チェック追加

**`backend/app/routers/es_review_validation.py` L673-677**

`effective_company_grounding_policy` は既にパラメータとして受け取り済み (L563)。es_review.py からは `effective_company_grounding` が渡される (L1126, L1315, L1458)。

```python
companyless_honorific_detected = False
assistive_honorific_detected = False
if grounding_mode == "none":
    companyless_honorific_detected = any(
        token in fitted for token in COMPANY_HONORIFIC_TOKENS
    )
elif effective_company_grounding_policy == "assistive":
    assistive_honorific_detected = any(
        token in fitted for token in COMPANY_HONORIFIC_TOKENS
    )
```

L699 の後に追加:
```python
if assistive_honorific_detected:
    failure_codes.append("assistive_honorific")
    failure_reason = "この設問では「貴社」等の企業敬称ではなく、企業名や固有の事業・価値観で触れてください。"
```

#### 2-D: retry hint + focus mode に `assistive_honorific` 追加

**`backend/app/routers/es_review_retry.py`**

1. **L535-553** の `_retry_hint_from_code` mapping dict に追加:
   ```python
   "assistive_honorific": "「貴社」等の企業敬称ではなく、企業名や固有の事業・価値観で触れる",
   ```

2. **L92-108** の `_resolve_rewrite_focus_mode` mapping に追加:
   ```python
   "assistive_honorific": "grounding_focus",
   ```
   敬称修正は企業言及の表現方法に関わるため `grounding_focus` が適切。

#### 2-E: live gate に assistive 敬称チェック追加

**`backend/app/testing/es_review_live_gate.py` L1179-1183**

既存 `companyless` ブロックの後に `elif` 追加。**`review_meta.company_grounding_policy` (実効ポリシー) で判定する**:

```python
elif (
    review_meta
    and getattr(review_meta, "company_grounding_policy", None) == "assistive"
):
    if any(token in rewrite for token in COMPANY_HONORIFIC_TOKENS):
        failures.append("assistive:honorific_token_present")
```

`review_meta.company_grounding_policy` は es_review.py が実際に使った `effective_company_grounding` を反映する。これにより:
- `company_motivation` + RAG 成功 → `company_grounding_policy="required"` → 敬称許可
- `company_motivation` + RAG 不足 → `company_grounding_policy="assistive"` → 敬称禁止
- `basic` + RAG 成功 → `company_grounding_policy="assistive"` → 敬称禁止

`expected_policy` や `company_context` に依存しないため、テンプレート種別×RAG 状態の全組み合わせで正しく動作する。

#### 2-E-fix: 既存 live case fixture の棚卸し

施策 2 で assistive 敬称禁止を導入するため、既存の assistive live case 定義で「貴社」を期待している箇所を事前に更新する:

| case_id | 行 | 修正内容 |
|---|---|---|
| `basic_assistive_rag_short` | L833 | `expected_focus_tokens` から `"貴社"` を削除し、`"企業"` or `"事業"` に置換 |
| `basic_assistive_rag_short` | L823 | `answer` 内の `貴社` を `三菱商事` に置換（入力テキストとしても敬称を使わない前提に） |

全 assistive ケース（`expected_policy="assistive"` を持つ行: L301, L318, L345, L552, L603, L620, L770, L787, L813, L830, L857, L873, L889, L1009, L1025）を走査し、`expected_focus_tokens` / `answer` / fake LLM output に `貴社`/`御社` が含まれているケースを同様に修正する。

#### 2-F: degraded block codes に `assistive_honorific` 追加

**`backend/app/routers/es_review_retry.py` L151-153**

```python
_DEGRADED_BLOCK_CODES = frozenset({
    "empty", "fragment", "negative_self_eval",
    "company_reference_in_companyless", "assistive_honorific",
})
```

これにより `es_review.py` L1544 の degraded 採用経路で、assistive 敬称違反の候補が最終出力として採用されることを防ぐ。

#### 2-G: `build_template_length_fix_prompt` にも敬称規約を反映

**`backend/app/prompts/es_templates.py` L1773-1879**

length-fix prompt は現在 `company_mention_rule` を含まない。**`effective_company_grounding`** をパラメータとして受け取り、`<constraints>` ブロック（L1850-1854）に敬称規約を注入:

1. シグネチャ拡張: `effective_company_grounding: str = "assistive"`, `grounding_mode: str = "none"` を keyword-only パラメータに追加
2. L1835 の `mode_instructions` 確定後、`<constraints>` に含まれる前に:
   ```python
   if grounding_mode == "none":
       mode_instructions.append("企業名・企業敬称（貴社・御社等）を絶対に使わない")
   elif effective_company_grounding == "assistive":
       mode_instructions.append("企業敬称（貴社・御社等）は使わず、企業名や固有の事業・価値観で触れる")
   ```
3. 呼び出し元 (`es_review.py` L1400) に **`effective_grounding_mode`** と **`effective_company_grounding`** を渡す:
   ```python
   build_template_length_fix_prompt(
       ...,
       grounding_mode=effective_grounding_mode,
       effective_company_grounding=effective_company_grounding,
   )
   ```
   注: `grounding_mode` ではなく `effective_grounding_mode` (L849-861 で補正済み)。`effective_company_grounding` も同じ es_review.py スコープ内の変数。

---

### 施策 3: User fact 保持の短字数帯強化

**short 判定基準: `char_max <= 220`**（既存の `SHORT_ANSWER_CHAR_MAX = 220` (es_review_validation.py L23) および `es_review_retry.py` L617 の `_is_short_answer_mode` と統一）

**対象ファイル (5箇所):**

| # | ファイル | 箇所 | 役割 |
|---|---|---|---|
| 1 | `backend/app/routers/es_review_grounding.py` | L370 | `_select_prompt_user_facts` — 選定ロジック |
| 2 | `backend/app/routers/es_review.py` | L833 | `_select_prompt_user_facts` の呼び出し元 |
| 3 | `backend/app/prompts/es_templates.py` | L847 | `_format_user_fact_guidance` — 表示ルール |
| 4 | `backend/app/prompts/es_templates.py` | L1611 / L1750 | builder 2関数からの `_format_user_fact_guidance` 呼び出し |
| 5 | `backend/app/routers/es_review_retry.py` | L646 | `_select_rewrite_prompt_context` の fact_limit |

**実装詳細:**

#### 3-A: `_select_prompt_user_facts` に `char_max` 追加

**`backend/app/routers/es_review_grounding.py` L370-380**

- シグネチャに `char_max: int | None = None` を追加（`max_items` の前）
- L407-408 の `source_caps` 定義後に:
  ```python
  if char_max is not None and char_max <= 220:
      source_caps["current_answer"] = 4
  ```

#### 3-B: 呼び出し元に `char_max` を渡す

**`backend/app/routers/es_review.py` L833**: `char_max=char_max` を追加

#### 3-C: `_format_user_fact_guidance` に `char_max` 追加

**`backend/app/prompts/es_templates.py` L847-873**

1. **`import re` を追加** (L11 付近、既存 import の後)。`es_templates.py` には現在 `re` の import が存在しない。

2. シグネチャに `char_max: int | None = None` を追加

3. L873 の return 前に短字数帯ロジック:
   ```python
   short_band_line = ""
   if char_max is not None and char_max <= 220 and allowed_user_facts:
       anchor_tokens: list[str] = []
       for item in allowed_user_facts:
           if str(item.get("source", "")) == "current_answer":
               text = str(item.get("text", ""))
               # 数値+単位
               anchor_tokens.extend(re.findall(r"\d+[人名件%万円個年月日回倍]?", text))
               # カタカナ語 (2文字以上)
               anchor_tokens.extend(re.findall(r"[ァ-ヴー]{2,}", text))
               # 英字 (2文字以上)
               anchor_tokens.extend(re.findall(r"[A-Za-z]{2,}", text))
               # 漢字2〜4文字の名詞候補 (研究室, 仮説検証, 論点整理 等)
               anchor_tokens.extend(re.findall(r"[\u4e00-\u9fff]{2,4}", text))
       if anchor_tokens:
           filtered = [t for t in anchor_tokens if len(t) >= 2 or re.match(r"\d+.", t)]
           unique = list(dict.fromkeys(filtered))[:6]
           if unique:
               short_band_line = (
                   f"\n【短字数帯: 以下の語句から最低1つを本文に残すこと】"
                   f"\n{', '.join(unique)}"
               )
   ```
   return の最後に `{short_band_line}` を付加。

#### 3-D: builder 呼び出しに `char_max` を渡す

**`backend/app/prompts/es_templates.py`**
- L1611: `_format_user_fact_guidance(allowed_user_facts, template_type=template_type, char_max=char_max)`
- L1750: 同上

#### 3-E: `_select_rewrite_prompt_context` の short 帯 fact_limit を引き上げ

**`backend/app/routers/es_review_retry.py` L645-646**

現状: `short_answer_mode` のとき `fact_limit = 4`
変更: `fact_limit = 5`

```python
elif short_answer_mode:
    fact_limit = 5
```

3-A の source_caps 引き上げ (`current_answer` 3→4) と合わせて、short 帯で current_answer 由来の具体語が prompt に1つ多く入る。`fact_limit=4` のままだと、support_fact (gakuchika_summary 等) と profile_fact が先に枠を埋め、cap を上げても実効的に増えない。

---

### 施策 4: AI臭 Tier 2 閾値テーブルの構造実装

**対象ファイル:**

| # | ファイル | 箇所 | 役割 |
|---|---|---|---|
| 1 | `backend/app/routers/es_review_validation.py` | L846 | `_compute_ai_smell_score` — シグネチャ変更 |
| 2 | `backend/app/routers/es_review_validation.py` | L629 | `_validate_rewrite_candidate` — 呼び出し元 |
| 3 | `backend/app/routers/es_review.py` | L1210 | B-Phase2 retry 分岐 (既存、現状デッドコード) |
| 4 | テスト各種 | — | 単体テスト更新 + 統合テスト追加 |

**注意:** 施策 6 の文末反復ペナルティ変更 (3.0→2.0) がスコア分布に影響するため、施策 6 の後で閾値を最終決定する。

**実装詳細:**

#### 4-A: ヘルパーと閾値テーブル追加

**`backend/app/routers/es_review_validation.py`** L844 の前に:
```python
def _char_max_to_band(char_max: int | None) -> str:
    """既存 SHORT_ANSWER_CHAR_MAX=220 に合わせた band 分類."""
    if not char_max or char_max <= 220:
        return "short"
    if char_max <= 400:
        return "medium"
    return "long"

_AI_SMELL_TIER2_THRESHOLDS: dict[str, dict[str, float]] = {
    "default": {"short": 3.5, "medium": 4.0, "long": 4.5},
    "gakuchika": {"short": 3.0, "medium": 3.5, "long": 4.0},
}
```

short/medium 境界は **220** (`SHORT_ANSWER_CHAR_MAX` と一致)。medium/long 境界は 400。

#### 4-B: `_compute_ai_smell_score` シグネチャ拡張

**L846**: `(text: str, user_answer: str)` → `(text: str, user_answer: str, *, template_type: str = "basic", char_max: int | None = None)`

#### 4-C: tier 判定ロジック拡張

**L1011-1017** を置換:
```python
if effective_score <= 1.0:
    tier = 0
else:
    band = _char_max_to_band(char_max)
    thresholds = _AI_SMELL_TIER2_THRESHOLDS.get(template_type, _AI_SMELL_TIER2_THRESHOLDS["default"])
    tier2_threshold = thresholds.get(band, 4.0)
    tier = 2 if effective_score >= tier2_threshold else 1
```

#### 4-D: 呼び出し元更新

**L629**: `_compute_ai_smell_score(fitted, user_answer, template_type=template_type, char_max=char_max)`

#### 4-E: テスト更新

**`backend/tests/es_review/test_es_review_template_repairs.py`**

既存11テストはデフォルト引数で動作するため変更不要。以下を追加:
- `test_tier2_reached_for_high_score` — 複数パターン (Tier A + B) で effective_score >= 4.0 → tier=2
- `test_tier2_gakuchika_lower_threshold` — gakuchika の低閾値 (3.0/3.5/4.0) を確認
- `test_tier1_below_tier2_threshold` — 閾値未満 → tier=1 のまま
- `test_char_max_to_band_boundaries` — None→short, 220→short, 221→medium, 400→medium, 401→long

---

### 施策 5: Extended テスト再実行 + live gate の assistive honorific 判定追加

**対象ファイル:** `backend/app/testing/es_review_live_gate.py` L1179

**実装詳細:**

#### 5-A: live gate 更新（施策 2-E で完了済み）

#### 5-B: ユニットテスト実行

```bash
pytest backend/tests/es_review/ -x -q
```

#### 5-C: extended テスト実行

```bash
RUN_LIVE_ES_REVIEW=1 LIVE_ES_REVIEW_CASE_SET=extended pytest backend/tests/es_review/integration/test_live_es_review_provider_report.py -x
```

結果を `backend/tests/output/` に出力し、Dataset C との比較で改善を定量評価。

---

### 施策 6 (新規): AI臭検出の改善

**品質評価スコア:** C+ → B+ を目指す

**対象ファイル:**

| # | ファイル | 箇所 | 役割 |
|---|---|---|---|
| 1 | `backend/app/routers/es_review_validation.py` | L886-906 | `_compute_ai_smell_score` — repetitive_ending 判定 |
| 2 | `backend/app/routers/es_review_validation.py` | L976-1006 | `_compute_ai_smell_score` — Tier C セクション |
| 3 | `backend/app/routers/es_review_retry.py` | L179-204 | AI smell retry hints |
| 4 | テスト | — | 単体テスト追加 |

#### 6-A: 文末反復検出の閾値修正（3連続→2連続）

**問題:** プロンプト（`es_templates.py:1571`）は「末尾で同じ文末表現を**2文連続**で使わない」と指示するが、`_compute_ai_smell_score()` の `repetitive_ending` 検出（`es_review_validation.py:886-906`）は **3文連続** でしか判定しない。短文 ES（120-200字）では文が 3-4文しかなく、2連続でも全体の 50% 以上を占め非常に単調に見える。

**変更:**

1. **`ending_patterns` の算出を関数冒頭に移動** — 現在は `if len(sentences) >= 3:` ブロック（L887）内にスコープされており、Tier C からアクセスできない。sentences 分割の直後（L860 付近）に移動して全 Tier から参照可能にする:
   ```python
   # sentences 分割の直後
   ending_patterns: list[str | None] = []
   for s in sentences:
       matched = False
       for ending in ("したい", "と考える", "である", "と考えている", "していきたい", "ていく", "できる"):
           if s.endswith(ending):
               ending_patterns.append(ending)
               matched = True
               break
       if not matched:
           ending_patterns.append(None)
   ```

2. **repetitive_ending の判定を 2連続に変更** — 元の `if len(sentences) >= 3:` ブロックを置換:
   ```python
   # A-1: repetitive_ending (same ending 2+ consecutive)
   if len(sentences) >= 2:
       for i in range(len(ending_patterns) - 1):
           if ending_patterns[i] and ending_patterns[i] == ending_patterns[i + 1]:
               penalty = 2.0  # 3連続の3.0から減額（2連続は軽度）
               raw_score += penalty
               pattern_details.append({
                   "code": "repetitive_ending", "tier": "A", "penalty": penalty,
                   "detail": f"「〜{ending_patterns[i]}」が2文以上連続",
               })
               break
   ```

3. **retry hint 更新:** `es_review_retry.py:189` の文言を「3文連続」→「2文連続」に修正

#### 6-B: 文末多様性比率メトリクス（新規 Tier C ペナルティ）

`_compute_ai_smell_score()` の Tier C セクション末尾（L1006 の `abstract_aspiration_chain` の後）に追加:

```python
# C-3: low_ending_diversity (low unique ending ratio)
if tier_ab_score >= 1.0 and len(sentences) >= 3:
    matched_endings = [ep for ep in ending_patterns if ep is not None]
    if len(matched_endings) >= 3:
        diversity_ratio = len(set(matched_endings)) / len(matched_endings)
        if diversity_ratio < 0.5:
            penalty = 0.5
            raw_score += penalty
            pattern_details.append({
                "code": "low_ending_diversity", "tier": "C", "penalty": penalty,
                "detail": f"文末多様性 {diversity_ratio:.2f} (unique {len(set(matched_endings))}/{len(matched_endings)})",
            })
```

6-A で `ending_patterns` を関数冒頭に移動済みのため Tier C からアクセス可能。Tier C ガード (`tier_ab_score >= 1.0`) により、他の AI 臭パターンが検出されていない場合は発火しない。

**retry hint 追加:** `es_review_retry.py` の `_build_ai_smell_retry_hints()` に:
```python
"low_ending_diversity": "文末表現のバリエーションを増やす（〜したい、〜できる、〜と考える を使い分ける）"
```

**focus mode:** `_resolve_rewrite_focus_mode` mapping に `"low_ending_diversity": "ai_smell_focus"` を追加。

#### 6-C: テスト

**`backend/tests/es_review/test_es_review_template_repairs.py`**

| テスト | 内容 | 施策 |
|---|---|---|
| `test_two_consecutive_endings_detected` | 2連続同一文末で `repetitive_ending` 検出 | 6-A |
| `test_single_ending_no_penalty` | 連続なしでペナルティなし | 6-A |
| `test_repetitive_ending_tier_a` (既存更新) | ペナルティ 3.0→2.0 に更新 | 6-A |
| `test_low_ending_diversity_penalty` | 5文中4文同一文末、tier_ab>=1.0 → 0.5 ペナルティ | 6-B |
| `test_ending_diversity_no_penalty_without_tier_ab` | diversity 低くても tier_ab<1.0 → ペナルティなし | 6-B |

---

### 施策 7 (新規): 文字数制御の改善（CAPEL 論文ベース）

**品質評価スコア:** B- → B+ を目指す

**研究根拠:**
- **CAPEL** (arXiv 2508.13805): カウントダウンマーカーで 94.2% exact match（GPT-4.1）。中国語 (CJK) で 73% MALD 改善。Draft-then-CAPEL ハイブリッドで品質劣化を緩和 (品質スコア 4.06→5.33)
- **Wiki-40B 実測値** (Zenn/Microsoft): Claude 1.12 tok/char, GPT-4o 0.80 tok/char, Gemini 1.22 tok/char
- **LCTG Bench** (arXiv 2501.15875): 初の日本語制御性ベンチマーク。大規模多言語モデルが日本語特化モデルより文字数制御で優位
- **実務知見**: `N〜M字` 範囲指定が最も有効（`N文字程度` は ±30% ズレ）

**使用モデル:** GPT-5.4, Claude Sonnet 4.6, Claude Haiku 4.5, Gemini 3.1 Pro

**対象ファイル:**

| # | ファイル | 箇所 | 役割 |
|---|---|---|---|
| 1 | `backend/app/prompts/es_templates.py` | L817-844 | `_format_length_policy_block` — 長さポリシーブロック |
| 2 | `backend/app/prompts/es_templates.py` | L1487-1633 | `build_template_rewrite_prompt` — メインビルダー |
| 3 | `backend/app/prompts/es_templates.py` | L1636-1770 | `build_template_fallback_rewrite_prompt` — フォールバック |
| 4 | `backend/app/prompts/es_templates.py` | L1773-1879 | `build_template_length_fix_prompt` — 長さ修正 |

#### 7-A: セルフカウント指示ヘルパー追加

**`backend/app/prompts/es_templates.py`** に新規関数:

```python
def _format_self_count_instruction(
    char_min: int | None,
    char_max: int | None,
    *,
    llm_model: str | None = None,
    length_fix_mode: bool = False,
) -> str:
    """CAPEL論文(arXiv 2508.13805)に基づくセルフカウント指示を生成."""
    if not char_min or not char_max:
        return ""
    family = _model_provider_family(llm_model)
    if length_fix_mode:
        base = f"修正後の文字数を必ず数え直すこと。{char_min}〜{char_max}字の範囲外なら再度調整すること"
        if family in ("openai_gpt5", "openai_gpt5_mini"):
            return f"- {base}。Draft→Count→Adjust の3ステップで進める"
        elif family == "google_gemini":
            return f"- {base}。各段落の字数配分を先に決めてから調整すること"
        return f"- {base}"
    base = f"生成完了前に改善案の文字数を数え、{char_min}〜{char_max}字の範囲外なら範囲内に収まるよう調整すること"
    if family == "google_gemini":
        band = _length_band(char_max)
        if band in ("medium", "long"):
            return f"- {base}。段落ごとの字数配分を意識すること"
    return f"- {base}"
```

既存の `_model_provider_family()` (L92-102) を活用してモデル判別。

#### 7-B: 3つの builder 関数へのセルフカウント指示挿入

**`build_template_rewrite_prompt()`** L1573（`</constraints>` 直前）に挿入:
```python
{_format_self_count_instruction(char_min, char_max, llm_model=llm_model)}
```

**`build_template_fallback_rewrite_prompt()`** の `</constraints>` 直前に同様。

**`build_template_length_fix_prompt()`** の `</constraints>` 直前に `length_fix_mode=True` で呼び出し:
```python
{_format_self_count_instruction(char_min, char_max, llm_model=llm_model, length_fix_mode=True)}
```

#### 7-C: `_format_length_policy_block()` にモデル別ガイダンス追加

**`es_templates.py:817-844`** の `_format_length_policy_block()` に追加:

```python
model_guidance = ""
family = _model_provider_family(llm_model)
if family == "google_gemini" and char_max and char_max > 220:
    model_guidance = "\n- 段落配分: 冒頭1文(15-25%), 本体(50-65%), 締め(15-25%)"
```

`<length_policy>` ブロック末尾（`{long_line}` の後）に `{model_guidance}` を挿入。

**設計判断:** max_tokens の倍率（`_rewrite_max_tokens()` の `char_max * 1.4`）は変更しない。プロンプト側のセルフカウント指示で生成精度を改善し、post-validation + retry で最終品質を担保する。

#### 7-D: テスト

**`backend/tests/es_review/test_es_review_prompt_structure.py`**

| テスト | 内容 |
|---|---|
| `test_self_count_instruction_present_in_rewrite_prompt` | char_min/char_max 指定時にセルフカウント指示が含まれる |
| `test_self_count_instruction_absent_without_limits` | 指定なし時に指示なし |
| `test_length_fix_prompt_has_draft_count_adjust` | length_fix + GPT モデルで「Draft→Count→Adjust」が含まれる |
| `test_gemini_paragraph_allocation_in_policy` | Gemini + medium 帯で段落配分指示が含まれる |

---

### 施策 8 (新規): グローバルルール最適化

**品質評価スコア:** A- → A を目指す（attention 分散リスクの解消）

**問題:** `_GLOBAL_CONCLUSION_FIRST_RULES`（`es_templates.py:14-27`）は **12項目** が全テンプレートに一律適用される。gakuchika（企業言及なし）にも企業系ルールが注入され、LLM の attention が分散して各ルールの遵守率が低下する。

**対象ファイル:**

| # | ファイル | 箇所 | 役割 |
|---|---|---|---|
| 1 | `backend/app/prompts/es_templates.py` | L14-27 | `_GLOBAL_CONCLUSION_FIRST_RULES` 定義 |
| 2 | `backend/app/prompts/es_templates.py` | L1579 | `build_template_rewrite_prompt` の `<core_style>` ブロック |
| 3 | `backend/app/prompts/es_templates.py` | L1722 | `build_template_fallback_rewrite_prompt` の `<core_style>` ブロック |

#### 8-A: `_StyleRule` データクラスとルールレジストリ

```python
@dataclass(frozen=True)
class _StyleRule:
    text: str
    scope: str  # "always" | "short_only" | "company_grounding" | "company_template"
    applicable_templates: frozenset[str] | None  # None = 全テンプレート

_STYLE_RULES: list[_StyleRule] = [
    # 必須（常に注入）— 4項目
    _StyleRule(
        "1文目は設問への答えを結論として短く言い切る（設問文の言い換えや背景説明から入らない）",
        "always", None),
    _StyleRule(
        "各文は役割を1つに絞り、同趣旨を言い換えて引き延ばさない",
        "always", None),
    _StyleRule(
        "ユーザーの元回答に含まれる数値・固有名詞（○人、○か月、ツール名、イベント名など）は必ず保持する",
        "always", None),
    _StyleRule(
        "指定の字数下限を下回る改善案は再検証で弾かれる。要約しすぎず、下限まで本文を伸ばす",
        "always", None),

    # short 帯のみ — 1項目
    _StyleRule(
        "短字数（220字以下）でも、ユーザーの元回答にある具体的な場面・文脈語（研究室、ゼミ、サークル名、仮説、検証など）を最低1語は本文に残す。全てを抽象化しない",
        "short_only", None),

    # 企業グラウンディング系（company_usage != "none" かつ grounding_mode != "none"）— 4項目
    _StyleRule(
        "「整理した」「取り組んだ」「向き合った」のような抽象動詞だけで済ませず、具体的な行動（何をどうしたか）を1つ以上含める",
        "company_grounding", None),
    _StyleRule(
        "「多様な」「幅広い」「さまざまな」のような形容詞を単独で使わず、具体例や対象を併記する",
        "company_grounding", None),
    _StyleRule(
        "「関係者を巻き込みながら」「新たな価値を」「幅広い視野」等のLLM特有フレーズは、ユーザーの元回答に含まれていない限り使わない",
        "company_grounding", None),
    _StyleRule(
        "「貢献する」「成長する」だけで終わらず、何にどう貢献するか・どの方向に成長するかを1語以上具体化する",
        "company_grounding", None),

    # 企業特化テンプレートのみ（company_usage == "required"）— 3項目
    _StyleRule(
        "「この経験を活かし」「この力を生かし」のような定型接続は避け、文脈固有の橋渡し表現に変える",
        "company_template",
        frozenset({"company_motivation", "intern_reason", "post_join_goals"})),
    _StyleRule(
        "企業接点・貢献・活かし方は必要なら1文に圧縮してよく、段階を無理に増やさない",
        "company_template",
        frozenset({"company_motivation", "intern_reason", "intern_goals", "post_join_goals", "role_course_reason"})),
    _StyleRule(
        "下限が200字を超える設問では、具体を削りすぎず下限付近まで本文を伸ばす",
        "company_template", None),
]
```

#### 8-B: `_build_contextual_rules()` 関数

```python
def _build_contextual_rules(
    template_type: str,
    band: str,  # "short" | "medium" | "long"
    grounding_mode: str,
) -> str:
    """テンプレート×字数帯×グラウンディングモードに応じてスタイルルールを絞り込む."""
    company_usage = TEMPLATE_DEFS.get(template_type, {}).get("company_usage", "none")
    is_company = company_usage in ("required", "assistive") and grounding_mode != "none"

    filtered: list[str] = []
    for rule in _STYLE_RULES:
        if rule.applicable_templates and template_type not in rule.applicable_templates:
            continue
        if rule.scope == "always":
            filtered.append(rule.text)
        elif rule.scope == "short_only" and band == "short":
            filtered.append(rule.text)
        elif rule.scope == "company_grounding" and is_company:
            filtered.append(rule.text)
        elif rule.scope == "company_template" and company_usage == "required":
            filtered.append(rule.text)

    header = "【結論ファースト（全設問・全文字数）】"
    return header + "\n" + "\n".join(f"- {r}" for r in filtered)
```

#### 8-C: builder 関数への適用

**`build_template_rewrite_prompt`** L1579:
```python
# Before:
{_GLOBAL_CONCLUSION_FIRST_RULES}
# After:
{_build_contextual_rules(template_type, _length_band(char_max), grounding_mode)}
```

**`build_template_fallback_rewrite_prompt`** L1722: 同上

**`_GLOBAL_CONCLUSION_FIRST_RULES` / `_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` は削除せず残す**（fallback safety net として保持）。

#### 8-D: 期待されるルール数

| テンプレート | band | ルール数 | 現行比 |
|---|---|---|---|
| gakuchika | short | 5 | 12→5 (58%削減) |
| gakuchika | medium/long | 4 | 12→4 (67%削減) |
| basic (assistive) | short | 9 | 12→9 |
| basic (assistive) | medium/long | 8 | 12→8 |
| company_motivation (required) | short | 12 | 12→12 (全ルール適用) |
| company_motivation (required) | medium/long | 11 | 12→11 |

gakuchika で最大の効果（67%削減）。company_motivation では変わらない（全ルールが該当するため）。

#### 8-E: テスト

**`backend/tests/es_review/test_es_review_prompt_structure.py`**

| テスト | 内容 |
|---|---|
| `test_contextual_rules_gakuchika_excludes_company_rules` | gakuchika に企業系ルールが含まれない |
| `test_contextual_rules_short_band_includes_short_rule` | short 帯に具体性ルールが含まれる |
| `test_contextual_rules_company_motivation_has_connector_rule` | company_motivation に定型接続ルールが含まれる |
| `test_contextual_rules_basic_medium_excludes_short_rule` | medium 帯に short_only ルールが含まれない |
| `test_fallback_rules_unchanged` | `_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` が不変 |

---

### 施策 9 (新規): 散文品質・文章構造の改善（プロンプトのみ）

**根拠:** 研究根拠セクション参照（就活 ES 文章品質の外部ソース調査）
**prompt-engineer レビュー:** 閾値統一・トークン効率・短字数帯ゲーティングの3点で改善済み

**問題:** ES 添削の出力に以下の3つの品質課題がある:
1. **改行混入** — LLM が段落分けの改行を入れ、Web 提出フォームで崩れる（多くの Web ES システムで改行が自動削除される）
2. **文末単調** — 「〜した。〜した。〜した。」のような同一文末の連続で稚拙な印象を与える
3. **流れの欠如** — 箇条書き的な事実羅列で、一本の散文として読みにくい

**方針:** `es_templates.py` と `reference_es.py` のプロンプトテキストのみ修正。バリデーション・ルーターの Python ロジックは変更しない。施策 8 と同じファイル（`es_templates.py`）を大幅に変更するため、同時に実装して衝突を回避する。

**対象ファイル:**

| # | ファイル | 箇所 | 役割 |
|---|---|---|---|
| 1 | `backend/app/prompts/es_templates.py` | L14-26 | `_GLOBAL_CONCLUSION_FIRST_RULES` — 全パス共通スタイルルール |
| 2 | `backend/app/prompts/es_templates.py` | L1556/1703/1845 | `output_contract` — 出力形式制約 (primary/fallback/length_fix) |
| 3 | `backend/app/prompts/es_templates.py` | L1571/1715/1418 | `constraints` — 文末ルール (primary/fallback/draft) |
| 4 | `backend/app/prompts/es_templates.py` | L1580/1723/1426 後 | `<prose_style>` — 新設セクション (primary/fallback/draft) |
| 5 | `backend/app/prompts/reference_es.py` | L25-129, L468 | 品質ヒント (9テンプレート + ハードコード行) |

#### 9-A: `_GLOBAL_CONCLUSION_FIRST_RULES` に3行追加

**`es_templates.py`** L26 (`全てを抽象化しない"""` の直前）に以下3行を追加:

```
- 本文は改行・空行を入れず、1段落の連続した文として出力する
- 語尾に変化をつけ、同じ文末を隣接させない（中止法「〜し、」や理由表現「〜からだ」を織り交ぜる）
- 前文の結果や対象を次文の主語に据え、箇条書き的な羅列ではなく一本の流れにする
```

**効果:** 全4プロンプトパス (primary/fallback/length_fix/draft) の `<core_style>` に自動伝播。最大カバレッジ。数値閾値は `<constraints>` に委ね、ここでは原則のみ記述する。

#### 9-B: `output_contract` に改行禁止を追加（3箇所）

**P0（最優先）** — 改行問題を直接修正する最高インパクトの変更。

| 箇所 | 行 | 変更 |
|---|---|---|
| Primary rewrite | L1556 | `出力は改善案本文のみ` → `出力は改善案本文のみ（改行・空行を入れず1段落の連続した文章として出力する）` |
| Fallback rewrite | L1703 | `出力は本文のみ` → `出力は本文のみ（改行・空行を入れず1段落の連続した文章として出力する）` |
| Length fix | L1845 | `出力は修正後の本文のみ` → `出力は修正後の本文のみ（改行・空行を入れず1段落の連続した文章として出力する）` |

**備考:** Draft 生成プロンプト (L1344, L1351) は既に「改行・箇条書き・空行を入れず1段落の連続した文章」を含むため変更不要。

#### 9-C: `constraints` 文末ルール強化（3箇所）

全プロンプトパスで「2文連続禁止」を canonical な閾値として統一。

| 箇所 | 行 | OLD | NEW |
|---|---|---|---|
| Primary rewrite | L1571 | `末尾で同じ文末表現（〜したい、〜と考える 等）を2文連続で使わない` | `同じ文末表現（〜した、〜したい、〜と考える、〜である 等）を2文連続で使わない` |
| Fallback rewrite | L1715 | 同上 | 同上 |
| Draft generation | L1418 | `末尾で同じ文末表現を2文連続で使わない` | `同じ文末表現（〜した、〜したい、〜と考える、〜である 等）を2文連続で使わない` |

**変更点:**
- 最大の問題だった「〜した」「〜である」を例示に追加
- 冗長な「末尾で」を削除
- 「3文中に同じ語尾が2回」ルールは prompt-engineer レビューで「7箇所×3種の閾値で LLM が混乱する」と指摘されたため、`<constraints>` は「2文連続」の一点に絞る

**閾値整合性の設計判断:**
- **プロンプト (constraints):** 2文連続禁止（予防的）
- **バリデーション (`es_review_validation.py` L886):** 3文連続で検出（施策 6-A で更新予定）
- この非対称性は防御的多層構造として意図的。バリデーションを2連続に下げると false positive が増加するため、バリデーション側は変更しない

#### 9-D: `_format_prose_style_guidance()` 関数と `<prose_style>` セクション新設

**prompt-engineer レビューの反映:**
- 元の提案 (~250 トークン) を ~120 トークンに圧縮 (52% 削減)
- 連体形止め（「〜するもの」「〜できる力」）を削除 — ES 文脈で不自然
- 「4文以上では最低2種類」等の数値ターゲットを削除 — LLM がカウントに注力し自然な文章が崩れる
- 体言止めは named technique with cap → passing mention に格下げ — 1回/フィールドの cap 自体が AI パターンになるため
- **`char_max > 220` でゲーティング** — 短字数帯 (2-3文) では散文技法が逆効果

**`es_templates.py`** に新規関数を追加:

```python
def _format_prose_style_guidance(char_max: int | None) -> str:
    """散文品質向上の技法ガイダンスを生成.

    短字数帯（<=220字）では散文技法が逆効果になるためスキップ。
    施策8の _build_contextual_rules() から呼び出し可能にする。
    """
    if char_max is not None and char_max <= 220:
        return ""
    return """
<prose_style>
【文末の変化】
- 「〜した」「〜である」の反復を防ぐため、以下を自然に織り交ぜる:
  - 中止法: 「〜し、」「〜であり、」で関連する行動を統合
  - 理由表現: 「〜からだ」「〜ためだ」で動機を示す文末に使う
- 体言止めも使えるが、多用は避ける

【文のつながり】
- 前の文の結果や対象を次の文の主語に据え、接続詞なしでも流れをつくる
- 順接の接続詞（そして、また、さらに）は省き、逆接・転換（しかし、そこで）にだけ使う
</prose_style>
"""
```

**挿入箇所:** `</core_style>` 直後、`<template_focus>` 直前に `{_format_prose_style_guidance(char_max)}` を挿入:
- Primary rewrite: L1580 `</core_style>` の後
- Fallback rewrite: L1723 `</core_style>` の後
- Draft generation: L1426 `</core_style>` の後

**Length fix には追加しない** — テキスト最小変更が目的のパスであり、`_GLOBAL_CONCLUSION_FIRST_RULES` 経由の軽いルールのみ適用。

**施策 8 との統合:** 施策 8 の `_build_contextual_rules()` が `<core_style>` の内容を動的に組み立てるため、`_format_prose_style_guidance()` は独立関数として定義し、施策 8 からも呼び出せる設計にする。

#### 9-E: `reference_es.py` の品質ヒント更新

##### 9-E-1: NG 行の更新（9テンプレート）

L25/39/52/65/78/91/104/117/129 の各テンプレートで:
```
OLD: "NG: 「〜したい」「〜と考える」で連続して終わる文末パターン",
NEW: "NG: 同じ文末（〜した/〜したい/〜と考える 等）が2文連続で並ぶ単調な語尾",
```

##### 9-E-2: 流れヒント追加（9テンプレート）

各テンプレートの最初の NG 行の直前に1行追加:
```python
"文を羅列せず、前文の帰結を次文の起点にして一本の流れをつくる",
```

##### 9-E-3: `build_reference_quality_block` 内のハードコード行更新

L468:
```
OLD: - 文末表現（〜したい/〜と考える/〜である）を3回以上連続させず、語尾に変化をつける
NEW: - 文末表現（〜した/〜したい/〜と考える/〜である）を2文連続で使わず、中止法・理由表現で語尾に変化をつける
```

#### 9-F: テスト

**`backend/tests/es_review/test_es_review_prompt_structure.py`**

| テスト | 内容 |
|---|---|
| `test_prose_style_present_for_long_answer` | char_max=400 のとき `<prose_style>` ブロックが出力に含まれる |
| `test_prose_style_absent_for_short_answer` | char_max=200 のとき `<prose_style>` が含まれない |
| `test_output_contract_no_linebreak_primary` | primary rewrite の output_contract に「改行」禁止が含まれる |
| `test_output_contract_no_linebreak_fallback` | fallback rewrite 同上 |
| `test_output_contract_no_linebreak_length_fix` | length_fix 同上 |
| `test_constraints_ending_variety_includes_shita` | constraints に「〜した」が例示されている |
| `test_global_rules_include_flow_guidance` | `_GLOBAL_CONCLUSION_FIRST_RULES` に改行禁止・語尾変化・流れの3行が含まれる |

**変更サマリー:**

| # | ファイル | 箇所 | 変更内容 | 対応する問題 |
|---|---|---|---|---|
| 9-A | `es_templates.py` | `_GLOBAL_CONCLUSION_FIRST_RULES` | 3行追加 | 改行・文末・流れ全て |
| 9-B | `es_templates.py` | `output_contract` x3 | 改行禁止追加 | 改行 |
| 9-C | `es_templates.py` | `constraints` x3 | 文末ルール強化 | 文末単調 |
| 9-D | `es_templates.py` | `<prose_style>` x3 | 新設 (~120 tok, ゲート付き) | 文末・流れ |
| 9-E-1 | `reference_es.py` | NG行 x9 | 閾値を「2文連続」に統一 | 文末単調 |
| 9-E-2 | `reference_es.py` | ヒント追加 x9 | 流れヒント追加 | 流れ |
| 9-E-3 | `reference_es.py` | L468 ハードコード | 閾値統一 + 技法名追加 | 文末単調 |

**リスク:**
- **トークン増加:** `<prose_style>` ブロックで約 120 トークン増（prompt-engineer レビューで 250→120 に圧縮済み）。既存プロンプトの規模に対して軽微
- **Length fix への影響:** `<prose_style>` は length_fix には追加しない。`_GLOBAL_CONCLUSION_FIRST_RULES` 経由の軽いルールのみ適用
- **短字数帯:** `char_max <= 220` では `<prose_style>` をスキップ。2-3文の短文に散文技法を強制すると逆効果になるため
- **意図的な冗長性:** `core_style` (原則) ・`constraints` (閾値) ・`prose_style` (技法) ・`reference_quality` (品質ヒント) の4層で同趣旨のルールを異なる抽象度で配置。LLM は重要ルールが複数箇所にある方が遵守率が高い。ただし数値閾値は `constraints` の「2文連続」に一元化

---

## Phase 10: 目視レビュー基づく散文品質改善（プロンプト層中心）

**実装確認メモ (2026-04-17):**
- 施策 10-14 は `backend/app/prompts/es_templates.py` / `backend/app/prompts/reference_es.py` に実装済み
- `backend/tests/es_review/test_es_review_prompt_structure.py` の Phase 10 関連ケースは通過
- `backend/tests/es_review/test_reference_es_quality.py` は Phase 10 専用ケースの整合を確認。`reference quality profile` 全体の旧期待値ずれによる失敗は別件として扱う

Phase 1-9 で検出ロジック・validation 層・プロンプト構造は整備済み。Phase 10 は
プロンプト文言と reference_es.py の品質ヒントのみを更新し、LLM 出力の表現品質を底上げする。

### 設計原則

- **builder 側注入を主、reference_es.py は補強** — `build_reference_quality_block()` は reference profile 無しで空文字を返すため、普遍ルールは builder の `<constraints>` または `_build_contextual_rules()` 経由で注入。reference_es.py は**既存ヒントの置換のみ**
- **プロンプト層中心:** validation 層のリジェクト追加は行わない（false positive リスク）
- **`_StyleRule` の最小拡張**: `applicable_templates: frozenset[str] | None = None` フィールドを追加。scope は既存 4 値（`all/company/short_only/mid_long`）を維持
- **Phase 10 は rewrite/fallback 経路が対象**: `build_template_draft_generation_prompt()` は `_GLOBAL_CONCLUSION_FIRST_RULES` 経由でのみ恩恵を受ける。draft への包括適用は別 Phase

### `_StyleRule` の最小拡張（Phase 10 共通前処理）

```python
@dataclass(frozen=True)
class _StyleRule:
    text: str
    scope: str  # "all" | "company" | "short_only" | "mid_long"
    applicable_templates: frozenset[str] | None = None  # None = 全テンプレートに適用
```

`_build_contextual_rules()` に 1 行追加:

```python
for rule in _STYLE_RULES:
    if rule.applicable_templates and template_type not in rule.applicable_templates:
        continue
    # 以降は既存ロジック
```

既存 scope enum は拡張しない。`applicable_templates` が None のときは全テンプレート対象（後方互換）。

---

### 施策 10: 冒頭文の結論先出し強化

#### 対象ファイル

| # | ファイル | 箇所 |
|---|---|---|
| 1 | `backend/app/prompts/es_templates.py` | `build_template_rewrite_prompt` / `build_template_fallback_rewrite_prompt` の `<constraints>` |
| 2 | `backend/app/prompts/es_templates.py` | `_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` |
| 3 | `backend/app/prompts/reference_es.py` | 9 テンプレート × 1 行置換 |

#### 10-A: builder 2 関数の `<constraints>` に冒頭字数ルール追加

`build_template_rewrite_prompt` (`es_templates.py:1729-1743`) の `<constraints>` ブロック内、
`- 設問の冒頭表現をそのまま繰り返して始めない` の直後に追加:

```
- 1文目は設問への答えを20〜45字で言い切る。「〜が目標である」「〜を目指している」「〜が目指す姿だ」のような長い前置きや設問の言い換えから入らない
```

`build_template_fallback_rewrite_prompt` (`es_templates.py:1880-1890`) にも同じ行を追加。

**効果:** draft を含まない rewrite/fallback 経路の 100% に適用。reference ES の有無に依存しない。

#### 10-A-2: `_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` にも 1 行追加

`es_templates.py:16-27` の fallback グローバルルールの 1 番目（`1文目は設問への答えを結論として短く言い切る`）を以下で置換:

```
- 1文目は設問への答えを20〜45字で短く言い切る（設問文の言い換えや「〜が目標である」等の長い前置きから入らない）
```

**効果:** Notion 管理 prompt の fallback として draft generation prompt (`es_templates.py:1590`) にも反映される。
Notion 側の動的 prompt には影響しないため、後日 Notion 側の文言も同期する（別タスク）。

#### 10-B: reference_es.py の置換（9 テンプレート一括）

`reference_es.py` で全 9 テンプレートの **1 番目のヒント**（`冒頭1文で設問への答えを明確に置く` 等）を統一文言に置換:

```python
"冒頭1文は設問への答えを20〜45字で言い切り、冗長な前置きや設問の言い換えから入らない",
```

各テンプレートの 1 番目のヒント（L17, L30, L44, L57, L70, L83, L96, L109, L122）を対象。項目数は不変。

---

### 施策 11: 本文内企業名の多重言及を抑制（敬称統一）

#### 3 段階方針

| effective policy | 企業名本文記載 | 敬称 |
|---|---|---|
| `none` (grounding_mode=="none") | 禁止 | 禁止 |
| `assistive` | 本文中で **2 回まで**（冒頭＋1回） | 禁止 |
| `required` / `deep` | 本文中で **1 回まで**（冒頭のみ） | 以降は敬称 |

#### 対象ファイル

| # | ファイル | 箇所 |
|---|---|---|
| 1 | `backend/app/prompts/es_templates.py` | `build_template_rewrite_prompt` の `company_mention_rule` (L1709-1714) |
| 2 | `backend/app/prompts/es_templates.py` | `build_template_fallback_rewrite_prompt` の `company_mention_rule` (L1860-1865) |
| 3 | `backend/app/prompts/reference_es.py` | 企業系 5 テンプレートの NG 行置換 |

#### 11-A: `company_mention_rule` の 3-way 分岐を多重言及対応に強化

現行 3-way 分岐を以下に差し替え（両 builder で同一）:

```python
if grounding_mode == "none":
    company_mention_rule = "この設問では企業名・企業敬称（貴社・御社・貴行等）を絶対に使わない。自分の経験と強みだけで完結させる"
elif effective_company_grounding == "assistive":
    company_mention_rule = (
        f"企業に言及するときは企業名や固有の事業・価値観で触れる。敬称（貴社・御社等）は使わない。"
        f"企業名（{company_name}）は本文全体で2回までに抑え、3回目以降は事業・価値観・姿勢の抽象表現に言い換える"
        if company_name else
        "企業に言及するときは企業名や固有の事業・価値観で触れる。敬称（貴社・御社等）は使わない"
    )
else:
    company_mention_rule = (
        f"本文で企業に言及するときは「{honorific}」を使う。企業名（{company_name}）そのものは"
        f"本文中で1回まで（冒頭の文脈設定でのみ可）。2回目以降は必ず「{honorific}」に統一する"
        if company_name else
        f"本文で企業に言及するときは企業名ではなく「{honorific}」を使う"
    )
```

`company_name` が None のケースは従来文言を保持（安全側）。

#### 11-B: reference_es.py の NG 置換

企業系 5 テンプレート（company_motivation, role_course_reason, post_join_goals, intern_reason, intern_goals）の NG 行に以下を追加または既存 NG の置換で配置:

```python
"NG: 本文中に企業名を3回以上書く（3回目以降は敬称や抽象表現に言い換える）",
```

**実装メモ:** 項目数 13 以内を維持するため、各テンプレートの NG 行のうち重複気味な 1 項目（例: company_motivation L40「企業理解・自己経験・将来像を同一文で抱え込み、焦点を失う」）と統合する。詳細はレビュー時に決定。

---

### 施策 12: 固有名詞（インターン名・コース名）の汎用語置換

#### 対象ファイル

| # | ファイル | 箇所 |
|---|---|---|
| 1 | `backend/app/prompts/es_templates.py` | `_format_proper_noun_policy` 新設 + builder 2 関数に動的注入 |
| 2 | `backend/app/prompts/reference_es.py` | intern_reason, intern_goals, role_course_reason のヒント置換 |

#### 12-A: builder 2 関数に `<proper_noun_policy>` ブロックを動的注入

```python
def _format_proper_noun_policy(
    template_type: str,
    intern_name: Optional[str],
    role_name: Optional[str],
) -> str:
    if template_type in ("intern_reason", "intern_goals") and intern_name:
        return f"""
<proper_noun_policy>
「{intern_name}」は冒頭で1回のみ使用。2回目以降は「本インターンシップ」「本プログラム」「このインターン」等の汎用語に置換する。長い英字固有名詞（例: Business Intelligence Internship）を本文中で繰り返さない。
</proper_noun_policy>"""
    if template_type == "role_course_reason" and role_name:
        return f"""
<proper_noun_policy>
「{role_name}」は冒頭で1回のみ使用。2回目以降は「本コース」「当該コース」「このコース」等の汎用語に置換する。
</proper_noun_policy>"""
    return ""
```

呼び出し箇所:
- `build_template_rewrite_prompt` の `_format_assistive_grounding_block(...)` (L1744) の前に `{_format_proper_noun_policy(template_type, intern_name, role_name)}`
- `build_template_fallback_rewrite_prompt` の同等位置 (L1891 付近) に同じ行

施策 1-A の `_format_assistive_grounding_block` と同じパターンで、両 builder に配置する。

#### 12-B: reference_es.py の置換（対象 3 テンプレートのみ）

intern_reason, intern_goals, role_course_reason の既存ヒントのうち、「企業固有表現は〜1軸に絞り」系の行（L50, L63, L115）を以下に置換:

```python
"企業固有表現・インターン名・コース名は冒頭1回のみ使用し、2回目以降は「本インターンシップ」「本プログラム」「本コース」等の汎用語に置換する",
```

項目数は維持。

---

### 施策 13: self_pr / work_values の具体性・再現性強化

#### 対象ファイル

| # | ファイル | 箇所 |
|---|---|---|
| 1 | `backend/app/prompts/es_templates.py` | `_STYLE_RULES` に self_pr/work_values 専用ルール追加 |
| 2 | `backend/app/prompts/reference_es.py` | self_pr (L82-94), work_values (L121-132) の既存ヒント置換 |
| 3 | `backend/app/prompts/es_templates.py` | `TEMPLATE_DEFS` の retry_guidance に `quantify` キー追加 |

#### 13-A: `_STYLE_RULES` に applicable_templates 付きルール追加

```python
_StyleRule(
    "強みや価値観は抽象ラベル（〜力、〜姿勢）だけで終わらせず、数値（人数・期間・件数・比率）と具体的な行動動詞を最低1組含めて再現性を示す",
    "all",
    frozenset({"self_pr", "work_values"})),
_StyleRule(
    "同趣旨を言い換えて紙面を埋めず、各文は別の情報（状況、行動、結果、再現性）を追加する",
    "all",
    frozenset({"self_pr", "work_values"})),
```

`scope="all"` のまま `applicable_templates` で self_pr/work_values に絞る。短字数帯でも適用（数値要件は字数に関係なく重要）。

#### 13-B: reference_es.py の既存ヒント置換（self_pr）

L88 の既存ヒント:
```python
OLD: "強みの根拠となる行動を動詞レベルで具体化する（「整理した」ではなく「ホワイトボードに書き出した」等）",
NEW: "強みの根拠となる行動を動詞レベルで具体化し、数値（人数・期間・改善率・件数）を最低1つ含める（例: 「30人規模の会議で論点を3つに整理した」）",
```

L92 の既存 NG:
```python
OLD: "NG: 強みのラベルだけを繰り返し、行動・成果の裏付けが増えない",
NEW: "NG: 強みのラベル（〜力、〜姿勢）を言い換えて繰り返し、数値や具体的な行動動詞が現れない",
```

項目数は維持。

#### 13-C: reference_es.py の既存ヒント置換（work_values）

L126 の既存ヒント:
```python
OLD: "複数場面で一貫して表れる姿勢として示す",
NEW: "複数場面で一貫して表れる姿勢として示し、各場面で数値（人数・期間・頻度）または具体的な行動動詞を含める",
```

L130 の既存 NG:
```python
OLD: "NG: 抽象語だけで完結し、行動例が読み手の頭に残らない",
NEW: "NG: 抽象語や再現性のない一般論だけで完結し、具体的な行動・数値・場面が示されない",
```

項目数は維持。

#### 13-D: retry_guidance に `quantify` キー追加

`TEMPLATE_DEFS["self_pr"]["retry_guidance"]` (L472-475) と `TEMPLATE_DEFS["work_values"]["retry_guidance"]` に以下を追加:

```python
"quantify": "数値（人数・期間・比率等）と具体的な行動動詞を加えて、強みや価値観を再現性のある形で示す",
```

retry focus mode mapping (`es_review_retry.py`) の対応は Phase 11 で扱う（Phase 10 では prompt 層の辞書追加のみ）。

---

### 施策 14: gakuchika のナンバリング構造化

#### 対象ファイル

| # | ファイル | 箇所 |
|---|---|---|
| 1 | `backend/app/prompts/es_templates.py` | `_STYLE_RULES` に gakuchika 専用ルール追加 |
| 2 | `backend/app/prompts/es_templates.py` | `TEMPLATE_DEFS["gakuchika"]` に playbook 追加（既存 schema 準拠） |
| 3 | `backend/app/prompts/es_templates.py` | `TEMPLATE_DEFS["gakuchika"]["retry_guidance"]` に `structure` キー追加 |
| 4 | `backend/app/prompts/reference_es.py` | gakuchika 既存 NG 置換 |

#### 14-A: `_STYLE_RULES` に applicable_templates=gakuchika のルール追加

```python
_StyleRule(
    "複数の施策や取り組みを並列で述べるときは「(1) 〜、(2) 〜」または「まず〜、次に〜」で順序を明示し、「また〜、さらに〜」の羅列で済ませない",
    "all",
    frozenset({"gakuchika"})),
```

#### 14-B: gakuchika playbook を既存 schema で追加

**重要:** `_format_required_template_playbook()` (`es_templates.py:1406-1459`) の schema は
`subject / opening / second / third / fourth / example_good_1 / example_good_2 / example_bad` の 8 キー固定。
全キーを埋める:

```python
"playbook": {
    "subject": "学生時代に力を入れた取り組み",
    "opening": "1文目で取り組みの核と自分の役割を20〜45字で言い切る",
    "second": "2文目で直面した課題の規模感（人数・期間等の数値）を1点出す",
    "third": "3文目で取った行動・工夫を示す。複数施策なら「(1) 〜、(2) 〜」または「まず〜、次に〜」で順序を明示する",
    "fourth": "4文目で成果（数値で示せる変化）と学びで締める",
    "example_good_1": "私が学生時代に力を入れたのは、進捗共有が滞る状況を改善した開発リーダーの経験だ。",
    "example_good_2": "週次の遅延が月12件に達していた状況に対し、(1) 定例MTGの議題テンプレ化、(2) ダッシュボードの導入の2施策を実施し、遅延を月3件まで削減した。",
    "example_bad": "私はチーム開発を頑張った。また情報共有も工夫した。さらに進捗管理も改善した。",
}
```

注: gakuchika は `company_usage=="none"` だが、`_format_required_template_playbook()` は `playbook` キー有無と `char_max >= 120` のみで判定するため、追加で問題なく動作する。

#### 14-C: gakuchika の retry_guidance に `structure` キー追加

`TEMPLATE_DEFS["gakuchika"]["retry_guidance"]` (L442-444) に追加:

```python
"structure": "複数の施策は (1)(2) または「まず/次に」で順序を明示し、「また/さらに」の羅列を避ける",
```

#### 14-D: reference_es.py の既存 NG 置換

gakuchika の NG 行 L79:
```python
OLD: "NG: 課題だけで文量を使い切り、行動や成果が薄くなる構成",
NEW: "NG: 複数施策を「また〜、さらに〜」で羅列し、順序性や施策ごとの役割が読み取れない構成",
```

項目数は維持。注: 「課題だけで文量を使い切り」は既存 L78 の「行動と成果に字数を使う」で近い意図がカバーされる。

---

### Phase 10 実装順序

| 順序 | 施策 | 理由 |
|---|---|---|
| 1 | `_StyleRule` 拡張（applicable_templates 追加 + `_build_contextual_rules()` 1 行追加） | Phase 10 の前処理。13/14 の前提 |
| 2 | 施策 10 (10-A → 10-A-2 → 10-B) | 全テンプレート共通の基盤ルール。reference_es.py の置換は最後 |
| 3 | 施策 11 (11-A → 11-B) | 企業系テンプレートの mention rule 3-way 再構築 |
| 4 | 施策 12 (12-A → 12-B) | intern/role 系に `<proper_noun_policy>` 動的注入 |
| 5 | 施策 13 (13-A → 13-B → 13-C → 13-D) | self_pr/work_values の具体化 |
| 6 | 施策 14 (14-A → 14-B → 14-C → 14-D) | gakuchika 専用。playbook schema 厳守 |
| 7 | テスト追加 + Live 再実行 | Phase 10 全テスト + 既存テスト + `RUN_LIVE_ES_REVIEW=1` extended |
| 8 | 目視サンプル再取得 | `scripts/dev/run_es_review_sample_http.py` を再実行、改善確認 |

---

### Phase 10 波及範囲

| 施策 | 変更ファイル | 変更箇所数 |
|---|---|---|
| 前処理 | `es_templates.py` (_StyleRule + _build_contextual_rules) | 1 ファイル, 2 箇所 |
| 施策 10 | `es_templates.py` (builder 2 関数の constraints + GLOBAL_FALLBACK), `reference_es.py` (9 テンプレート × 1 行置換) | 2 ファイル, 12 箇所 |
| 施策 11 | `es_templates.py` (company_mention_rule 2 箇所), `reference_es.py` (5 テンプレート × 1 行置換) | 2 ファイル, 7 箇所 |
| 施策 12 | `es_templates.py` (_format_proper_noun_policy + builder 2 関数), `reference_es.py` (3 テンプレート × 1 行置換) | 2 ファイル, 6 箇所 |
| 施策 13 | `es_templates.py` (_STYLE_RULES +2 rules + retry_guidance 2 箇所), `reference_es.py` (self_pr/work_values 各 2 行置換) | 2 ファイル, 8 箇所 |
| 施策 14 | `es_templates.py` (_STYLE_RULES +1 rule + gakuchika playbook + retry_guidance), `reference_es.py` (gakuchika 1 行置換) | 2 ファイル, 4 箇所 |
| テスト | `test_es_review_prompt_structure.py` + `test_reference_es_quality.py` | 2 ファイル, 27 テスト |

合計: **3 プロダクションファイル + 2 テストファイル, 39 プロダクション箇所**

---

### Phase 10 期待効果

| 指標 | 現状 (目視) | 目標 | 主な施策 |
|---|---|---|---|
| 冒頭 1 文の字数中央値 | 60-80 字 | 20-45 字 | 10-A, 10-A-2, 10-B |
| 本文中の企業名直接言及回数（required） | 2-3 回 | 1 回 | 11-A |
| 本文中の企業名直接言及回数（assistive） | 2-3 回 | 2 回以下 | 11-A |
| intern/role で固有名詞の繰り返し | 2 回以上 | 1 回（冒頭のみ） | 12-A |
| self_pr/work_values の数値含有率 | 低 | 必須化 | 13-A, 13-B, 13-C |
| gakuchika 複数施策のナンバリング | なし | (1)(2) または まず/次に | 14-A, 14-B, 14-D |
| 既存 extended pass rate | 86.2% | 悪化させない（84% 以上維持） | 全施策（副作用監視） |
| AI 臭（Phase 6 メトリクス） | 現状維持 | 悪化させない | 全施策 |

---

### Phase 10 制約事項

- validation 層のリジェクト追加は行わない（プロンプト指示で誘導）
- `_StyleRule` の拡張は `applicable_templates` フィールド追加 + `_build_contextual_rules()` 1 行のみ。scope enum の拡張はしない
- AI 臭検出 (Phase 6) の閾値・パターンは変更しない
- `build_template_draft_generation_prompt()` は Phase 10 対象外。`_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` 経由でのみ 10-A-2 が反映される
- reference_es.py の品質ヒントは**既存項目の置換のみ**。各テンプレート 13 項目以内を維持
- gakuchika playbook は既存 `_format_required_template_playbook()` schema に厳密準拠（8 キー全て埋める）
- retry focus mode mapping (`es_review_retry.py`) の `quantify` / `structure` への対応は Phase 11 で扱う

### Phase 10 で意図的にスコープ外とする項目

- draft generation prompt の `_build_contextual_rules()` 統合 → 別 Phase
- retry mapping の `quantify` / `structure` focus mode → 別 Phase
- Notion 管理プロンプト (`es_review.global_conclusion_first_rules`) の同期 → 別タスク（Notion 側更新）
- validation 層での企業名回数カウント検出 → プロンプト指示で効果確認してから判断

---

## テスト一覧

### 既存施策 (1-5) のテスト

| テスト | 対応施策 | ファイル |
|---|---|---|
| `assistive_honorific` が degraded 採用されないテスト | 2-F | `test_es_review_template_repairs.py` |
| assistive テンプレの length-fix prompt が 貴社/御社 を促さないテスト | 2-G | `test_es_review_prompt_structure.py` |
| `御社` → 正しい敬称に自動置換されるテスト | 2-H | `test_es_review_template_repairs.py` |
| `御社` → 業界別敬称 (貴行等) に自動置換されるテスト | 2-H | `test_es_review_template_repairs.py` |
| companyless での御社は自動置換せず既存 failure | 2-H | `test_es_review_template_repairs.py` |
| assistive での御社→置換→敬称リジェクト | 2-H | `test_es_review_template_repairs.py` |
| assistive 敬称が live gate で検出されるテスト (review_meta ベース) | 2-E | `test_live_es_review_gate_support.py` |
| required テンプレ + RAG 不足で effective=assistive のとき敬称禁止テスト | 2-A | `test_es_review_prompt_structure.py` |
| `char_max=180/220/221` の band 境界テスト | 4-A | `test_es_review_template_repairs.py` |
| 日本語-only 事実語でも短字数帯アンカーが生成されるテスト | 3-C | `test_es_review_template_repairs.py` |
| short 帯 fact_limit=5 で current_answer fact が増えるテスト | 3-E | `test_es_review_template_repairs.py` |
| Tier 2 到達/不到達テスト | 4-E | `test_es_review_template_repairs.py` |

### 新規施策 (6-9) のテスト

| テスト | 対応施策 | ファイル |
|---|---|---|
| `test_two_consecutive_endings_detected` — 2連続検出 | 6-A | `test_es_review_template_repairs.py` |
| `test_single_ending_no_penalty` — 連続なしでペナルティなし | 6-A | `test_es_review_template_repairs.py` |
| `test_repetitive_ending_tier_a` (更新) — ペナルティ 3.0→2.0 | 6-A | `test_es_review_template_repairs.py` |
| `test_low_ending_diversity_penalty` — 文末多様性 < 0.5 | 6-B | `test_es_review_template_repairs.py` |
| `test_ending_diversity_no_penalty_without_tier_ab` — tier_ab ガード | 6-B | `test_es_review_template_repairs.py` |
| `test_self_count_instruction_present_in_rewrite_prompt` | 7-A | `test_es_review_prompt_structure.py` |
| `test_self_count_instruction_absent_without_limits` | 7-A | `test_es_review_prompt_structure.py` |
| `test_length_fix_prompt_has_draft_count_adjust` | 7-B | `test_es_review_prompt_structure.py` |
| `test_gemini_paragraph_allocation_in_policy` | 7-C | `test_es_review_prompt_structure.py` |
| `test_contextual_rules_gakuchika_excludes_company_rules` | 8-B | `test_es_review_prompt_structure.py` |
| `test_contextual_rules_short_band_includes_short_rule` | 8-B | `test_es_review_prompt_structure.py` |
| `test_contextual_rules_company_motivation_has_connector_rule` | 8-B | `test_es_review_prompt_structure.py` |
| `test_contextual_rules_basic_medium_excludes_short_rule` | 8-B | `test_es_review_prompt_structure.py` |
| `test_fallback_rules_unchanged` | 8-B | `test_es_review_prompt_structure.py` |
| `test_prose_style_present_for_long_answer` | 9-D | `test_es_review_prompt_structure.py` |
| `test_prose_style_absent_for_short_answer` | 9-D | `test_es_review_prompt_structure.py` |
| `test_output_contract_no_linebreak_primary` | 9-B | `test_es_review_prompt_structure.py` |
| `test_output_contract_no_linebreak_fallback` | 9-B | `test_es_review_prompt_structure.py` |
| `test_output_contract_no_linebreak_length_fix` | 9-B | `test_es_review_prompt_structure.py` |
| `test_constraints_ending_variety_includes_shita` | 9-C | `test_es_review_prompt_structure.py` |
| `test_global_rules_include_flow_guidance` | 9-A | `test_es_review_prompt_structure.py` |

### Phase 10 施策 (10-14) のテスト

#### builder 関連テスト (`backend/tests/es_review/test_es_review_prompt_structure.py`)

| テスト | 対応施策 | 内容 |
|---|---|---|
| `test_style_rule_applicable_templates_field` | Phase 10 前処理 | `_StyleRule` に `applicable_templates` フィールドが存在する |
| `test_build_contextual_rules_filters_by_template` | Phase 10 前処理 | `applicable_templates` がマッチしない template では該当ルールが出ない |
| `test_constraints_include_opening_char_range_rewrite` | 10-A | rewrite prompt の `<constraints>` に「20〜45字」が含まれる |
| `test_constraints_include_opening_char_range_fallback` | 10-A | fallback prompt も同上 |
| `test_global_rules_fallback_has_opening_char_range` | 10-A-2 | `_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` 1 番目に「20〜45字」 |
| `test_company_mention_rule_required_limits_company_name_once` | 11-A | required/deep 分岐の文言に「1回まで」が含まれる |
| `test_company_mention_rule_assistive_limits_company_name_twice` | 11-A | assistive 分岐の文言に「2回まで」が含まれる |
| `test_company_mention_rule_none_prohibits_all` | 11-A | none 分岐は既存通り「絶対に使わない」 |
| `test_proper_noun_policy_for_intern_reason` | 12-A | intern_reason + intern_name 指定で `<proper_noun_policy>` ブロックあり |
| `test_proper_noun_policy_for_intern_goals` | 12-A | intern_goals + intern_name 指定で同上 |
| `test_proper_noun_policy_for_role_course_reason` | 12-A | role_course_reason + role_name 指定で `<proper_noun_policy>` ブロックあり |
| `test_proper_noun_policy_absent_for_gakuchika` | 12-A | gakuchika（intern_name/role_name なし）で `<proper_noun_policy>` が出ない |
| `test_style_rule_quantify_applies_to_self_pr` | 13-A | self_pr で `_build_contextual_rules()` に数値化ルールが含まれる |
| `test_style_rule_quantify_applies_to_work_values` | 13-A | work_values で同上 |
| `test_style_rule_quantify_absent_for_company_motivation` | 13-A | company_motivation で数値化ルールが含まれない |
| `test_style_rule_numbering_applies_to_gakuchika_only` | 14-A | gakuchika のみナンバリングルールが含まれる |
| `test_gakuchika_playbook_keys_match_renderer_schema` | 14-B | gakuchika playbook に `subject/opening/second/third/fourth/example_good_1/example_good_2/example_bad` 全キーあり |
| `test_gakuchika_playbook_renders_in_prompt` | 14-B | char_max=400 で gakuchika の `【requiredテンプレの型】` 相当が出力に含まれる |
| `test_self_pr_retry_guidance_has_quantify_key` | 13-D | self_pr/work_values の `retry_guidance` に `quantify` キーあり |
| `test_gakuchika_retry_guidance_has_structure_key` | 14-C | gakuchika の `retry_guidance` に `structure` キーあり |

#### reference_es.py 関連テスト (`backend/tests/es_review/test_reference_es_quality.py`)

| テスト | 対応施策 | 内容 |
|---|---|---|
| `test_quality_hints_opening_char_range_across_templates` | 10-B | 9 テンプレート全てで 1 番目のヒントに「20〜45字」 |
| `test_quality_hints_company_motivation_has_multi_mention_ng` | 11-B | company_motivation NG に「企業名を3回以上書く」 |
| `test_quality_hints_intern_reason_has_proper_noun_rule` | 12-B | intern_reason ヒントに「本インターンシップ」「本プログラム」 |
| `test_quality_hints_self_pr_has_quantify` | 13-B | self_pr ヒントに「数値」 |
| `test_quality_hints_work_values_has_quantify` | 13-C | work_values ヒントに「数値」 |
| `test_quality_hints_gakuchika_has_numbering_ng` | 14-D | gakuchika NG に「(1)(2)」または「また〜、さらに〜」羅列禁止 |
| `test_quality_hints_count_within_13_for_all_templates` | 全体 | 全テンプレートのヒント項目数が 13 以内 |

---

## 実装順序

| 順序 | 施策 | 理由 |
|---|---|---|
| 1 | **施策 2** (修正2-H → 2-A → 2-B → 2-C → 2-D → 2-E → 2-E-fix → 2-F → 2-G) | 全レイヤーの表記規約を先に確定。effective policy に統一した 3-way 分岐を全経路に適用。修正 2-H の自動置換を validation に組み込む |
| 2 | **施策 1** (1-A → 1-B) | 施策 2 の規約に基づいて企業固有語保持指示を注入 |
| 3 | **施策 8 + 9** (8-A → 8-B → 8-C → 9-A → 9-B → 9-C → 9-D → 9-E → 8-E + 9-F) | `<core_style>` の構造変更と散文品質改善を同一パスで実施。同じ `es_templates.py` の builder 関数・`_GLOBAL_CONCLUSION_FIRST_RULES`・`<core_style>`/`<constraints>` を変更するため、分離実装すると衝突リスクが高い。テストは最後にまとめて実行 |
| 4 | **施策 7** (7-A → 7-B → 7-C → 7-D) | `<constraints>` と `<length_policy>` の変更。施策 8+9 の後で安全 |
| 5 | **施策 6** (6-A → 6-B → 6-C) | validation 層のみの変更。prompt 変更と独立 |
| 6 | **施策 3** (3-A → 3-B → 3-C → 3-D → 3-E) | 選定 + builder 変更。施策 7/8/9 の後で安全 |
| 7 | **施策 4** (4-A → 4-B → 4-C → 4-D → 4-E) | **施策 6 の文末反復ペナルティ変更 (3.0→2.0) がスコア分布に影響するため、施策 6 の後で閾値を最終決定する** |
| 8 | **施策 5** (5-B → 5-C) | 全施策の効果検証 |
| 9 | **ドキュメント更新** | ES_REVIEW.md、品質監査レポートの実装状況反映 |

### Phase 10 (v9 目視レビュー反映)

| 順序 | 施策 | 理由 |
|---|---|---|
| 10 | `_StyleRule` 拡張（Phase 10 前処理） | `applicable_templates` 追加 + `_build_contextual_rules()` の 1 行変更。施策 13/14 の前提 |
| 11 | 施策 10 → 11 → 12 → 13 → 14 | プロンプト層のみ。衝突リスク低 |
| 12 | Phase 10 テスト追加 + Live 再実行 | 既存検証との整合確認（pass rate 84% 以上を維持） |
| 13 | サンプル再取得 + 目視確認 | `scripts/dev/run_es_review_sample_http.py` で 9 設問タイプを再取得 |

---

## 波及範囲サマリー

| 施策 | 変更ファイル | 変更箇所数 |
|---|---|---|
| 施策 2 | `es_templates.py`, `es_review_validation.py`, `es_review_retry.py`, `es_review_grounding.py`, `es_review.py`, `es_review_live_gate.py`, テスト3ファイル | 9 ファイル |
| 施策 1 | `es_templates.py` (builder 2関数 + TEMPLATE_DEFS) | 1 ファイル |
| 施策 8 | `es_templates.py` (データクラス + 関数 + builder 2関数), テスト | 2 ファイル |
| 施策 9 | `es_templates.py` (グローバルルール + output_contract x3 + constraints x3 + 新関数 + builder 3関数), `reference_es.py` (NG行 x9 + 流れヒント x9 + ハードコード x1), テスト | 3 ファイル, 28 箇所 |
| 施策 7 | `es_templates.py` (ヘルパー + builder 3関数 + length_policy), テスト | 2 ファイル |
| 施策 6 | `es_review_validation.py`, `es_review_retry.py`, テスト | 3 ファイル |
| 施策 3 | `es_review_grounding.py`, `es_review.py`, `es_templates.py`, `es_review_retry.py` | 4 ファイル |
| 施策 4 | `es_review_validation.py`, テスト | 2 ファイル |
| 施策 5 | `es_review_live_gate.py` | 1 ファイル |
| Phase 10 前処理 | `es_templates.py` (`_StyleRule` + `_build_contextual_rules`) | 1 ファイル, 2 箇所 |
| 施策 10 | `es_templates.py` (builder 2 関数の constraints + GLOBAL_FALLBACK), `reference_es.py` (9 テンプレート × 1 行置換) | 2 ファイル, 12 箇所 |
| 施策 11 | `es_templates.py` (`company_mention_rule` 2 箇所), `reference_es.py` (5 テンプレート × 1 行置換) | 2 ファイル, 7 箇所 |
| 施策 12 | `es_templates.py` (`_format_proper_noun_policy` + builder 2 関数), `reference_es.py` (3 テンプレート × 1 行置換) | 2 ファイル, 6 箇所 |
| 施策 13 | `es_templates.py` (`_STYLE_RULES` +2 rules + `retry_guidance` 2 箇所), `reference_es.py` (self_pr/work_values 各 2 行置換) | 2 ファイル, 8 箇所 |
| 施策 14 | `es_templates.py` (`_STYLE_RULES` +1 rule + gakuchika playbook + `retry_guidance`), `reference_es.py` (gakuchika 1 行置換) | 2 ファイル, 4 箇所 |
| Phase 10 テスト | `test_es_review_prompt_structure.py` + `test_reference_es_quality.py` | 2 ファイル, 27 テスト |

**Phase 10 合計:** 3 プロダクションファイル + 2 テストファイル, 39 プロダクション箇所

---

## 制約事項

- 品質ゲート（文字数制限、バリデーション等）の削除・緩和は行わない
- 処理を無駄に複雑化しない — 既存の構造に沿った最小限の変更
- 変更後は既存のユニットテストが全て通ることを確認
- 関連ドキュメントを最新の実装に合わせて更新
- short 判定は既存 `SHORT_ANSWER_CHAR_MAX = 220` に統一（150 は使わない）
- **敬称可否は `effective_company_grounding` (実効ポリシー) のみで判定する。`template_def["company_usage"]` は使わない。**
- live gate の assistive 判定は `review_meta.company_grounding_policy` で行う
- **`御社` を `COMPANY_HONORIFIC_TOKENS` に追加しない。`COMPANY_REFERENCE_TOKENS` に留め、validation 層で自動置換する。**
- **`AI_SIGNATURE_PHRASES` の拡張は行わない（誤検出リスク）。**
- **`_rewrite_max_tokens()` の倍率は変更しない。プロンプト側のセルフカウント指示で対応する。**
- **Burstiness（文長分散）メトリクスは採用しない（短文 ES では統計的に不可能）。**

### Phase 10 固有制約

- **`_StyleRule` の拡張は `applicable_templates` フィールド追加のみ。** scope enum は既存 4 値（`all/company/short_only/mid_long`）を維持し、新 scope は追加しない
- **`build_template_draft_generation_prompt()` は Phase 10 対象外。** `_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` 経由でのみ 10-A-2 が反映される。draft への `_build_contextual_rules()` 統合は別 Phase
- **reference_es.py の品質ヒントは「既存項目の置換」のみ。** 各テンプレート 13 項目以内を維持するため、新規追加はしない
- **gakuchika playbook は既存 `_format_required_template_playbook()` schema に厳密準拠。** 8 キー（`subject/opening/second/third/fourth/example_good_1/example_good_2/example_bad`）全てを埋める
- **validation 層での企業名回数カウント検出は追加しない。** プロンプト指示の効果を見てから判断
- **retry focus mode mapping (`es_review_retry.py`) の `quantify` / `structure` への対応は Phase 11 で扱う。** Phase 10 では prompt 層の辞書追加のみ
- **AI 臭検出 (Phase 6) の閾値・パターンは変更しない。**

---

## 期待される改善効果

| 指標 | Dataset C (現状) | 目標 | 主な施策 |
|---|---|---|---|
| `company_tokens:missing` (haiku) | 3件 | 1件以下 | 施策 1+2 |
| `user_fact_tokens:missing` (haiku) | 2件 | 1件以下 | 施策 3 |
| `style:not_dearu` (haiku) | 1件 | 0件 | 施策 2 |
| AI臭 Tier 2 retry | 未稼働 | 稼働 (保守的閾値) | 施策 4+6 |
| 御社→貴社 漏出 | 未検出 | 自動修正 | 施策 2-H (修正版) |
| 文末反復検出感度 | 3連続のみ | 2連続 | 施策 6-A |
| 文末多様性監視 | なし | Tier C 稼働 | 施策 6-B |
| 文字数制御（初回適合率） | ~70-80% | ~85-90% | 施策 7 |
| プロンプトトークン効率 | 12ルール一律 | 4-12ルール条件付き | 施策 8 |
| 改行混入（Web ES 崩れ） | 発生あり | 0件 | 施策 9-A/9-B |
| 文末単調（〜した連続） | 高頻度 | 2文連続禁止 | 施策 9-C/9-D |
| 散文品質（流れ・接続） | 箇条書き的 | 自然な散文 | 施策 9-A/9-D/9-E |
| AI臭フレーズ誤検出 | 低 | 変更なし | 設計判断: 拡張なし |
| 冒頭 1 文の字数中央値 (Phase 10) | 60-80 字 | 20-45 字 | 10-A, 10-A-2, 10-B |
| 本文中の企業名直接言及回数（required） | 2-3 回 | 1 回 | 11-A |
| 本文中の企業名直接言及回数（assistive） | 2-3 回 | 2 回以下 | 11-A |
| intern/role で固有名詞の繰り返し | 2 回以上 | 1 回（冒頭のみ） | 12-A |
| self_pr/work_values の数値含有率 | 低 | 必須化 | 13-A, 13-B, 13-C |
| gakuchika 複数施策のナンバリング | なし | (1)(2) または まず/次に | 14-A, 14-B, 14-D |
| 既存 extended pass rate (Phase 10 副作用監視) | 86.2% | 84% 以上維持 | 全 Phase 10 施策 |

---

*本計画は品質監査レポート v2 (2026-04-12) のロードマップ #6-#8 (即時) および総合品質評価レポート (2026-04-14) の指摘事項を統合し、就活 ES 文章品質の外部ソース調査（石渡嶺司、波多野完治、リクナビ、キミスカ等）・prompt-engineer の批判的レビュー・5回のコードレビューと競合分析・論文調査を経て波及範囲を精査したものである。v9 で Phase 10 として 2026-04-16 目視レビュー（`scripts/dev/run_es_review_sample_http.py`）基づく散文品質改善を追加した。*
