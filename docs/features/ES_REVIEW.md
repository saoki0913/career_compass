# ES添削機能

ES添削は、設問ごとに改善案と出典を段階的に流し、最後の `complete` で `review_meta` を返すストリーミング機能である。  
標準UIでは `Claude / GPT / Gemini / クレジット消費を抑えて添削` を選べる。内部の実モデルは `Claude Sonnet 4.6 / GPT-5.4 / GPT-5.4-mini / Gemini 3.1 Pro Preview` を使う。

## 入口


| 項目          | 内容                                                      |
| ----------- | ------------------------------------------------------- |
| UI          | `src/components/es/ReviewPanel.tsx`                     |
| Next.js API | `POST /api/documents/[id]/review/stream`                |
| FastAPI API | `POST /api/es/review/stream`                            |
| 出力          | `progress`, `string_chunk`, `array_item_complete`, `complete`（`review_meta` を含む） |

## 今回の品質基盤

- 設問知識は `backend/app/prompts/es_templates.py` の `TEMPLATE_DEFS` に集約する。全テンプレートが少なくとも `purpose / required_elements / anti_patterns / recommended_structure / evaluation_checks / retry_guidance / company_usage / fact_priority` を持つ。
- rewrite prompt・fallback prompt・validator・retry hint は同じ `TEMPLATE_DEFS` を参照する。新設問やルール修正時に prompt と validator の二重修正を避ける。
- **ガクチカ・志望動機の ES 下書き生成**も `build_template_draft_generation_prompt` 経由で同じ `TEMPLATE_DEFS`（`gakuchika` / `company_motivation`）を参照する。詳細は `docs/features/GAKUCHIKA_DEEP_DIVE.md`・`docs/features/MOTIVATION.md`。
- `basic` を含む既存 9 テンプレートが同じ粒度の spec を持つ。required 系だけに知識を寄せるのではなく、差分は spec の値で表現する。
- 設問タイプ分類は単一ラベルだけでなく、`confidence`・`secondary_candidates`・`rationale`・`recommended_grounding_level` を返す。
- 企業接地は内部的に `none / light / standard / deep` の段階制で扱う。互換のため `company_grounding_policy`（`required / assistive`）も `review_meta` に残すが、prompt 制御は grounding level を主に使う。
- `company_evidence_cards` は raw claim をそのまま使わず、`value_orientation / business_characteristics / work_environment / role_expectation` に正規化して prompt へ渡す。
- fallback rewrite は未使用の定義ではなく、非 length 主因の複合失敗でだけ使う safety path として組み込んだ。`fallback_triggered` / `fallback_reason` を `review_meta` と telemetry に残す。
- `self_pr` / `gakuchika` / `work_values` では、事実保持に加えて個別性保持を prompt 制約として明示する。
- 今回の共通 spec 化の対象は `prompt + validator + retry hint` までであり、`classifier` と `TEMPLATE_RAG_PROFILES` は現状維持とする。


### リクエストがサーバに届いてから返るまで

1. ユーザーが ES 画面で添削を開始すると、フロントは **Next.js** の `POST /api/documents/{id}/review/stream` を呼ぶ。
2. Next は認証・クレジット等を処理したうえで、**FastAPI** の `POST /api/es/review/stream` に同内容を渡し、応答を **SSE（Server-Sent Events）** でクライアントに流し直す。画面に出る進捗バーは、この SSE の `progress` イベントに対応する。
3. FastAPI 側ではまず `**_generate_review_progress`** が動く。ここで入力チェック →（企業があれば）RAG → 本体処理 `**review_section_with_template**` の順に進む。
4. SSE はユーザー体験としては `rewrite → sources → complete` の順で見える。実イベントは `string_chunk(path="streaming_rewrite")` で改善案、`array_item_complete(path="keyword_sources.{n}")` で出典を流し、最後に `complete` で最終結果と `review_meta` を返す。

### ここで止まる（ユーザーにエラーとして返る）例


