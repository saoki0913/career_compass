# ES添削・下書き生成 機能品質レビュー

> レビュー日: 2026-04-07
> 対象: ES添削（リライト）機能 + ES下書き生成機能
> ベンチマーク: `private/reference_es/es_references.json`（80件超の参考ES）

---

## 1. レビュー目的と対象範囲

### 目的
参考ESを品質ベンチマークとして、ES添削機能と下書き生成機能が「参考ESレベルの品質」を出力できるかを評価し、ギャップと改善提案を整理する。

### 対象機能

| 機能 | エントリポイント | バックエンド |
|------|----------------|-------------|
| ES添削（リライト） | `src/app/api/documents/[id]/review/stream/route.ts` | `backend/app/routers/es_review.py` |
| ガクチカES下書き生成 | `src/app/api/gakuchika/[id]/generate-es-draft/route.ts` | `backend/app/routers/gakuchika.py` |
| 志望動機ES下書き生成 | `src/app/api/motivation/[companyId]/generate-draft/route.ts` | `backend/app/routers/motivation.py` |
| 志望動機ES直接生成 | `src/app/api/motivation/[companyId]/generate-draft-direct/route.ts` | `backend/app/routers/motivation.py` |

### 評価制約
- 参考ESの内容（本文テキスト）が出力に直接反映されることは**禁止**
- 統計プロファイルや構造パターンの抽出は許容

---

## 2. 参考ESコーパス分析

### 2.1 設問タイプ別分布

| 設問タイプ (`question_type`) | 件数 | 字数範囲 | 主な企業 |
|------------------------------|------|---------|---------|
| `gakuchika` | ~40件 | 20-600字 | Cisco, IBM, JAL, KIRIN, P&G, Panasonic, SanSan, 三井不動産, 三菱UFJ, 住友不動産 等 |
| `intern_reason` | ~13件 | 200-500字 | Cisco, IBM, NS, Salesforce, サイバーエージェント, サントリー 等 |
| `intern_goals` | ~11件 | 96-2025字 | Cisco, JAL, NEC, PFN, Panasonic, リクルート 等 |
| `company_motivation` | ~10件 | 300-400字 | KPMG, Salesforce, IBM, 三菱地所, 三菱UFJ 等 |
| `role_course_reason` | ~6件 | 200-600字 | NEC, Panasonic, ゴールドマン・サックス, 三菱UFJ 等 |
| `post_join_goals` | ~8件 | 200-400字 | キーエンス, 三井住友銀行, 三菱UFJ, 三菱総合研究所 等 |
| `work_values` | ~5件 | 200-300字 | 三井不動産, 丸紅, 野村不動産 等 |
| `self_pr` | ~4件 | notes系のみ | サイバーエージェント, レバレジーズ, PKSHA 等 |
| `basic` | 0件 | — | — |

### 2.2 エピソードパターン

参考ESのガクチカは**2本のコアエピソード**を字数・企業に合わせて変形している:

**エピソードA: AIチャットアプリ開発リーダー**
- キー要素: 長期インターン、4人チーム、全員Web開発未経験、エラー対応に作業時間の3割、エラー対応手順の標準化 + 基礎技術力の底上げ、開発速度2倍、期限内リリース
- 使用企業: 20社以上（最多）
- 字数適応: 50字（三菱UFJ銀行）~ 600字（エムスリーDS / 三菱総合研究所）まで幅広い

**エピソードB: サークル代表の新入生勧誘改革**
- キー要素: 100人規模のサークル代表、環境変化でビラ受け取り率20%未満、ポケットティッシュ型チラシ + 個別交流、70%のメンバーが自発的参加、受け取り率80%以上、入会者30名
- 使用企業: Cisco, IBM, ヒューリック, 東急不動産, 野村不動産 等
- 字数適応: 200字 ~ 400字

### 2.3 品質特性

参考ES全体に共通する品質パターン:

| 品質指標 | 参考ESの傾向 | 備考 |
|---------|-------------|------|
| **結論ファースト** | 高（推定80%以上） | 1文目で設問への答えを置く |
| **STAR構造** | ガクチカで一貫 | 状況→課題→行動→結果の順 |
| **具体的数値** | 90%以上で使用 | 「3割」「2倍」「30名」「80%」等 |
| **だ・である調** | 統一 | 敬体（です・ます）は使用せず |
| **企業固有表現の使用** | 志望動機・インターン系で適切 | 過度な企業名連呼は少ない |
| **字数適応力** | 極めて高 | 同一エピソードを50字～600字で自在に伸縮 |

