# ES添削機能

ES添削は、設問ごとに `改善ポイント` と `改善案` を返すストリーミング機能である。  
標準経路は `Claude Sonnet 4.5 / GPT-5.1 / Gemini 3.1 Pro Preview`、β経路は `Qwen3 Swallow 32B` を使う。

## 入口

| 項目 | 内容 |
|------|------|
| UI | `src/components/es/ReviewPanel.tsx` |
| Next.js API | `POST /api/documents/[id]/review/stream` |
| FastAPI API | `POST /api/es/review/stream` |
| β route | `POST /api/documents/[id]/review/qwen-stream` |
| 出力 | `top3`, `rewrites[0]`, `template_review`, `review_meta` |

## 使う入力

- 設問: `sectionTitle`, `templateType`, `sectionCharLimit`
- 本文: `sectionContent`
- 企業文脈: `companyId`, `industryOverride`, `roleName`, `internName`
- ユーザー文脈: `profile_context`, `gakuchika_context`, `document_context.other_sections`
- その回の追加資料: `prestream_source_urls`, `user_provided_corporate_urls`

## 企業情報の優先順位

企業根拠は次の順で使う。

1. ユーザーが手動追加した URL / PDF
2. その回の添削直前に取得した企業ページ
3. 既存の corporate RAG

`user_provided` は「この資料を見てほしい」という明示意図があるため、ES添削では最優先に扱う。  
これは企業情報取得機能の `official / medium / low` 表示とは別の優先度である。

## 処理の流れ

### 1. 入力防御

ユーザー由来のテキスト全体を検査する。

- `high`: prompt 開示要求、参考ES開示要求、個人情報抽出要求、SQL exfiltration
- `medium`: code fence、role prefix、XML風タグ

`high` は遮断、`medium` は sanitize して続行する。

### 2. 企業RAG取得

企業がある場合は hybrid search を使う。主に見るのは次の 3 系統。

- `new_grad_recruitment`
- `employee_interviews`
- `corporate_site`

required 設問では、通常検索に加えて `prestream_source_urls` と `user_provided_corporate_urls` を current-run で直接差し込む。  
そのため、直前取得したページやアップロード PDF もその回の添削に反映される。

### 3. grounding 判定

required 設問で `role_grounded` とみなすには、少なくとも次の両方が必要。

- `役割 / プログラム` に効く根拠
- `企業理解 / 事業 / 価値観` に効く根拠

片方が欠ける場合は `company_general` に留め、必要なら role-focused second pass を 1 回だけ走らせる。

### 4. 改善ポイント生成

標準経路では、改善案の前に `top3` を JSON で生成する。  
backend で parse / repair / validation を行い、失敗時は安全な fallback を使う。

### 5. 改善案生成

rewrite prompt に入れるものは絞っている。

- 設問と文字数条件
- 元回答
- 選択済み user facts
- 改善ポイント
- 企業根拠カード
- 参考ES由来の quality hints

`selected_user_facts` は relevance と source balance で最大 8 件に絞る。  
`current_answer` は必ず含める。

### 6. 検証と再試行

post-check で次を検証する。

- 空文字ではない
- 文字数条件を満たす
- `だ・である調`
- 参考ESに近すぎない

通常 retry は最大 6 回。  
非Claudeの 300〜500 字 required 設問では、under-min が続くと `length_focus` を使う。small miss は `length-fix` で 1 回だけ補正する。

## 参考ESの扱い

参考ESは本文の材料には使わない。用途は次だけ。

- quality hints
- coarse skeleton
- overlap guard

禁止していること。

- 参考ES本文の引用
- 参考ESを企業根拠として使うこと
- 参考ES由来の事実をユーザー事実として使うこと

## モデル別メモ

### Claude

- 現在の主経路
- Anthropic transport はそのまま維持

### GPT-5.1

- 標準経路で selectable
- 390〜400字帯では non-Claude 用 length control を適用

### Gemini 3.1 Pro Preview

- 標準経路で selectable
- Google 互換 schema を使う
- `thinkingLevel=LOW`
- hidden thinking を見込んで output budget を多めに取る
- ES添削では temperature を低めに固定する

### Qwen β

- 別 route の rewrite-only 実装
- improvement JSON は作らない

## UI の要点

- `モデル選択` dropdown で標準モデルを設問ごとに切り替えられる
- `Qwen3 Swallow 32B β` は別経路
- 業界 / 職種 / 設問タイプは dropdown
- CTA は固定フッター
- 企業連携状態は `ReviewPanel` 上部に常時表示

## 主要 `review_meta`

- `llm_provider`, `llm_model`
- `review_variant`
- `grounding_mode`, `primary_role`
- `triggered_enrichment`, `enrichment_completed`, `enrichment_sources_added`
- `company_evidence_count`, `evidence_coverage_level`
- `fallback_to_generic`
- `length_policy`, `length_shortfall`, `length_fix_attempted`, `length_fix_result`

## よく見るログ

- `企業RAG判定`
- `grounding_mode=...`
- `prompt context: selected_user_facts=... company_evidence_cards=...`
- `rewrite ... attempt=... mode=...`
- `rewrite success: ... chars=...`
- `rewrite ... 最終失敗`

## テスト

主な回帰テストは以下。

- `backend/tests/es_review/test_es_review_template_rag_policy.py`
- `backend/tests/es_review/test_es_review_template_repairs.py`
- `backend/tests/es_review/test_es_review_quality_rubric.py`
- `backend/tests/es_review/test_es_review_final_quality_cases.py`
- `backend/tests/shared/test_llm_provider_routing.py`

実行例:

```bash
python -m pytest backend/tests/es_review -q
python -m pytest backend/tests/shared/test_llm_provider_routing.py -q
```
