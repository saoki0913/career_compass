# company-info-search Primary Gate FAIL 静的分析（2026-04-19）

## 1. Summary

- 対象: `backend/evals/company_info_search/output/live_company_info_search_20260418_142454_curated.json`（本調査では **live eval を再実行していない**）。
- 8,050 本の `.runs` のうち、**7,700 本（約 95.7%）が同一の Python 例外 `tuple index out of range`** により `error` フィールドが設定されている。
- 残り 350 本は `error == null` かつ `candidates == []`（`kind=company_context` のみ）。**候補が 1 件以上ありゲートのみが FAIL** の分岐は 0 件。

## 2. 再現手順（軽量・参考）

本調査は **既存 output JSON の jq 集計のみ**。以下は開発者向けの軽量再現コマンドであり、本調査では実行していない。

```bash
make backend-test-live-search LIVE_SEARCH_SAMPLE_SIZE=10 LIVE_SEARCH_USE_CURATED=true
```

完全な Primary Gate 比較はサンプルサイズ・環境に依存するため、本レポートの数値は **2026-04-18 14:24 生成の curated ファイル** に限定する。

## 3. Primary Gate 定義（閾値）

[`backend/evals/company_info_search/config.py`](../../../backend/evals/company_info_search/config.py) および当該 eval の `summary.gate_summary` より、代表ゲートは次のとおり（`actual` は当該 run ではいずれも **0.0**）。

| 名前 | 閾値（例） | 備考 |
|------|------------|------|
| overall | 0.95 | `min_overall_rate` |
| recruitment | 0.95 | `min_recruitment_rate` |
| corporate | 0.94 | `min_corporate_rate` |
| candidate_mrr | 0.75 | |
| ndcg@5 | 0.80 | |
| mean_grade_score | 0.85 | |

`gate_summary` には `content_type:*` など追加チェック行も含まれる。

## 4. 直近実測の静的分析（jq）

### メタ

- `generated_at`: 2026-04-18T14:24:54
- `duration_seconds`: 0.45
- `company_source`: `curated`
- `snapshot_cache.mode`: `live_only`

### 集計

| 指標 | 値 |
|------|-----|
| `.runs` 件数 | 8,050 |
| `candidates == []` の件数 | 8,050（全 run） |
| `error != null` の件数 | 7,700 |
| `error == null` かつ `candidates == []` | 350 |

### エラー分布（上位）

| error 文字列 | 件数 |
|--------------|------|
| `tuple index out of range` | 7,700 |

### `error == null` かつ空 candidates の kind 分布

| kind | 件数 |
|------|------|
| company_context | 350 |

### サンプル（先頭 1 件）

- `mode`: hybrid  
- `kind`: recruitment_main  
- `company_name`: 三井物産  
- `error`: `"tuple index out of range"`  
- `candidates`: `[]`  
- `judgment.grade`: `error`  
- `judgment.details`: `Error: tuple index out of range`

## 5. 原因三分岐の判定結果

分類定義（計画書 B2）:

- **(a)** `record.error != null` → API エラーまたは **Python 例外（ロジックバグ）**
- **(b)** `error == null && candidates == []` → 検索 0 件 / インデックス未構築 / 呼び出しスキップ
- **(c)** `candidates != []` かつ grade FAIL → 検索ロジック・ランキング・フィルタ問題

**結論（件数ベース）**

| 分岐 | 件数 | 割合（8,050 本基準） |
|------|------|----------------------|
| (a) | 7,700 | **約 95.7%** — 例外メッセージはすべて `tuple index out of range`（ロジック／パイプライン側の不具合が支配的） |
| (b) | 350 | **約 4.3%** — `company_context` のみ、外部 API メッセージではなく「結果ゼロ」系の可能性（要コード追跡） |
| (c) | 0 | **0%** |

### `failure_taxonomy` / A.1 について

[`failure_taxonomy.py`](../../../backend/evals/company_info_search/failure_taxonomy.py) の **A.1 `empty_response`** は歴史的に DDG 由来の説明が付いている。現行 eval は **hybrid/legacy の raw・`candidates`・`error`** を前提とした判定であり、本データでは **空応答というより例外で `judgment.grade=error`** になっている run が大半である。分類ラベルは **「DDG が空」= 本データの主因ではない** と注記する。

## 6. 次アクション候補（1B-2 以降）

1. **(a) 優先**: `tuple index out of range` の発生箇所をスタックトレース付きで特定（eval ランナー、`company_info` 検索パイプライン、リスト/タプル添字）。再現用に **最小 curated 1 社** でデバッグ。
2. **(b)**: `company_context` 350 件で検索が呼ばれているか、`candidates` が空になる条件をコード上で追う（インデックス・クエリ生成・モード分岐）。
3. **(c)**: 現状データでは該当なし。候補が出た後のランキング調整は、**(a)(b) 解消後**の eval で再測定してから。

---

*調査実施: 2026-04-19 / 手法: 既存 JSON の jq 集計のみ（live search 非実行）。*