### 2.4 notes系参考データ

`id` が `notes_` で始まるエントリは面接対策ノートからの要約であり、ES本文ではない。例:
- "長期インターンでの開発リーダー経験を主軸に、リーダーシップや問題解決の再現性を示す。"
- "なぜ IBM で IT スペシャリストなのか、入社後にどのような技術・役割を伸ばしたいか..."

これらは実際のES本文と混在しており、統計プロファイルに影響を与えている（平均文字数の歪み等）。

---

## 3. ES添削機能の現状評価

### 3.1 アーキテクチャ概要

```
ユーザーのES → Next.js API (認証・クレジット予約・レート制限)
            → FastAPI /api/es/review/stream
            → テンプレート判定 → 企業RAG取得 → プロンプト構築
            → LLM呼び出し (最大3回リトライ + 1回長さ修正 + 品質劣化パス)
            → バリデーション → SSEストリーミング応答
```

- **テンプレート**: 9種類 (`basic`, `gakuchika`, `self_pr`, `work_values`, `company_motivation`, `role_course_reason`, `intern_reason`, `intern_goals`, `post_join_goals`)
- **バリデーション段階**: strict → focused_retry_1 → focused_retry_2 → length_fix → degraded → 422
- **企業RAGグラウンディング**: `none` / `light` / `standard` / `deep` の4段階
- **LLMモデル**: Claude / GPT-5 / GPT-5-mini / Gemini（モデル別の文字数制御プロファイル）

### 3.2 強み

#### a. 参考ESの統計プロファイリング（`reference_es.py`）

既に参考ESから以下の統計情報を抽出してプロンプトに注入している:
- 平均文字数 / 平均文数 / 文字数ばらつき / 文数ばらつき
- 数字含有率 / 具体性マーカー平均 / 結論先行率
- テンプレート別の品質ヒント（10項目×9テンプレート）
- テンプレート別の骨子（構成比率つき）
- 条件付きヒント（ユーザーの入力と参考プロファイルを比較）

**コンテンツ漏洩防止**も明示的に組み込み済み:
```
- 参考ESの本文・語句・特徴的な言い回し・細かな構成順を再利用しない
- 骨子は論点の順序の参考にだけ使い、型文や言い回しをコピーしない
```

#### b. テンプレート定義の充実度

各テンプレートに以下が定義されている:
- `purpose`: 設問の意図
- `required_elements`: 必須要素（例: ガクチカなら「取り組みの核」「課題や目的」「工夫した行動」「成果や学び」）
- `anti_patterns`: 避けるべきパターン
- `recommended_structure`: 字数帯別の推奨構成
- `evaluation_checks`: 機械的バリデーションルール（冒頭パターン、アンカー、フォーカスパターン）
- `retry_guidance`: リトライ時の改善指示

#### c. 文字数制御の精密さ

`resolve_length_control_profile()` がモデル別・字数帯別・段階別に文字数ギャップを制御:
- Claude / GPT-5 / GPT-5-mini / Gemini の4モデルファミリー
- short (≤220字) / medium (≤320字) / long (>320字) の3バンド
- default / under_min_recovery / tight_length の3ステージ
- 元文章の長さとの比率も考慮

#### d. 企業RAGとエビデンスカード

企業固有テンプレート（志望動機、インターン志望理由等）では:
- `get_enhanced_context_for_review_with_sources()` で企業RAGからコンテキスト取得
- エビデンスカードとして構造化（theme / axis / summary / claim / excerpt）
- テンプレート別のソースファミリー優先順位（`TEMPLATE_SOURCE_FAMILY_PRIORITIES`）
- エビデンスカバレッジレベル（`weak` / `partial` / `sufficient`）に応じた使い方指示

#### e. ストリーミングUX

- SSEによるリアルタイムストリーミング
- プログレス表示（ステップID、進捗%、ラベル）
- キーワードソースの段階的表示
- クレジット成功時消費（失敗時はキャンセル）

### 3.3 ギャップ

#### GAP-R1: gakuchika / self_pr / work_values テンプレートに playbook がない

`es_templates.py` の `TEMPLATE_DEFS` で、以下の6テンプレートには `playbook` キーがある:
- `company_motivation` (L225)
- `intern_reason` (L283)
- `intern_goals` (L328)
- `post_join_goals` (L432)
- `role_course_reason` (L476)
- `basic` は playbook なし（汎用のため妥当）

