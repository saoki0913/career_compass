# ES添削機能

ES添削は、設問ごとに `改善ポイント` と `改善案` を返すストリーミング機能である。  
標準UIでは `Claude / GPT / Gemini / クレジット消費を抑えて添削` を選べる。内部の実モデルは `Claude Sonnet 4.6 / GPT-5.4 / GPT-5.4-mini / Gemini 3.1 Pro Preview` を使い、β経路は `Qwen3 Swallow 32B` を使う。

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

### 企業未選択のドキュメント

企業に紐づかない ES でも添削できる。設問タイプは **自動（未指定）・ガクチカ・自己PR・価値観** に限定する。自動推論の結果がこの集合に入らない場合は `basic` にフォールバックする。明示で集合外を送った場合は 400。企業 RAG・pre-stream 補強・業界・職種の UI は使わない（企業ありの添削では従来どおり業界・職種が必須）。

### 検索クエリ（retrieval_query）

企業 RAG の hybrid 検索に渡す `retrieval_query` は、設問タイプ・業界・企業名・職種・本文要約に加え、**プロフィール（大学・志望軸）・ガクチカ要約・同一 ES の他設問見出し要約**を短く連結する（全体は上限文字で打ち切り）。

### 出典（keyword_sources）

企業 URL に加え、**今回リクエストに含めたユーザー由来コンテキスト**（プロフィール / ガクチカ / 同一 ES の他設問）をカードとして先に列挙する。これらは **アプリ内の相対パス**（例: `/profile`, `/gakuchika`, `/es/{document_id}`）を `source_url` に載せ、フロントの `ReferenceSourceCard` は `next/link` で同一タブ遷移する。`document_id` は Next のストリーム API から FastAPI `ReviewRequest` に渡す。

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

required 設問の pre-stream 補強では、設問タイプに応じて使う根拠軸を固定しつつ、次の文脈を追加ヒントとして圧縮する。

- `profile_context` の志望業界 / 志望職種
- `gakuchika_context` の強み / 行動要約
- 同一 ES 内の関連セクション見出しと要約

追加ヒント語は最大 6 件までに制限し、multi-pass の探索は増やさない。

### pre-stream enrichment の起動条件

pre-stream enrichment は、対象テンプレートかつ **`trusted` な企業根拠が不足しているとき**に起動する。

- 判定対象は保存済み `corporateInfoUrls` のうち `trustedForEsReview=true` な source
- trusted source は原則として次
  - `official`
  - `parentAllowed=true` の親会社 source
  - `upload://corporate-pdf/<company_id>/...`
- assistive 設問 (`basic`, `gakuchika`, `self_pr`, `work_values`) は、設問に企業シグナルがない限り起動しない
- `low-cost` モードでは pre-stream enrichment を起動しない
- required 設問では `人・役割軸` と `事業軸` の trusted coverage が不足しているとき起動する
- **保存 URL が空**で、かつ `corporateInfoFetchedAt` が **直近 24 時間以内**のときは起動しない（直後の連続添削で検索・fetch を繰り返さない）。URL が空で未取得（`fetchedAt` が null）のときは不足扱いで起動しうる
- 補強候補は assistive 設問で最大1件、required 設問でも最大2件に絞り、同期 fetch の無駄打ちを抑える

### 6. 検証と再試行

post-check で次を検証する。

- 空文字ではない
- 文字数条件を満たす
- `だ・である調`
- 冒頭1文が設問に正対し、設問の復唱から始まっていない
- 箇条書き・列挙調ではない
- 参考ESに近すぎない

通常 retry は最大 6 回。  
全標準モデルで共通 validator を使い、`結論ファースト / answer focus / verbose opening / bulletish` を同じ基準で検証する。  
非Claudeの 300〜500 字 required 設問では、under-min が続くと `length_focus` を使う。small miss は `length-fix` で 1 回だけ補正する。