| 段階    | 条件                        | 結果のイメージ                |
| ----- | ------------------------- | ---------------------- |
| 入力検証  | 本文が空（前後空白のみ含む）            | ストリームでエラー              |
| 入力検証  | 設問タイトルが空                  | ストリームでエラー（設問が必要）       |
| 注入リスク | 高リスクと判定                   | ストリームでエラー（汎用バリデーション文言） |
| リライト  | 規定回数の生成・検証を尽くしても合格案が得られない | ストリームでエラー（内部では 422 扱い） |
| LLM   | リライト呼び出しが 503 相当で失敗       | ストリームでエラー（内部では 503 相当） |


企業 ID が無い場合でも添削は続行できる（設問タイプの制限あり）。企業 ID がある場合は、このあと **企業 RAG（ハイブリッド検索）** で根拠チャンクを取り、プロンプト用のエビデンスカードを組み立てる。無い場合は RAG ステップを実質的にスキップする。

### `review_section_with_template` の中身（rewrite）

この関数が「1 設問分」の添削の中心である。ユーザー向けに返すのは rewrite のみで、内部で safety / grounding のヒントを組み立てるが優先度リストは出さない。

rewrite の設問依存ルールは helper 関数に直書きせず、`TEMPLATE_DEFS` の spec を読んで組み立てる。prompt では主に次を使う。

- `required_elements`
- `anti_patterns`
- `recommended_structure`
- `question_focus_rules`
- `negative_reframe_guidance`
- `playbook`

rewrite 候補は毎回 `**_validate_rewrite_candidate`** で機械検証する。  
ライブ品質ゲート（`backend/app/testing/es_review_live_gate.py` の `evaluate_live_case`）で見る **focus 用トークン**は、`_validate_standard_conclusion_focus` などルータ側の焦点ルールと **同義表現（例: 志望／惹か、参加／体感・機会）**で揃えてある。  
候補本文に `です・ます` が残る場合は、最終検証の前に **安全なだ・である調正規化**を一度だけ掛ける。`rewrite_validation_status=degraded` でベストエフォート採用するときも同じ正規化を通し、不自然な置換を避けながら style fail を減らす。
validator 側も同じ `TEMPLATE_DEFS` の `evaluation_checks` を参照して、`repeated_opening_pattern`、先頭数文の focus、role / company / intern anchor、`negative_self_eval_patterns` を判定する。`self_pr` の自己否定語、`intern_reason` の複合設問、`role_course_reason` の role anchor も spec 側で管理する。
文末記号が欠けた断片文は `fragment` として扱い、`under_min` と混在しない限り length-fix へ逃がさない。

retry は次の順で進む。

1. `strict`
2. `focused retry 1`
3. `focused retry 2`
4. `length-fix`（最大 1 回）
5. `degraded` / 422

focused retry では次の focus mode を使う。

- `length_focus_min`
- `length_focus_max`
- `style_focus`
- `grounding_focus`
- `answer_focus`
- `opening_focus`
- `structure_focus`
- `positive_reframe_focus`

focused retry / length-fix は **単一原因だけでなく複数 failure code を見て、最大 2 つまでの focus mode を同時に組み合わせる**。基本は `length` 1 つ + 非 length 1 つで、例として `under_min + verbose_opening` は `length_focus_min + opening_focus`、`over_max + grounding` は `length_focus_max + grounding_focus` のように扱う。`under_min` を含む複合失敗では **length を主因**として扱い、`opening` / `grounding` は副次修正として扱う。`grounding_focus` は required-centered で、役割 / プログラム軸を先に強く見る。retry hint も `TEMPLATE_DEFS.retry_guidance` を参照し、テンプレ別の橋渡し文言を共通生成する。`length-fix` の final soft は `length` / `style` / `grounding` のみを許可し、通った場合の `length_fix_result` は `soft_recovered`、`rewrite_validation_status` は `soft_ok` になる。required 設問の **150〜220字帯**は短答として潰しすぎないよう、prompt 上は **3〜4文**を基本にし、`under_min` では経験→役割/企業接点→貢献の橋渡し文を **1〜2文**まで補って下限に寄せる。
`negative_self_eval` が主因のときは `positive_reframe_focus` を使い、自己否定語を残したまま best-effort 採用しない。

**まだ改善案が確定しないとき**  