**しかし、以下の3テンプレートには playbook がない:**
- `gakuchika` (L339) — **最も利用頻度が高い**テンプレートにplaybook がない
- `self_pr` (L368)
- `work_values` (L487)

playbook は `_format_required_template_playbook()` で参照されるため、これらのテンプレートではプロンプトに構造化ガイド（opening / second / third / fourth / example_good / example_bad）が出力されない。

**影響度: P1（高頻度テンプレートの品質上限に直結）**

#### GAP-R2: notes系参考データが統計プロファイルを汚染

`load_reference_examples()` は `question_type` でのみフィルタリングし、`capture_kind` や `id` プレフィックスでの除外を行わない。結果:
- 面接メモの要約文（50-100字程度）がES本文（200-600字）と同列で平均計算される
- 平均文字数・文数が実際のES品質水準より低く出る
- 特に `self_pr` は notes系のみで構成されており、統計プロファイルの信頼性が低い

**影響度: P1（プロファイルの正確性に影響）**

#### GAP-R3: 構造パターン抽出が統計値のみ

`reference_es.py` は文字数・文数・具体性マーカー・結論先行率を抽出するが:
- 冒頭の分類（役割＋状況提示 / 結論宣言 / 価値観宣言）はしない
- 構成タイプの分類（STAR / 番号付き理由 / 単一スレッド）はしない
- 締め方の分類（成果 / 学び / 貢献 / 成長）はしない
- セクション別の字数配分比率は算出しない

**影響度: P2（品質上限を上げるための追加情報）**

#### GAP-R4: 条件付きヒントの比較軸が限定的

`_build_conditional_quality_hints()` は以下3軸のみ比較:
1. 文字数の差（`char_gap`）
2. 文数の差（`sentence_count`）
3. 具体性マーカーの差（`concrete_markers`）

未比較:
- 結論ファーストかどうか（参考群が80%以上結論ファーストなのに入力が非結論ファースト → ヒント出すべき）
- 数字使用有無（参考群が90%以上数字含有なのに入力に数字なし → ヒント出すべき）

**影響度: P2（既存フレームワークへの小さな拡張）**

### 3.4 テンプレート別品質評価

| テンプレート | 定義充実度 | playbook | RAGプロファイル | 参考ES件数 | 総合評価 |
|-------------|-----------|----------|---------------|-----------|---------|
| `company_motivation` | 充実 | あり | `es_company_focus` | ~10件 | 高品質 |
| `intern_reason` | 充実 | あり | `es_company_focus` | ~13件 | 高品質 |
| `intern_goals` | 充実 | あり | `es_company_focus` | ~11件 | 高品質 |
| `post_join_goals` | 充実 | あり | `es_company_future` | ~8件 | 高品質 |
| `role_course_reason` | 充実 | あり | `es_role_fit` | ~6件 | 高品質 |
| **`gakuchika`** | **充実** | **なし** | `es_self_focus` | **~40件** | **playbook欠如が惜しい** |
| **`self_pr`** | **充実** | **なし** | `es_self_focus` | **~4件(notes系)** | **playbook欠如 + 参考データ不足** |
| **`work_values`** | **充実** | **なし** | `es_self_focus` | **~5件** | **playbook欠如** |
| `basic` | 基本的 | なし | `es_light` | 0件 | 汎用（妥当） |

---

## 4. ES下書き生成機能の現状評価

### 4.1 ガクチカES下書き生成

#### フロー
```
ガクチカ深掘り会話 → 会話が draft_ready 状態
→ POST /api/gakuchika/{id}/generate-es-draft
→ Next.js: 認証・クレジット予約（6クレジット）
→ FastAPI: build_template_draft_generation_prompt("gakuchika", ...)
→ Claude (max_tokens=1400, temperature=0.3)
→ JSON出力 {"draft": "...", "followup_suggestion": "..."}
→ normalize_es_draft_single_paragraph() で単一段落化
→ documents テーブルにES文書として保存
```

#### 強み
- 会話内容のみを根拠とする明示指示（事実の捏造禁止）
- だ・である調の統一
- 結論ファースト構造の指示
- 字数制約の厳密な制御（char_min / char_max）
- 診断タグの出力（strength_tags / issue_tags / deepdive_recommendation_tags / credibility_risk_tags）

### 4.2 志望動機ES下書き生成