## 参考ESの扱い

参考ESは本文の材料には使わない。用途は次だけ。

- quality hints
- coarse skeleton
- overlap guard

quality hints では全標準モデルに共通で次を要求する。

- 1文目で結論を言い切る
- 3〜4文程度の締まった構成にする
- 各文の役割を分け、同じ内容の言い換えで水増ししない

禁止していること。

- 参考ES本文の引用
- 参考ESを企業根拠として使うこと
- 参考ES由来の事実をユーザー事実として使うこと

## モデル別メモ

### Claude

- 現在の主経路
- Anthropic transport はそのまま維持

### GPT-5.4

- 標準経路で selectable
- OpenAI 経路では `Responses API` を使う
- 390〜400字帯では non-Claude 用 length control を適用

### Gemini 3 Pro Preview

- 標準経路で selectable
- Google 互換 schema を使う
- `thinkingLevel=LOW`
- hidden thinking を見込んで output budget を多めに取る
- ES添削では temperature を低めに固定する

### Cohere Command A

- 標準経路で selectable
- OpenAI compatibility API を使う
- improvement JSON は shared layer の strict schema + same-model repair を通す
- rewrite は非Claude用の strict text hint と length control を使う

### Qwen β

- 別 route の rewrite-only 実装
- improvement JSON は作らない

## OpenAI公式機能の採否

### 採用

- `Responses API`
  - OpenAI 公式は reasoning model で `Responses API` を推奨しており、前ターンの reasoning を引き継げるため、再推論トークンとレイテンシを抑えやすい
  - OpenAI provider の標準添削ではすでにこれを使う
- `GPT-5.4` / `gpt-5.4-mini`
  - 主用途は `GPT-5.4`、低コスト導線は `gpt-5.4-mini`
  - reasoning は live 添削ではまず `none` か `low` を起点にする

### 条件付き採用

- `Batch API`
  - 公式には同期API比で 50% 安いが、24時間以内完了の非同期処理向け
  - ユーザー待ちの ES 添削本線には不向き
  - nightly eval、テンプレ回帰、オフライン品質レポートでは有力

### 今回は見送り

- `Web search`
  - 公式 tool call 課金が別で発生し、live web 参照は出典揺れと応答時間増加を招く
  - ES 添削の企業根拠は既存の company RAG / user-provided source で足りるため、本線には入れない
- `tool_search` / remote MCP
  - GPT-5.4 以降では有効だが、大規模 tool ecosystem 向け
  - 現行の ES 添削フローは tool 数が少なく、導入効果より複雑化の方が大きい

## UI の要点

- `モデル選択` dropdown で `Claude / GPT / Gemini / クレジット消費を抑えて添削` を設問ごとに切り替えられる
- `Qwen3 Swallow 32B β` は別経路
- 業界 / 職種 / 設問タイプは dropdown
- CTA は固定フッター
- 企業連携状態は `ReviewPanel` 上部に常時表示
- 企業未選択でも、プロフィール / ガクチカを使う旨をバナーで明示する

### 自動スクロール

添削パネルはストリーミング出力に追従して自動スクロールする。

- 添削ボタン押下時にパネル位置をリセットしつつ、自動追従フラグを維持する
- ストリーミングで `rewrite / issues / sources` の表示量が増えたときだけ、状態駆動で末尾へ追従する
- ユーザーが自分で下端から 48px 以上離れたら追尾を停止する
- ユーザーが再び下端付近へ戻ったら追尾を自動再開する
- 内部リンク (`/profile`, `/gakuchika`) を含む出典カードは同一タブで開く

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
- `backend/tests/es_review/integration/test_live_es_review_provider_report.py`
- `src/components/es/review-panel-scroll.test.ts`

実行例:

```bash
python -m pytest backend/tests/es_review -q
python -m pytest backend/tests/shared/test_llm_provider_routing.py -q
make backend-test-live-es-review
```