1. **length-fix**（最大 1 回）: 条件を満たす場合だけ、全文を作り直すのではなく **文字数寄りの専用プロンプト**で直す。final soft は `length` / `style` / `grounding` のみを許可する。
2. **degraded 採用**: 規定をすべて試しても厳密合格が無いが、安全基準を満たす最良候補がある場合、その本文を **品質ラベル付き**で返す。
3. それも不可なら **422** で終了する。

**画面への出し方（ストリーミング）**  
実装上、**改善案を `string_chunk` で先に SSE 送出**し、続けて出典リンクを `array_item_complete` で追加し、最後に `complete` を流す。図では「案 → 出典 → 完了」の順に見えるが、表示順もこの順である。

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

企業 URL に加え、**今回リクエストに含めたユーザー由来コンテキスト**（プロフィール / ガクチカ / 同一 ES の他設問）をカードとして先に列挙する。これらは **アプリ内の相対パス**（例: `/profile`, `/gakuchika`, `/es/{document_id}`）を `source_url` に載せ、フロントの `ReferenceSourceCard` は `next/link` で **新しいタブ**に開く（`target="_blank"` / `rel="noopener noreferrer"`）。`document_id` は Next のストリーム API から FastAPI `ReviewRequest` に渡す。

## 企業情報の優先順位

企業根拠は次の順で使う。

1. ユーザーが手動追加した URL / PDF（family-aligned retrieval boost）
2. ユーザーが選択して保存した企業ページ
3. 既存の corporate RAG（ユーザーが選択した公開ソースのみで構成）

`user_provided` は「この資料を見てほしい」という明示意図があるため、ES添削では family-aligned retrieval boost として扱う。  
企業情報取得機能の `official / medium / low` 表示とは別の優先度で、検索語への直前 prepend はしない。

## 処理の流れ

### 1. 入力防御

ユーザー由来のテキスト全体を検査する。

- `high`: prompt 開示要求、参考ES開示要求、個人情報抽出要求、SQL exfiltration
- `medium`: code fence、role prefix、XML風タグ

`high` は遮断、`medium` は sanitize して続行する。

### 2. 企業RAG取得

企業がある場合は hybrid search を使う。見る source family は設問タイプで固定する。

- `company_motivation`: `business_future` → `people_values` → `hiring_role`
- `role_course_reason`: `hiring_role` → `people_values` → `business_future`
- `intern_reason`: `hiring_role` → `people_values` → `business_future`
- `intern_goals`: `people_values` → `hiring_role` → `business_future`
- `post_join_goals`: `business_future` → `people_values` → `hiring_role`
- `self_pr` / `gakuchika` / `work_values` / `basic`: 企業シグナルがあるときだけ `people_values` を補助利用

`user_provided_corporate_urls` は family-aligned retrieval boost として反映する。  
直前に追加された URL / PDF でも、設問タイプに合わない family には boost しない。検索語への prepend や direct context の先頭結合は行わない。

### 3. grounding 判定

required 設問で `role_grounded` とみなすには、少なくとも次の両方が必要。

- `役割 / プログラム` に効く根拠
- `企業理解 / 事業 / 価値観` に効く根拠

片方が欠ける場合は `company_general` に留める。grounding の不足は validator が `grounding` failure code として返し、次の focused retry で `grounding_focus` を使う。

内部では template ごとに推奨 grounding level を持つ。

- `gakuchika`: `none`
- `self_pr`, `work_values`: `light`
- `intern_reason`, `intern_goals`, `post_join_goals`: `standard`
- `company_motivation`, `role_course_reason`: `deep`
- `basic`: 設問文に応じて可変

最終 `effective_grounding_level` は、設問分類結果、字数帯、same-company coverage、mismatch 安全弁を見て下げることはあっても、根拠なしに上げない。

### 4. rewrite 生成

標準経路では rewrite-only を返す。backend で parse / validation を行い、失敗時は focused retry、length-fix、degraded / 422 の順で扱う。

rewrite prompt に入れるものは絞っている。