#### フロー（会話ベース）
```
志望動機会話 → POST /api/motivation/{companyId}/generate-draft
→ Next.js: 認証・クレジット予約
→ 企業コンテキスト取得（RAG要約）
→ FastAPI: build_template_draft_generation_prompt("company_motivation", ...)
→ Claude (max_tokens=1800, temperature=0.3)
→ JSON出力 {"draft": "...", "key_points": [...], "company_keywords": [...]}
→ フォローアップ質問生成 → 会話状態更新
```

#### フロー（直接生成 / プロファイルベース）
```
POST /api/motivation/{companyId}/generate-draft-direct
→ プロファイル + ガクチカコンテキストを材料として使用
→ 会話履歴なしで志望動機を直接生成
→ 全6スロットを confirmed 状態で初期化
```

#### 強み
- 業界別の敬称解決（`get_company_honorific()`: 銀行→貴行、信用金庫→貴庫 等）
- 会話ベースと直接生成の2パスをサポート
- key_points / company_keywords の構造化出力
- 最大5回リトライ + 指数バックオフ

### 4.3 下書き生成の最大ギャップ

#### GAP-D1: 参考ES品質ヒントが下書き生成に一切使われていない（P0）

`build_template_draft_generation_prompt()` （`es_templates.py` L1317）は `reference_quality_block` パラメータを**受け取らない**。

一方で、添削用の `build_template_rewrite_prompt()` は `reference_quality_block` を受け取り、`_format_reference_quality_guidance()` を通じてプロンプトに統合している。

**結果**: 添削では参考ESの統計プロファイル（平均文字数、文数目安、具体性マーカー、結論先行率、骨子）がプロンプトに含まれるが、下書き生成では一切含まれない。

**これが最大の品質ギャップ**。下書き生成が参考ESレベルの品質を出しにくい根本原因。

---

## 5. 品質ギャップ一覧（優先度付き）

| ID | 優先度 | カテゴリ | ギャップ | 影響範囲 |
|----|-------|---------|---------|---------|
| **GAP-D1** | **P0** | 下書き生成 | `build_template_draft_generation_prompt()` に参考ES品質ヒント統合なし | ガクチカ・志望動機の全下書き生成 |
| GAP-R1 | P1 | 添削 | `gakuchika` / `self_pr` / `work_values` テンプレートに playbook なし | 3テンプレートの添削品質上限 |
| GAP-R2 | P1 | 参考ES | notes系データ (`capture_kind: "summary"`) が統計プロファイルを汚染 | 全テンプレートの参考プロファイル精度 |
| GAP-R3 | P2 | 参考ES | 構造パターン抽出なし（冒頭型・構成型・締め方・配分比率） | 添削・下書き生成の構造的ガイダンス |
| GAP-R4 | P2 | 添削 | 条件付きヒントの比較軸が限定的（結論ファースト比較・数字使用比較なし） | 添削時のユーザー入力に対するフィードバック精度 |
| GAP-E1 | P3 | 差別化 | エピソード追跡なし（同一エピソードの企業別使い分け認識なし） | エピソード差別化の支援 |

---

## 6. 改善提案ロードマップ

### 6.1 P0: 下書き生成への参考ES品質統合 (GAP-D1)

**変更ファイル:**
- `backend/app/prompts/es_templates.py` — `build_template_draft_generation_prompt()` に `reference_quality_block: str = ""` パラメータ追加
- `backend/app/routers/gakuchika.py` — ドラフト生成前に `build_reference_quality_block("gakuchika", char_max=...)` 呼び出し
- `backend/app/routers/motivation.py` — 同上で `build_reference_quality_block("company_motivation", char_max=..., company_name=...)` 呼び出し

**方針:**
1. `build_template_draft_generation_prompt()` のシステムプロンプトに `_format_reference_quality_guidance(reference_quality_block)` を挿入（位置: 企業ガイダンスとplaybook の間）
2. 下書き生成では `current_answer=None` で呼ぶため、条件付きヒントは生成されず、品質プロファイル + 静的ヒント + 骨子のみがプロンプトに含まれる
3. 既存の漏洩防止指示（「参考ESの本文を再利用しない」）がそのまま適用される

### 6.2 P1: playbook 追加 (GAP-R1)

**変更ファイル:** `backend/app/prompts/es_templates.py`

3テンプレートに playbook を追加:

