# ES添削機能

ES添削は、設問ごとに `改善ポイント` と `改善案` を返すストリーミング機能である。  
標準UIでは `Claude / GPT / Gemini / クレジット消費を抑えて添削` を選べる。内部の実モデルは `Claude Sonnet 4.6 / GPT-5.4 / GPT-5.4-mini / Gemini 3.1 Pro Preview` を使う。

## 入口

| 項目 | 内容 |
|------|------|
| UI | `src/components/es/ReviewPanel.tsx` |
| Next.js API | `POST /api/documents/[id]/review/stream` |
| FastAPI API | `POST /api/es/review/stream` |
| 出力 | `top3`, `rewrites[0]`, `template_review`, `review_meta` |

## ES 一覧・文書分類（`es_category`）

- **DB**: `documents.es_category`（API/フロントは `esCategory`）。`documents.type` は ES エディタ向けで引き続き **`es`**。別用途の `type = tips`（就活TIPS等）と混同しないこと。
- **分類値**: `entry_sheet`（エントリーシート）, `resume`, `assignment`, `memo`, `interview_prep`, `tips`, `reflection`, `other`。ラベルと Zod は [`src/lib/es-document-category.ts`](../../src/lib/es-document-category.ts)。
- **初期テンプレ**: 新規作成で `content` を送らない場合、`POST /api/documents` が分類に応じたブロックを [`src/lib/es-document-templates.ts`](../../src/lib/es-document-templates.ts) から生成して保存する。文言調整はこのファイルで行う。
- **UI**: 一覧は [`src/components/es/ESListPageClient.tsx`](../../src/components/es/ESListPageClient.tsx)（作成モーダル・分類フィルタ・カードバッジ）、編集は [`src/components/es/ESEditorPageClient.tsx`](../../src/components/es/ESEditorPageClient.tsx) で分類変更可（`PUT /api/documents/[id]`）。
- **一覧の軽量化**: リスト用のサーバー/API は [`getDocumentsPageData`](../../src/lib/server/app-loaders.ts) で `includeContent: false` とし、カードに不要な `content` を読み込まない（値は `null`）。本文取得は `GET /api/documents/[id]` と RSC の `getDocumentDetailPageData`。添削 UI は `ESEditorPageClient` から `next/dynamic` で遅延ロード。アプリ全体の方針は [`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) の「主要導線の描画方針」を参照。

## 使う入力

- 設問: `sectionTitle`, `templateType`, `sectionCharLimit`
- 本文: `sectionContent`
- 企業文脈: `companyId`, `industryOverride`, `roleName`, `internName`
- ユーザー文脈: `profile_context`, `gakuchika_context`, `document_context.other_sections`
- その回の追加資料: `user_provided_corporate_urls`

### 企業未選択のドキュメント

企業に紐づかない ES でも添削できる。設問タイプは **自動（未指定）・ガクチカ・自己PR・価値観** に限定する。自動推論は conservative で、`confidence=high` のときだけ具体テンプレを採用し、それ以外は `basic` にフォールバックする。明示で集合外を送った場合は 400。企業 RAG と業界・職種の UI は使わない（企業ありの添削では従来どおり業界・職種が必須）。

### 検索クエリ（retrieval_query）

企業 RAG の hybrid 検索に渡す `retrieval_query` は、設問タイプ・業界・企業名・職種・本文要約に加え、**プロフィール（大学・志望軸）・ガクチカ要約・同一 ES の他設問見出し要約**を短く連結する（全体は上限文字で打ち切り）。

### 出典（keyword_sources）

企業 URL に加え、**今回リクエストに含めたユーザー由来コンテキスト**（プロフィール / ガクチカ / 同一 ES の他設問）をカードとして先に列挙する。これらは **アプリ内の相対パス**（例: `/profile`, `/gakuchika`, `/es/{document_id}`）を `source_url` に載せ、フロントの `ReferenceSourceCard` は `next/link` で同一タブ遷移する。`document_id` は Next のストリーム API から FastAPI `ReviewRequest` に渡す。

## 企業情報の優先順位

企業根拠は次の順で使う。

1. ユーザーが手動追加した URL / PDF
2. ユーザーが選択して保存した企業ページ
3. 既存の corporate RAG（ユーザーが選択した公開ソースのみで構成）

`user_provided` は「この資料を見てほしい」という明示意図があるため、ES添削では最優先に扱う。  
これは企業情報取得機能の `official / medium / low` 表示とは別の優先度である。

### 企業 RAG の「自動補強」について（現行）

- **選考スケジュール取得**では採用ページのテキスト抽出のみであり、**コーポレート RAG への取り込みは行わない**（`docs/features/COMPANY_INFO_FETCH.md` の「選考スケジュール取得では RAG を構築しない」と同趣旨）。
- **ES 添削**のバックエンド処理中に、**新規 URL の自動クロールや埋め込み・インデックス更新は行わない**。企業根拠に使えるのは、**既にインデックス済みのコーポレート RAG**（ユーザーがコーポレート取得で登録したソース）と、**当該リクエストの `user_provided_corporate_urls`** のみ。`role-focused second pass` 等の追加検索も、**既存ストアに対する検索**であり、裏で fetch-corporate 相当のパイプラインは走らせない。

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

required 設問では、通常検索に加えて `user_provided_corporate_urls` を current-run で直接差し込む。  
そのため、直前に手動追加されたページやアップロード PDF もその回の添削に反映される。

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

required 設問では、設問タイプに応じて使う根拠軸を固定しつつ、次の文脈を追加ヒントとして圧縮する。

- `profile_context` の志望業界 / 志望職種
- `gakuchika_context` の強み / 行動要約
- 同一 ES 内の関連セクション見出しと要約

追加ヒント語は最大 6 件までに制限し、multi-pass の探索は増やさない。

### 企業ソース不足時の扱い

企業ソースが不足しているときは、企業固有の断定を広げず、`company_general` または `weak_evidence_notice` で安全側に倒す。

- 判定対象は保存済み `corporateInfoUrls` のうち `trustedForEsReview=true` な source
- trusted source は原則として次
  - `official`
  - `parentAllowed=true` の親会社 source
  - `upload://corporate-pdf/<company_id>/...`
- assistive 設問 (`basic`, `gakuchika`, `self_pr`, `work_values`) は、設問に企業シグナルがない限り企業断定を強めない
- `low-cost` モードでも追加の企業ソース取得は行わず、既存 source だけで続行する
- required 設問では `人・役割軸` と `事業軸` の trusted coverage が不足しているとき、企業固有の断定を抑える

### 6. 検証と再試行

post-check で次を検証する。

- 空文字ではない
- 文字数条件を満たす
- `だ・である調`
- 冒頭が設問に正対し、設問の復唱から始まっていない（`company_motivation` / `role_course_reason` / `intern_goals` / `post_join_goals` は **先頭2文まで**で結論・アンカーを確認し、経験前置き1文＋本答え1文を許容する）
- 箇条書き・列挙調ではない
- 参考ESに近すぎない

rewrite retry は最大 3 回で固定する。  
1回目は通常 rewrite、2回目は `length_focus`、3回目は fallback rewrite を使う。  
その後は専用 `length-fix` を最大 1 回だけ許可し、全文再生成ではなく最小限の文字数補修に限定する。  
全標準モデルで共通 validator を使い、`結論ファースト / answer focus / verbose opening / bulletish` を同じ基準で検証する。  
文字数の strict 受理帯は常に `X-10〜X`（`X = char_max`）に固定する。通常 rewrite の内部目標帯は `max(X-10, X-5)〜X`、under-min recovery は `max(X-10, X-3)〜X` を使う。たとえば 400 字設問は通常 `395〜400`、recovery は `397〜400` を狙う。  
`soft_min` は最終救済だけに使う。`rewrite 3回 + length-fix 1回` をやり切った後にのみ判定し、**全帯域で** `0.9X〜X` を受理余地とする。途中の rewrite 段では under-min を受理しない。  
緩和するのは文字数だけで、`answer_focus / grounding / 参考ES距離 / だ・である調 / 箇条書き禁止` は strict のまま維持する。

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

### GPT-5.4 / GPT-5.4-mini

- 標準経路で selectable
- improvement 抽出は `Responses API` + Structured Outputs を使う
- rewrite / length-fix は stability-first の plain text 契約で、OpenAI Chat Completions 系の text 経路を使う
- OpenAI の plain text rewrite では `verbosity=medium` と `prompt_cache_key` を付与し、空レスポンスを避けつつ過度に短すぎる出力を減らす
- **improvement（JSON schema）**では `reasoning.effort=minimal` を使う（mini 含む）
- `status=incomplete` かつ `max_output_tokens` 枯渇のとき、**ユーザー向け rewrite リトライとは別に** API を **最大1回** だけ `max_output_tokens` 引き上げで再実行する（内部リカバリ）
- OpenAI の `gpt-5` / `o` 系向けに、rewrite / length-fix の `max_output_tokens` に **下限（フロア）** を設け、推論で枠を使い切って本文が出ない確率を下げる（Claude / Gemini には同じフロアを適用しない）
- `low-cost` 導線では `gpt-5.4-mini` 系を使う

### Gemini 3 Pro Preview

- 標準経路で selectable
- Google 互換 schema を使う
- `thinkingLevel=LOW`
- hidden thinking を見込んで output budget を多めに取る
- ES添削では低温固定を避け、provider の標準寄り設定で rewrite の欠落と文字数不足を抑える

### Cohere Command A

- 標準経路で selectable
- OpenAI compatibility API を使う
- improvement JSON は shared layer の strict schema + same-model repair を通す
- rewrite は非Claude用の strict text hint と length control を使う

## OpenAI公式機能の採否

### 採用

- `Responses API`
  - OpenAI provider の improvement 抽出で使う
  - rewrite / length-fix は stability-first の text 経路に分離する
- `GPT-5.4` / `gpt-5.4-mini`
  - 主用途は `GPT-5.4`、低コスト導線は `gpt-5.4-mini`
  - JSON improvement は `minimal` を起点にし、プレーンテキスト rewrite は `verbosity=medium` + `prompt_cache_key` を使う

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

- **Free プラン**: モデルは **GPT-5.4 mini 固定**（UI は案内のみ）。**消費クレジットは有料でプレミアムモデルを選んだ場合と同じ表**（6〜20）。`review/stream` が `user_profiles.plan` を見て `llm_model` を `low-cost` に上書きする。
- **Standard / Pro**: `モデル選択` dropdown で `Claude / GPT / Gemini / クレジット消費を抑えて添削` を設問ごとに切り替えられる
- 業界 / 職種 / 設問タイプは dropdown
- CTA は固定フッター
- 企業連携状態は `ReviewPanel` 上部に常時表示
- 企業未選択でも、プロフィール / ガクチカを使う旨をバナーで明示する

### クレジット消費（`calculateESReviewCost`）

| モデル区分 | 〜500字 | 〜1000字 | 〜1500字 | 1501字〜 |
|------------|---------|----------|----------|----------|
| Claude / GPT / Gemini | 6 | 10 | 14 | 20 |
| クレジット消費を抑えて添削（low-cost） | 3 | 6 | 9 | 12 |
| **Free プラン（実体 mini・クレジットはプレミアム帯）** | **6** | **10** | **14** | **20** |

### ReviewPanel の単一マウント

ES ページ (`src/app/es/[id]/page.tsx`) では `useSyncExternalStore` + `matchMedia("(min-width: 1024px)")` でビューポートを判定し、**デスクトップではデスクトップ用 ReviewPanel のみ、モバイルでは MobileReviewPanel のみ**をマウントする。これにより `useESReview` フックが常に1インスタンスだけ存在し、二重ロック・状態不整合を防止する。

### クレジット不足ガード

- `ReviewPanel` は auth 未確定中に guest 扱いへ落とさず、クレジット確認中の状態を優先表示する。

### 右パネル内スクロールと自動追尾

- ES 編集画面は `h-screen` + `overflow-hidden` のため、ウィンドウ全体の `scrollTo` はほとんど効かない。
- **添削開始時**は、`isLoading` が true になってストリーミング用 DOM に差し替わった**直後**（`useLayoutEffect`）に次を行う。ボタン押下の同期的な `scrollTo` だけでは、まだセットアップ画面のままのため先頭移動が無効化されやすい。
  1. `ReviewPanel` ルート（`panelRootRef`）に対して `scrollIntoView({ block: "start", behavior: "auto" })` し、親に縦スクロールがある場合でもパネル上端が見えるようにする（モバイルシート等）。
  2. パネル内の `scrollContainerRef`（`overflow-y-auto`）を `scrollTop = 0` で先頭へ戻し、進捗 UI から見失わないようにする。
- **自動追尾**は参照実装寄りの単純方式にする。
  - 開始直後はパネル上端と進捗 UI を見せる。
  - 最初の rewrite / issues / sources が出始めた後は、**表示内容が増えるたびにそのコンテナを `scrollHeight` まで送る**単純な追尾にする。
- **ストリーミング〜再生完了までの自動追尾**は参照実装寄りの単純方式とし、`ResizeObserver` や phase ベースの pause/resume は使わない。
- スクロールコンテナに **`overflow-anchor: none`**（`[overflow-anchor:none]`）を付け、ブラウザの scroll anchoring 由来の誤判定を抑える。
- `issues / sources` の streamed section は静的描画を優先し、スクロール中に縦移動 animation でガタつかせない。

### セットアップ入力のバリデーション表示

- テンプレ名・インターン名・業界・職種などの未充足は `getReviewValidationIssues` で常に計算するが、**赤い枠線・リング・`aria-invalid`・フィールド直下のエラー文**は、`この設問をAI添削` を押してまだ開始できないとき（`setupErrorHighlight`）にだけ出す。セクション全体の**背景色は赤く染めず**、枠・入力・セレクトの境界だけで示す。
- 未ハイライト時はフッターの案内は通常のヒント文のみとし、不足項目の列挙は出さない。ハイライト時は短い指示（赤字の枠内の入力・選択）に加え、先頭の issue メッセージを最大1件だけ併記する。

### バージョン履歴（`VersionHistory`）

- 配置は従来どおりレビューパネル下部の `supplementalContent`。見た目は **タイムラインなしのフラットな縦リスト**（選択中・閲覧対象の行は `rounded-lg` + 薄い背景）。
- 先頭行（API 上もっとも新しい版）は文言で **「いまの編集のもとになる版」** を明示し、それ以外は **「過去の自動保存」** など短い副テキストで区別する（汎用バッジに依存しない）。
- **復元**は `window.confirm` ではなく shadcn の `AlertDialog` で確認する。添削ストリーム中などは `restoreDisabled` で操作を抑止する。
- **閲覧**ダイアログでは、一覧順で **ひとつ新しい版**（より新しい保存）との要約を並置し、文字数差・先頭付近の一致など **軽いヒューリスティック**で差分の目安を一文表示する。
- 縦長を抑えるため、見出しから **折りたたみ**で本体リストを開閉できる。
- 条件不足のまま CTA を押した場合は、未達の `Select` / `Input` を赤表示し、CTA 近くにも不足項目の要約を出す。

`ReviewPanel` は `useCredits` の残高と `calculateESReviewCost` を比較し、不足時は添削ボタンを無効化してヒントテキストで案内する。サーバ側の 402 チェックは引き続き必須であり、クライアント側はソフトガードの位置づけ。

### 出典カードの遷移

- 内部リンク (`/profile`, `/gakuchika`) を含む出典カードは同一タブで開く（自動スクロールの挙動は上記「右パネル内スクロールと自動追尾」に集約）。

## 主要 `review_meta`

- `llm_provider`, `llm_model`
- `review_variant`
- `grounding_mode`, `primary_role`
- `company_evidence_count`, `evidence_coverage_level`
- `fallback_to_generic`, `rewrite_generation_mode`, `rewrite_attempt_count`
- `length_policy`, `length_shortfall`, `length_fix_attempted`, `length_fix_result`
- `token_usage`
  - `input_tokens`, `output_tokens`, `reasoning_tokens`, `cached_input_tokens`
  - `llm_call_count`, `structured_call_count`, `text_call_count`

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