- 設問と文字数条件
- 元回答
- 選択済み user facts
- 内部ヒント
- 企業根拠カード
- 参考ES由来の quality hints
- `TEMPLATE_DEFS` 由来の `required_elements / anti_patterns / recommended_structure`

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
- `none / light` 設問 (`basic`, `gakuchika`, `self_pr`, `work_values`) は、設問に企業シグナルがない限り企業断定を強めない
- `low-cost` モードでも追加の企業ソース取得は行わず、既存 source だけで続行する
- required 設問では `人・役割軸` と `事業軸` の trusted coverage が不足しているとき、企業固有の断定を抑える
- required 設問では、同一 verified source しか残らない場合でも、1つの excerpt から `事業理解` と `現場期待 / 役割理解` の **別テーマ card** を安全に切り出せるときだけ 2 観点に分解して使う。title が短く primary claim に excerpt を使うケースでも、theme が明確に分かれるなら 2 観点として採用してよい。他社 source や未検証 source を混ぜて件数だけ満たすことはしない

### 6. 検証と再試行

post-check で次を検証する。

- 空文字ではない
- 文字数条件を満たす
- `だ・である調`
- 冒頭が設問に正対し、設問の復唱から始まっていない（`company_motivation` / `role_course_reason` / `intern_goals` / `post_join_goals` は **先頭2文まで**で結論・アンカーを確認し、経験前置き1文＋本答え1文を許容する）
- 箇条書き・列挙調ではない
- 文末が言い切りで終わる（未完了の断片文でない）

rewrite retry は `strict → focused retry 1 → focused retry 2 → length-fix → degraded / 422` で固定する。  
focused retry は常に**最新の failure code 群**に追従して repair plan を作り、必要なら複数 focus mode を同時に選び直す。  
`under_min` は `length_focus_min`、`over_max` は `length_focus_max`、`style` は `style_focus`、`grounding` は `grounding_focus`、`answer_focus` は `answer_focus`、`verbose_opening` は `opening_focus`、`bulletish_or_listlike` / `empty` / `fragment` / `generic` は `structure_focus` を使う。  
全標準モデルで共通 validator を使い、`結論ファースト / answer focus / verbose opening / bulletish` を同じ基準で検証する。  
文字数の strict 受理帯は常に `X-10〜X`（`X = char_max`）に固定する。  
内部目標帯は strict 帯とは別に、`provider/model family`・`char_max` 帯・`original_len / char_max` を見て動的に決める。短答寄りで under-min が出やすいモデルほど上側に寄せ、overflow を起こしやすい局面では下側へ広げる。  
`gpt-5.4-mini` は under-min が連続しやすいため、short / medium / long でより上側の target window を使い、2回連続で under-min がほぼ改善しない場合に加え、**残 shortfall がまだ大きいのに伸び幅が小さい場合**も 3回目の通常 rewrite を飛ばして early length-fix に入る。  
`length-fix` の final soft は `length` / `style` / `grounding` のみを許可し、`bulletish_or_listlike` / `empty` / `fragment` は最後まで strict のままにする。通った結果は `length_fix_result=soft_recovered` と `rewrite_validation_status=soft_ok` で記録する。  
途中の rewrite 段では under-min を受理しない。

非 length 主因の複合失敗では、focused retry の後に safe fallback rewrite を 1 回だけ許容する。これは `build_template_fallback_rewrite_prompt` を実運用に組み込み、`fallback_triggered=true` と `fallback_reason` を `review_meta` に残す。純粋な `under_min / over_max` だけの失敗は従来どおり length-fix に寄せる。

### `review_meta` の追加診断

- `classification_confidence`
- `classification_secondary_candidates`
- `classification_rationale`
- `recommended_grounding_level`
- `effective_grounding_level`
- `misclassification_recovery_applied`
- `fallback_triggered`
- `fallback_reason`
- `grounding_repair_applied`

これらは live/offline 集計で「どのテンプレ・字数帯・モデルで分類救済や fallback が多いか」を見るための診断フィールドである。

## 参考ESの扱い

参考ESは本文の材料には使わない。用途は次だけ。

- quality hints
- coarse skeleton
- 条件付きの統計ヒント

quality hints では全標準モデルに共通で次を要求する。

