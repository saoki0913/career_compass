# 企業情報検索機能 - 検索ロジック仕様書

## 📋 目次
1. [全体アーキテクチャ](#全体アーキテクチャ)
2. [共通ルール](#共通ルール)
3. [採用ページ検索 (`/search-pages`)](#採用ページ検索)
4. [コーポレートページ検索 (`/search-corporate-pages`)](#コーポレートページ検索)
5. [デバッグログ](#デバッグログ)
6. [既知の問題点](#既知の問題点)

---

## 全体アーキテクチャ

### エンドポイント別処理フロー

```
リクエスト受信
    │
    ├─ /company-info/search-pages (採用ページ)
    │   │
    │   └─ Hybrid検索を優先
    │       │
    │       ├─ 公式 / trusted候補あり → そのまま返却
    │       └─ 候補不足 → Legacy検索を追加し共通ソート
    │
    └─ /company-info/search-corporate-pages (コーポレート)
        │
        └─ 検索モード判定
            │
            ├─ Hybrid検索 ─┐
            │              │
            └─ Legacy検索 ─┤
                           │
                           └─→ 共通ソート処理 → 結果返却
```

### 検索モード判定条件

| モード | 条件 |
|--------|------|
| **採用ページ検索** | `custom_query` 未指定時は Hybrid優先。公式 / trusted候補が得られない場合だけ Legacy を追加実行 |
| **コーポレート検索** | `USE_HYBRID_SEARCH=true` かつ `custom_query` が未指定なら Hybrid、それ以外は Legacy |

### キャッシュ戦略

| 検索モード | キャッシュ方式 |
|-----------|--------------|
| Hybrid | インメモリキャッシュ |
| Legacy | DDGSクエリキャッシュ |

---

## 共通ルール

### 1. 公式ドメイン判定

```
入力: 企業名, URL
    │
    ├─ classify_company_domain_relation() で登録済みドメイン所有関係を判定
    │   - official / parent / subsidiary / other / ambiguous
    │   - 短いパターンは許可リスト制
    │   - 例: "sony" → "sony.co.jp", "sony.com"
    │
    └─ 判定結果: official / job_site / parent / subsidiary / other / blog

**採用ページ検索の追加ルール:**
- `classify_company_domain_relation()` の relation が最優先
- 親会社 / 子会社ドメインは検索結果に残してよいが、`official` へ昇格させない
- trusted job site は `job.mynavi.jp`, `job.rikunabi.com`, `onecareer.jp` のみ
- parent / subsidiary / job_site は自動選択しない
```

- `official` は対象企業の登録済みドメイン所有関係で一意に判定できる場合だけ付与する
- 短社名企業は bare token ではなく dotted domain を優先する
  - 例: `Sky` は `skygroup.jp` `sky-recruit.jp` `sky-career.jp` を明示登録し、`skygroup.sky` のような foreign domain は `official` にしない
- 親会社/子会社ページは候補から除外せず、`parent` / `subsidiary` のまま保持する
- `preferred_domain` や検索エンジン由来の raw `source_type` は順位調整には使えても、関連会社ページを `official` に昇格させない

### 2. 除外フィルタ

| チェック項目 | 除外条件 |
|------------|---------|
| **無関係URL** | `_is_irrelevant_url()` で判定<br>- Wikipedia, LinkedIn等 |
| **競合ドメイン** | `_get_conflicting_companies()` で判定<br>- **厳密一致時のみ**タイトル/スニペットチェック |
| **企業名不一致** | `_contains_company_name()` で判定<br>- **公式ドメインと親子会社ドメインは免除** |
| **社員記事不適合** | `employee_interviews` で `Investors` `IR` `会社概要` `企業データ` 等を除外 |

### 3. スコアペナルティ

| 対象 | 乗数 | 備考 |
|-----|------|------|
| **親会社ドメイン** | `×0.5` | 関連会社候補として残す |
| **子会社ドメイン** | `×0.3` | - |

### 4. 共通ソートロジック

**優先順位:**

```
1. source_type による優先度
   official > job_site > parent/subsidiary > other > blog
   
2. 同一 source_type 内では confidence
   high > medium > low
   
3. 同一 confidence 内では combined_score (降順)
```

**注意:** Hybrid検索の aggregator は `job_site` として扱われる

### 5. `employee_interviews` のページ種別ゲート

- `employee_interviews` は URL/title/snippet に `interview` `voice` `people` `member` `社員紹介` `社員インタビュー` `社員の声` `働く人` などの signal があるページだけ採用する
- root page や generic 採用トップは採らない
- `Investors` `IR` `統合報告` `企業概要` `企業データ` などは official domain でも `employee_interviews` では採らない
- これらのページは `ir_materials` / `midterm_plan` / `corporate_site` 側で使う

---

## 採用ページ検索

### Hybrid検索フロー

```
1. 入力受付
   ↓
2. domain_patterns 取得
   ↓
3. hybrid_web_search 実行
   - intent: "recruitment"
   - max_results: 指定値 + 10
   ↓
4. 除外・ペナルティ適用
   ↓
5. confidence 判定
   - year_matched=false の場合
     high → medium に降格
   ↓
6. 共通ソート
   ↓
7. 結果返却
```

### Legacy検索フロー

```
1. 入力受付
   ↓
2. _build_recruit_queries でクエリ生成
   ↓
3. DDGS検索実行 (利用不可ならエラー)
   ↓
4. _score_recruit_candidate_with_breakdown でスコアリング
   ↓
5. 除外・ペナルティ適用
   ↓
6. _score_to_confidence で信頼度変換
   ↓
7. 共通ソート
   ↓
8. 結果返却
```

### クエリ生成ロジック

```
custom_query 指定あり?
    │
    YES → custom_query のみ使用
    │
    NO
    │
    ├─ selection_type による分岐
    │   │
    │   ├─ "internship" → インターン系クエリ
    │   ├─ "main_selection" → 本選考系クエリ
    │   └─ 未指定 → 新卒/採用混在クエリ
    │
    ├─ COMPANY_QUERY_ALIASES から別名追加
    │
    ├─ industry 指定があれば業界名追加
    │
    ├─ 重複除去
    │
    └─ 最大6件に制限
```

### Confidence判定基準

#### Hybrid検索の場合

| adjusted_score | source_type | year_matched | confidence |
|---------------|-------------|--------------|------------|
| ≥ 0.7 | official | true | **high** |
| ≥ 0.7 | official | false | **medium** (降格) |
| ≥ 0.7 | job_site | - | **medium** |
| 任意 | parent / subsidiary | - | **low** |
| その他 | - | - | **low** |

#### Legacy検索の場合

| source_type | score範囲 | year_matched | confidence |
|------------|----------|--------------|------------|
| official | ≥ 6 | true | **high** |
| official | ≥ 6 | false | **medium** (上限) |
| official | 3-5 | - | **medium** |
| official | < 3 | - | **low** |
| job_site | ≥ 6 | - | **medium** |
| job_site | < 6 | - | **low** |
| parent / subsidiary | 任意 | - | **low** |
| blog / other | 任意 | - | **low** |

### スコアリング内訳 (Legacy)

#### 加点要素

| 項目 | スコア | 条件 |
|-----|--------|------|
| ドメインパターン一致 | +4.0 | - |
| 企業名 (タイトル) | +3.0 | - |
| 企業名 (スニペット) | +2.0 | - |
| ASCII名一致 | +3.0 | - |
| 採用サブドメイン | +3.0 | recruit.*, saiyo.* 等 |
| 採用URLキーワード | +3.0 | /recruit/, /career/ 等 |
| 採用タイトルキーワード | +2.0 | 採用, 新卒, エントリー 等 |
| 採用スニペットキーワード | +1.0 | 同上 |
| 卒業年度一致 | +1.0 | - |
| マイページボーナス | +1.0 | mypage, entry 等 |
| 業界名一致 | +0.5 | - |

**TLD品質ボーナス:**
- `.co.jp`: +2.0
- `.jp`: +1.5
- `.com`: +1.0
- `.net`: +0.5

#### 減点要素

| 項目 | スコア | 条件 |
|-----|--------|------|
| 年度不一致 | -2.0 | - |
| アグリゲータサイト | -3.0 | - |
| 個人ブログ | -5.0 | - |
| 公式ブログ | -1.0 | - |
| 個人サイト | -3.0 | - |
| 低品質TLD | -1.0 | - |

---

## コーポレートページ検索

### Hybrid検索フロー

```
1. 入力受付
   ↓
2. domain_patterns 取得
   ↓
3. content_type → search_intent 変換
   ↓
4. hybrid_web_search 実行
   - max_results: 指定値 + 10
   - cache_mode 適用
   ↓
5. 除外・ペナルティ適用
   ↓
6. confidence 判定
   ↓
7. 共通ソート
   ↓
8. 結果返却
```

### content_type → search_intent マッピング

| content_type | search_intent |
|-------------|---------------|
| `new_grad_recruitment` | `new_grad` |
| `midcareer_recruitment` | `midcareer` |
| `ceo_message` | `ceo_message` |
| `employee_interviews` | `employee_interviews` |
| `ir_materials` | `corporate_ir` |
| `csr_sustainability` | `csr` |
| `midterm_plan` | `midterm_plan` |
| `press_release` | `press_release` |
| `corporate_site` | `corporate_about` |
| **未指定** | `corporate_about` |

### Legacy検索フロー

```
1. 入力受付
   ↓
2. _build_corporate_queries でクエリ生成
   ↓
3. DDGS検索実行 (利用不可ならエラー)
   ↓
4. Strict Pass: スコアリング + 厳密フィルタ
   ↓
5. 結果 < 3件?
   │
   YES → Relaxed Pass 実行
   │
6. allow_aggregators=false かつ 結果=0?
   │
   YES → Aggregator許可 Pass 実行
   │
7. score < 3.5 を除外
   ↓
8. 除外・ペナルティ適用
   ↓
9. _score_to_confidence で信頼度変換
   ↓
10. 共通ソート
   ↓
11. 結果返却
```

### クエリ生成ロジック

```
custom_query 指定あり?
    │
    YES → custom_query のみ使用
    │
    NO
    │
    ├─ content_type 指定あり?
    │   │
    │   YES → content_type 専用クエリ (最大4件)
    │   NO  → search_type クエリ
    │
    ├─ preferred_domain 指定あり?
    │   │
    │   YES → "site:preferred_domain" 付与
    │   NO  → そのまま
    │
    ├─ 重複除去
    │
    └─ 最大4件に制限
```

### Confidence判定基準

#### Hybrid検索の場合

| adjusted_score | source_type | confidence |
|---------------|-------------|------------|
| ≥ 0.7 | official | **high** |
| ≥ 0.7 | job_site / blog | **medium** |
| ≥ 0.5 | other | **medium** |
| 任意 | parent / subsidiary | **low** |
| < threshold | - | **low** |

#### Legacy検索の場合

| source_type | score範囲 | confidence |
|------------|----------|------------|
| official | ≥ 6 | **high** |
| official | 3-5 | **medium** |
| official | < 3 | **low** |
| job_site/blog | ≥ 6 | **medium** |
| parent/subsidiary | 任意 | **low** |
| job_site/blog | < 6 | **low** |
| other | ≥ 4 | **medium** |
| other | < 4 | **low** |

### スコアリング内訳 (Legacy)

#### 加点要素

| 項目 | スコア | 条件 |
|-----|--------|------|
| ドメインパターン一致 | +4.0 | - |
| 企業名 (タイトル) | +3.0 | - |
| 企業名 (スニペット) | +2.0 | - |
| ASCII名一致 | +3.0 | - |
| ContentType URLパターン | +2.5 | content_type 指定時 |
| ContentType タイトル | +2.0 | content_type 指定時 |
| ContentType スニペット | +1.0 | content_type 指定時 |
| Legacy URL | +2.0 | content_type 未指定時 |
| Legacy タイトル | +2.0 | content_type 未指定時 |
| Legacy スニペット | +1.0 | content_type 未指定時 |
| preferred_domain 一致 | +3.0 | - |
| IR PDF | +1.5 | PDF形式 |
| IR文書キーワード | +2.5 | 決算, 有価証券 等 |

**TLD品質ボーナス:**
- `.co.jp`: +1.5
- `.jp`: +1.0
- `.com`: +0.5
- `.net`: +0.5

#### 減点・除外要素

| 項目 | スコア/処理 | 条件 |
|-----|-----------|------|
| 企業不一致ペナルティ | -4.0 | - |
| ContentType 不一致 | -2.0 | content_type 指定時 |
| preferred_domain 不一致 | -1.0 | - |
| アグリゲータサイト | -2.0 | - |
| 低品質TLD | -1.0 | - |
| **除外: アグリゲータ** | 除外 | allow_aggregators=false 時 |
| **除外: Strict不一致** | 除外 | Strict Pass で失敗 |
| **除外: 非HTTP** | 除外 | http/https 以外 |

### Strict判定の通過条件

以下のいずれかを満たす場合に通過:

1. 企業名一致
2. preferred_domain 一致
3. 公式ドメイン
4. 親会社/子会社ドメイン

**注意:** 親会社/子会社ドメインは strict pass を通過しても `official` にはならず、採用ページ検索では confidence は `low` 上限

### スコアリング分岐

| 状態 | 使用する加点ロジック |
|-----|-------------------|
| **content_type 指定あり** | ContentType系の加点/減点のみ<br>`search_type` キーワードは**使用しない** |
| **content_type 未指定** | `search_type` 系キーワードのみ使用 |

---

## Hybrid検索の内部処理

```
1. クエリ生成
   ↓
2. DDG並列検索
   ↓
3. RRF (Reciprocal Rank Fusion) で融合
   ↓
4. Cross-Encoder Rerank (利用可能時)
   ↓
5. Heuristic スコア算出
   ↓
6. 正規化合成
   - Rerank: 0.5
   - Heuristic: 0.3
   - RRF: 0.2
   ↓
7. combined_score 降順ソート
```

---

## デバッグログ

`WEB_SEARCH_DEBUG=1` を設定すると、Hybrid検索の詳細ログを出力します。

### 出力内容（例）

- クエリ別のDDG結果件数と上位URLサンプル
- RRF統合の入力件数 / ユニーク件数 / 重複件数
- Prefilter除外理由の内訳と代表URL
- site救済の発火条件、対象ドメイン、救済後件数
- combined_score の min / max / avg と上位N件の内訳

### 使い方

```
WEB_SEARCH_DEBUG=1
```

開発用の `.env.local` に設定済みであれば自動的に有効になります。

---

## 既知の問題点

### 🔴 重要度: 高

| # | 問題内容 | 影響範囲 |
|---|---------|---------|
| 1 | **Hybrid の combined_score は相対評価**<br>クエリ集合内での正規化のため、絶対的な品質保証ができない | Hybrid検索全体 |
| 2 | **Hybrid と Legacy で confidence 基準が異なる**<br>同じクエリでもモードにより信頼度が変わる可能性 | 検索結果の一貫性 |
| 3 | **Corporate Hybrid は一部パラメータ未対応**<br>`preferred_domain`, `strict`, `allow_aggregators` が反映されない | コーポレート Hybrid |

### 🟡 重要度: 中

| # | 問題内容 | 影響範囲 |
|---|---------|---------|
| 4 | **Hybrid heuristic は採用系前提**<br>コーポレート検索には最適化されていない | コーポレート Hybrid |
| 5 | **Hybrid に content_type 固有加点なし**<br>Legacy のような詳細な content_type 対応がない | コーポレート Hybrid |
| 6 | **source_type 優先度が採用寄り**<br>`job_site` が高優先となり、IRサイト等が不利 | 共通ソート |

### 🟢 重要度: 低

| # | 問題内容 | 影響範囲 |
|---|---------|---------|
| 7 | **企業名一致判定が短いプレフィックス依存**<br>`_contains_company_name()` の精度課題 | 除外フィルタ |
| 8 | **競合ドメイン判定が限定的**<br>厳密一致時のタイトル/スニペットのみチェック | 除外フィルタ |

---

## 主要実装ファイル

```
backend/
├── app/
│   ├── routers/
│   │   └── company_info.py          # エンドポイント実装
│   └── utils/
│       └── web_search.py            # 検索ロジック実装
└── docs/
    └── features/
        └── COMPANY_INFO_FETCH.md    # 機能ドキュメント
```

---

**最終更新:** このドキュメントは実装現状を反映しています