**gakuchika:**
- opening: "1文目で取り組みの全体像と自分の役割を示す"
- second: "2文目で直面した課題を具体的に示す"
- third: "3文目で自分が取った行動と工夫を示す"
- fourth: "4文目で成果を数字や変化で示す"
- 良い例と悪い例を汎用的に記載（参考ESの内容はコピーしない）

**self_pr:**
- opening: "1文目で強みの核を一言で示す"
- second: "2文目で強みを裏付ける経験や行動を示す"
- third: "3文目でその強みの仕事での活かし方を示す"

**work_values:**
- opening: "1文目で大切にしている価値観を示す"
- second: "2文目で価値観が表れた経験や行動を示す"
- third: "3文目で仕事でどう生きるかを示す"

### 6.3 P1: notes系参考データのフィルタリング (GAP-R2)

**変更ファイル:** `backend/app/prompts/reference_es.py`

`load_reference_examples()` に `exclude_notes: bool = True` パラメータを追加:
- `True` のとき: `id.startswith("notes_")` または `capture_kind in ("summary", "full_excerpt")` のエントリを除外
- 統計プロファイル計算（`build_reference_quality_profile()`）では `exclude_notes=True` で呼ぶ
- 将来のエピソード検出では `exclude_notes=False` で呼ぶ

### 6.4 P2: 構造パターン抽出 (GAP-R3)

**変更ファイル:** `backend/app/prompts/reference_es.py`

`_extract_structural_patterns(texts: list[str], question_type: str)` 関数を追加:
- 冒頭分類: `role_context` / `conclusion_statement` / `value_declaration` / `goal_declaration`
- 構成タイプ: `sequential_star` / `numbered_reasons` / `single_thread`
- 締め方: `contribution` / `growth` / `learning` / `result`
- 配分比率: 各セクションの字数比率

`build_reference_quality_block()` の出力に構造パターン情報を追加:
```
【参考ESから抽出した構成パターン】
- 冒頭パターン: 役割＋状況提示が多い（75%）
- 構成タイプ: STAR順が主流
- 数値使用率: 92%
- 構成バランス: 行動＋成果に字数を多く使う傾向
- 構成パターンは参考にとどめ、丸コピしない
```

### 6.5 P2: 条件付きヒント強化 (GAP-R4)

**変更ファイル:** `backend/app/prompts/reference_es.py`

`_build_conditional_quality_hints()` に2軸を追加:
1. 結論ファースト比較: `not _looks_conclusion_first(current_answer) and conclusion_first_rate > 70` → ヒント
2. 数字使用比較: `not _contains_digit(current_answer) and digit_rate > 80` → ヒント

### 6.6 P3: エピソード差別化支援 (GAP-E1)

**新規ファイル:** `backend/app/prompts/reference_es_episodes.py`

- キーワードベースでエピソードA（AIチャットアプリ）/ B（サークル代表）を自動検出
- 使用企業マッピング構築
- 同一エピソードの別企業使用時に差別化ヒントを生成
- 添削・下書き生成プロンプトへの統合

---

## 7. 推奨実装順序

| 順序 | ギャップID | 内容 | リスク |
|------|-----------|------|--------|
| 1 | GAP-R2 | notes系データフィルタリング | 低 |
| 2 | GAP-D1 | 下書き生成への参考ES品質統合 | 低（パラメータ追加のみ） |
| 3 | GAP-R1 | gakuchika/self_pr/work_values playbook追加 | 低 |
| 4 | GAP-R4 | 条件付きヒント強化 | 低（既存フレームワーク拡張） |
| 5 | GAP-R3 | 構造パターン抽出 | 中（新規分析ロジック） |
| 6 | GAP-E1 | エピソード差別化支援 | 低（独立モジュール） |

---

## 8. テスト方針

### コンテンツ漏洩テスト（最重要）
- 参考ES全件に対し、`build_reference_quality_block()` の出力に10文字以上の部分文字列が一致しないことを検証
- 構造パターン出力にも同様のチェック
- 既存テスト: `backend/tests/es_review/test_reference_es_quality.py` を拡張

### 機能テスト
- 下書き生成プロンプトに `reference_quality_block` が含まれることを検証
- notes系データが統計プロファイルから除外されることを検証
- 新規 playbook がプロンプト出力に含まれることを検証

### 互換性テスト
- 全パラメータにデフォルト値を設定し、既存の呼び出し元を壊さない
- `npm run test` / `pytest` の既存スイート全パス確認