- 1文目で結論を言い切る
- 3〜4文程度の締まった構成にする
- 各文の役割を分け、同じ内容の言い換えで水増ししない
- 参考群の平均から大きく外れたときだけ、長さ・文数・具体性の追加ヒントを出す
- 参考群のばらつきが大きいときは、型にはめすぎない一文を足す

禁止していること。

- 参考ES本文の引用
- 参考ESを企業根拠として使うこと
- 参考ES由来の事実をユーザー事実として使うこと

## モデル別メモ

- `Claude / GPT / Gemini / low-cost` の4系統だけを current-state とする。
- OpenAI 系は rewrite / length-fix を plain text 契約で使い、空レスポンスを避けるため `prompt_cache_key` と出力フロアを併用する。
- OpenAI の Responses API text 経路では、ES 添削に限って `verbosity="medium"` を明示し、short / medium 帯の under-min を減らす。
- `gpt-5.4-mini` は provider別 length profile で最も強く上側へ寄せる。short / medium / long の gap を狭め、under-min recovery も `X` 近傍を狙う。rewrite の既定温度は **0.16**（他 OpenAI は **0.2**）。`char_max` が大きい設問では rewrite 用 `max_tokens` をわずかに上乗せする（呼び出し回数は増やさない）。
- `gpt-5.4` / `Claude` / `Gemini` も provider別 profile を持つが、`gpt-5.4-mini` ほど aggressive にはしない。
- Gemini は ES 添削で低温固定を避け、provider の標準寄り設定で rewrite 欠落と文字数不足を抑える。**`char_max≥300` 前後の長文**では、rewrite の `max_output_tokens` 相当に **追加の出力余裕**を付与する（同一リクエスト内の上限のみ調整）。
- `low-cost` 導線は `gpt-5.4-mini` を使う。

## UI の要点

- **認証**: ES 添削はログインユーザー向け機能で、guest では実行しない。未ログインまたは guest のときは `ReviewPanel` でログイン導線を出し、Next API も 401 を返す。
- **Free プラン**: モデルは **GPT-5.4 mini 固定**（UI は案内のみ）。**消費クレジットは有料でプレミアムモデルを選んだ場合と同じ表**（6〜20）。`review/stream` が `user_profiles.plan` を見て `llm_model` を `low-cost` に上書きする。
- **Standard / Pro**: `モデル選択` dropdown で `Claude / GPT / Gemini / クレジット消費を抑えて添削` を設問ごとに切り替えられる
- 業界 / 職種 / 設問タイプは dropdown
- 設問タイプ dropdown には、自動判定の推奨結果と短い理由を表示する。ユーザーが明示的に変更した場合はその選択を優先する
- CTA は固定フッター
- 企業選択時は、企業連携状態を `ReviewPanel` 上部の `CompanyStatusBanner` で表示する
- 企業未選択時は、空状態または設問セットアップ文言で「プロフィール / ガクチカを使って添削できる」旨を案内する

### クレジット消費（`calculateESReviewCost`）


| モデル区分                              | 〜500字 | 〜1000字 | 〜1500字 | 1501字〜 |
| ---------------------------------- | ----- | ------ | ------ | ------ |
| Claude / GPT / Gemini              | 6     | 10     | 14     | 20     |
| クレジット消費を抑えて添削（low-cost）            | 3     | 6      | 9      | 12     |
| **Free プラン（実体 mini・クレジットはプレミアム帯）** | **6** | **10** | **14** | **20** |


### クレジット不足ガード

- `ReviewPanel` は auth 未確定中に guest 扱いへ落とさず、クレジット確認中の状態を優先表示する。

### 右パネル内スクロールと自動追尾

- ES 編集画面は `h-screen` + `overflow-hidden` のため、ウィンドウ全体の `scrollTo` はほとんど効かない。
- **添削開始時**は、`isLoading` が true になってストリーミング用 DOM に差し替わった**直後**（`useLayoutEffect`）に次を行う。ボタン押下の同期的な `scrollTo` だけでは、まだセットアップ画面のままのため先頭移動が無効化されやすい。
  1. `ReviewPanel` ルート（`panelRootRef`）に対して `scrollIntoView({ block: "start", behavior: "auto" })` し、親に縦スクロールがある場合でもパネル上端が見えるようにする（モバイルシート等）。
  2. パネル内の `scrollContainerRef`（`overflow-y-auto`）を `scrollTop = 0` で先頭へ戻し、進捗 UI から見失わないようにする。
- **自動追尾**は参照実装寄りの単純方式にする。
  - 開始直後はパネル上端と進捗 UI を見せる。
  - 最初の rewrite / sources が出始めた後は、**表示内容が増えるたびにそのコンテナを `scrollHeight` まで送る**単純な追尾にする。
- **ストリーミング〜再生完了までの自動追尾**は参照実装寄りの単純方式とし、`ResizeObserver` や phase ベースの pause/resume は使わない。
- スクロールコンテナに `**overflow-anchor: none`**（`[overflow-anchor:none]`）を付け、ブラウザの scroll anchoring 由来の誤判定を抑える。
- `sources` の streamed section は静的描画を優先し、スクロール中に縦移動 animation でガタつかせない。

### セットアップ入力のバリデーション表示

- **本文**が **5 文字未満**（前後空白を除く）のときも、業界・職種と同様に `getReviewValidationIssues` の `section_content` として扱い、対象設問カードに赤字枠・本文下のエラー文を出す。閾値は `MIN_REVIEW_SECTION_BODY_CHARS`（`review-panel-validation.ts`）。
- テンプレ名・インターン名・業界・職種などの未充足は `getReviewValidationIssues` で常に計算するが、**赤い枠線・リング・`aria-invalid`・フィールド直下のエラー文**は、`この設問をAI添削` を押してまだ開始できないとき（`setupErrorHighlight`）にだけ出す。セクション全体の**背景色は赤く染めず**、枠・入力・セレクトの境界だけで示す。
- 未ハイライト時はフッターの案内は通常のヒント文のみとし、不足項目の列挙は出さない。ハイライト時は短い指示（赤字の枠内の入力・選択）に加え、先頭の issue メッセージを最大1件だけ併記する。

`ReviewPanel` は `useCredits` の残高と `calculateESReviewCost` を比較し、不足時は添削ボタンを無効化してヒントテキストで案内する。サーバ側の 402 チェックは引き続き必須であり、クライアント側はソフトガードの位置づけ。

### 出典カードの遷移

- 内部リンク (`/profile`, `/gakuchika`, `/es/{document_id}`) を含む出典カードも新しいタブで開く。

## 主要 `review_meta`

- `llm_provider`, `llm_model`
- `review_variant`
- `grounding_mode`, `primary_role`
- `company_evidence_count`, `evidence_coverage_level`
- `retrieval_profile_name`, `priority_source_match_count`
- `reference_hint_count`, `reference_conditional_hints_applied`, `reference_profile_variance`
- `rewrite_generation_mode`, `rewrite_attempt_count`
- `length_policy`, `length_shortfall`, `length_fix_attempted`, `length_fix_result`
- `length_profile_id`, `target_window_lower`, `target_window_upper`
- `source_fill_ratio`, `required_growth`, `latest_failed_length`, `length_failure_code`
- `rewrite_validation_status`
- `token_usage`
  - `input_tokens`, `output_tokens`, `reasoning_tokens`, `cached_input_tokens`
  - `llm_call_count`, `structured_call_count`, `text_call_count`

## テスト

主な回帰テストは以下。

- `backend/tests/es_review/test_es_review_template_rag_policy.py`
- `backend/tests/es_review/test_es_review_template_repairs.py`
- `backend/tests/es_review/test_es_review_quality_rubric.py`
- `backend/tests/es_review/test_es_review_final_quality_cases.py`
- `backend/tests/shared/test_llm_provider_routing.py`
- `backend/tests/es_review/integration/test_live_es_review_provider_report.py`

実 API を使う **Live プロバイダゲート**は **GitHub Actions では実行しない**。開発時にローカルで明示的にコマンドを実行する。手順・環境変数・スイープは `[docs/testing/ES_REVIEW_QUALITY.md](../testing/ES_REVIEW_QUALITY.md)` を参照。

実行例:

```bash
python -m pytest backend/tests/es_review -q
python -m pytest backend/tests/shared/test_llm_provider_routing.py -q
make backend-test-live-es-review
```
