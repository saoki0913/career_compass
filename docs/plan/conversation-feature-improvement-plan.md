# 3機能改善計画: ガクチカ・志望動機・面接対策

> 作成日: 2026-05-11
> ステータス: 計画策定完了・実装待ち

## 1. 背景と目的

ガクチカ作成・志望動機作成・面接対策の3機能について、ユーザーから多数の改善要望が出ている。調査の結果、一部は修正済み、一部は未修正と判明した。ガクチカと志望動機はUXフローを統一しつつ共通化可能な箇所を共通化し、面接対策は独立フローを維持しつつ確認シートのリッチUI化を行う。

### ユーザーとの設計合意事項

| 項目 | 決定内容 |
|------|---------|
| UXフロー統一スコープ | ガクチカ + 志望動機のみ。面接は独立維持 |
| 志望動機スロット順序 | 半固定（推奨順序ありだがLLMが柔軟に選択可能） |
| 進捗UI | 常に2列 + ステップバー |
| 面接ヒント | fallback精度向上（LLM必須にはしない） |
| 確認シート形式 | リッチUI表示 + DL対応 |
| 確認シート内容 | 現状の全情報 + 見やすく整理 |

---

## 2. 修正済み（対応不要）

調査の結果、以下の4件は既に修正済みであることを確認した。

| 課題 | 確認結果 |
|------|---------|
| 面接: `motivation_fit` 等の内部名がUIに出る | `labelWeakestQuestionType()` でマッピング済み |
| 面接: 15問前後の質問バジェット | soft min 12, hard max 18 で実装済み |
| 面接: 確認シート基本機能 | commit `5cc9d3aa` で Markdown 版実装済み |
| 志望動機: 会話の記憶 | 全会話履歴をバックエンドに渡し済み。20問超でHaiku要約 |

---

## 3. 新規発見の課題

調査中に以下の未報告課題を発見した。

| 課題 | 詳細 |
|------|------|
| 面接: 進捗バーに内部トピック名が表示 | `coveredTopics` / `remainingTopics` に `motivation_fit`, `role_understanding` 等の英語キーがそのまま `ConversationProgressBar` に渡されている。`labelWeakestQuestionType()` はフィードバック表示用であり、進捗バーのトピックラベルには適用されていない |

---

## 4. アーキテクチャ概要

### 共通基盤

| コンポーネント | パス | 役割 |
|---|---|---|
| `ConversationSidebar` | `src/components/chat/ConversationSidebar.tsx` | 3機能共通のサイドバーシェル。進捗バー、フェーズ、バッジ、リセットボタンを統合 |
| `ConversationProgressBar` | `src/components/chat/ConversationProgressBar.tsx` | 進捗ピル表示。`columns` prop でグリッド列数を制御 |
| `DraftPreviewModal` | `src/components/chat/DraftPreviewModal.tsx` | ES下書きプレビュー。ガクチカ・志望動機で共用 |
| `conversation-lifecycle.ts` | `src/lib/shared/conversation-lifecycle.ts` | 4段階フェーズ（questioning → draft_ready → deep_dive → completed）の共通定義 |

### 機能別構成

```
ガクチカ:
  UI:         GakuchikaConversationSidebar.tsx
  Controller: useGakuchikaConversationController.ts (620行, 30+ state変数)
  ViewModel:  useGakuchikaViewModel.ts
  BFF:        src/bff/gakuchika/[id]/conversation/{stream,resume}/route.ts
  Backend:    backend/app/routers/gakuchika.py, backend/app/prompts/gakuchika_*.py

志望動機:
  UI:         MotivationConversationSidebar.tsx (337行)
  Controller: useMotivationConversationController.ts
  PostDraft:  useMotivationPostDraftState.ts (350行)
  BFF:        src/bff/motivation/routes/[companyId]/{generate-draft,stream}/route.ts
  Backend:    backend/app/services/motivation/{facade,draft,summarize}.py

面接対策:
  UI:         InterviewPageContent.tsx (427行, 単一コンポーネント)
  Progress:   src/lib/interview/ui.ts
  Planning:   backend/app/routers/_interview/planning.py
  Sheet:      src/lib/interview/sheet-builder.ts (Markdown版)
```

---

## 5. Phase 0: 共通インフラ改善（全タスクの前提）

### 0-1. ConversationProgressBar の2列レイアウト固定 [S]

**問題**: ガクチカは `progressColumns={4}` を渡しており、狭い幅で4列→2列のレイアウトジャンプが発生する。志望動機は `progressColumns={STAGE_ORDER.length}` (=6) で同様の問題が起きる。

**方針**: 常に2列グリッドで固定し、安定したレイアウトを保証する。

**変更ファイル:**
- `src/components/chat/ConversationProgressBar.tsx` — `getGridStyle` でアイテム数 >= 4 のとき default を 2 に変更
- `src/components/gakuchika/GakuchikaConversationSidebar.tsx:86` — `progressColumns={4}` → `progressColumns={2}`
- `src/components/motivation/MotivationConversationSidebar.tsx:274` — `progressColumns={STAGE_ORDER.length}` → `progressColumns={2}`（6要素を2列3行で安定表示）

### 0-2. Draft品質フィードバックのDB永続化 [M]

**問題**: `generatedDraftQuality` が React state (`useState`) のみで管理されている（`useGakuchikaConversationController.ts:90`）。ページ移動で消失する。

**方針**: ConversationState に `draftQuality` フィールドを追加し、DB往復で保持する。

**変更ファイル:**
- `src/lib/gakuchika/conversation-state.ts` — `ConversationState` 型に `draftQuality` フィールド追加（nullable）。`safeParseConversationState` / `serializeConversationState` で往復
- `src/features/gakuchika/hooks/useGakuchikaConversationController.ts` — `generateDraft` 成功時に draftQuality を conversationState にもパッチ。`fetchConversation` で復元
- `backend/app/normalization/gakuchika_payload.py` — `draft_quality` をパススルーフィールドとして追加
- 志望動機側: motivation の conversationContext にも同パターンで `draftQuality` を追加

**後方互換**: nullable フィールドのため既存データは `null` で安全。

### 0-3. DraftPreviewModal のサイズ拡大 [S]

**問題**: 現在の `max-w-6xl` / `max-h-[min(92vh,920px)]` が狭く、長文ESの閲覧に不便。

**変更**: `src/components/chat/DraftPreviewModal.tsx:320`
- `max-w-6xl` → `max-w-7xl`
- `max-h-[min(92vh,920px)]` → `max-h-[min(94vh,960px)]`

---

## 6. Phase 1: ガクチカ修正

### 1-1. 品質検証メッセージのUI非表示化 [S]

**問題**: 「品質検証 (fact_preservation): 警告レベルです」等のバックエンド内部メッセージがチャットUIに表示される。

**方針**: フロントエンドのストリームアダプターとdraftQuality warningsの両方でフィルタリングする。

**変更ファイル:**
- `src/features/gakuchika/hooks/gakuchika-stream-adapter.ts` — `complete` ハンドラで `coachProgressMessage` から「品質検証」「fact_preservation」「内部テスト」パターンを除去
- `src/features/gakuchika/hooks/useGakuchikaConversationController.ts:458` — `data.draftQuality.warnings` 配列から内部メッセージをフィルタ
- 推奨: `backend/app/routers/gakuchika.py` でユーザー向け warnings と内部 diagnostics を分離

### 1-2. LLMの会話忘却防止（プロンプト強化） [S]

**問題**: LLMが「何に取り組んでいたか教えてください」と既出の内容を再質問する。会話履歴はバックエンドに渡されているが、プロンプトに既確認事項の明示的なリストがない。

**方針**: バックエンドプロンプトに「既に確認した項目」リストを明示的に注入する。

**変更ファイル:**
- `backend/app/prompts/gakuchika_prompt_builder.py` — ユーザーメッセージに `already_discussed_topics` セクションを追加。`resolved_focuses` と `asked_focuses` をリスト化して「以下のトピックは既に確認済みです。再度聞かないでください」と明記
- `backend/app/prompts/gakuchika_prompts.py` — `QUESTION_TONE_AND_ALIGNMENT_RULES` に「既出トピックの再質問禁止」ルールを追加

### 1-3. 進捗と質問のズレ修正 [M]

**問題**: バックエンドの `focusKey` がLLM質問テキスト生成前に設定されるため、実際の質問内容と進捗ピルの "current" 表示がズレることがある。

**方針**: 質問テキスト生成後にキーワードベースで `focusKey` を再整合する。

**変更ファイル:**
- `backend/app/normalization/gakuchika_payload.py` — `_infer_focus_from_question_text(question: str) -> FocusKey | None` 関数を追加
  - 質問テキスト中のSTAR要素キーワード（状況/背景, 課題/困難, 行動/取り組み, 結果/成果）で判定
  - 不整合時のみ `focus_key` を上書き
  - 保守的実装: 複数キーワードマッチが必要。確信度低い場合は元の値を維持

**テスト**: ユニットテスト必須。各STARキーワードの判定精度を検証

### 1-4. resolvedFocuses のDB往復でのリセット防止 [S]

**問題**: resume操作後にconversationStateの進捗（resolvedFocuses配列）が突然リセットされることがある。BFF resume ルートでFastAPIから返される新stateがDB既存値を上書きする際に配列が喪失する。

**方針**: BFF resume ルートで新旧stateのマージ時に配列フィールドを和集合（union）マージする。

**変更ファイル:**
- `src/bff/gakuchika/[id]/conversation/resume/route.ts` — FastAPIからの新 `conversationState` と DB の既存値をマージする際、`resolvedFocuses`, `askedFocuses` は union-merge（既存値 + 新規値の重複排除和集合）
- 既存の `buildConversationStatePatch` を活用して null-late-wins パターンを維持

### 1-5. 「深堀りを続ける」が動作しない問題 [M]

**問題**: `resumeSession()` がFastAPI通信失敗時にユーザーに何も表示しない。UIが無反応に見える。

**方針**: エラー時のフォールバック応答とシステムメッセージ表示を追加する。

**変更ファイル:**
- `src/bff/gakuchika/[id]/conversation/resume/route.ts` — FastAPI失敗時に 503 ではなくデグレード応答（`nextAction: "ask"` + エラーガイドメッセージ）を返す
- `src/features/gakuchika/hooks/useGakuchikaConversationController.ts:342` — `onError` コールバックでチャットにシステムメッセージを挿入し、テキスト入力を再有効化

### 1-6. 下書き破棄→深掘り再開の二重質問 [M]

**問題**: `discardDraftAndResumeSession()` 後に `pausedQuestion`（下書き前に保留されていた質問）と resume で取得した新規質問が両方チャットに表示される。

**方針**: discard時にpausedQuestionをクリアし、resume時に重複チェックを追加する。

**変更ファイル:**
- `src/bff/gakuchika/[id]/discard-generated-draft/route.ts` — discard時に `conversationState.pausedQuestion = null` もDBに書き込む
- `src/bff/gakuchika/[id]/conversation/resume/route.ts` — 新しい質問が最後のassistantメッセージと同内容なら重複追加をスキップ
- `src/features/gakuchika/hooks/useGakuchikaConversationController.ts:364` — discardの中間状態で `pausedQuestion` を null にセット

**依存**: 1-5 の理解が前提

### 1-7. ES生成可→深掘り切り替え時の会話引き継ぎ [S]

**問題**: `es_building` → `deep_dive` への切り替え時にコンテキストが適切に引き継がれない感覚がある。

**方針**: BFF resume ルートの状態遷移ロジックを整理し、`draftText` の有無でルーティングが正しく動作していることを検証・修正する。

**変更ファイル:**
- `src/bff/gakuchika/[id]/conversation/resume/route.ts` — `pausedQuestion` あり + `draftText` ありのケースで `deepdiveStage` と `stage` の設定が正しいことを検証。バックエンドへのリクエストに `previous_stage` を含め、プロンプトが文脈を引き継げるようにする

---

## 7. Phase 2: 志望動機修正

### 2-1. 409 Conflict エラーの改善（再生成時） [M]

**問題**: 追加質問なしにES再生成すると、同じ品質問題で409 Conflictが返り続ける。ユーザーが改善手段を持たないまま行き詰まる。

**根本原因**: `is_regeneration=True` でも品質ゲートの閾値が同一。同じ入力 + 同じ temperature では同じ品質問題が再現する。

**方針**: 再生成時のみ temperature を上昇させ、品質ゲートを警告レベルに緩和する。

**変更ファイル:**
- `backend/app/services/motivation/draft.py` — `is_regeneration=True` 時に temperature を 0.3 → 0.45 に上昇。品質ゲート失敗時、再生成なら 409 ではなく warning 付きで draft を返す
- `src/bff/motivation/routes/[companyId]/generate-draft/route.ts` — 409 レスポンスのエラーメッセージを改善（具体的な補足ガイドを表示）

### 2-2. CausalGapSteps の内部変数名表示修正 [S]

**問題**: `MotivationConversationSidebar.tsx:83` で `SLOT_PILL_LABELS[gap.slot as SlotKey] || gap.slot` のフォールバックにより、未マッピングのスロット名（`self_connection` 等）がそのまま表示される。

**方針**: フォールバックラベルを完全化し、生の英語キーが絶対に表示されないようにする。

**変更ファイル:**
- `src/components/motivation/MotivationConversationSidebar.tsx:83` — fallback チェーンを `SLOT_PILL_LABELS[gap.slot as SlotKey] || SLOT_SIDEBAR_LABELS[gap.slot] || "追加確認"` に変更
- `src/features/motivation/domain/ui.ts` — `closing` や deep-dive 固有の gap 識別子に対応するラベルを追加

### 2-3. 深掘り中の進捗表示改善 [M]

**問題**: deepdive中に `causalGaps` が空だと進捗ピルもギャップステップも表示されず、UIが停滞して見える。

**根本原因**: `progressStages` useMemo (`MotivationConversationSidebar.tsx:200-209`) が `isDeepDive && causalGaps.length > 0` のとき空配列を返し、gaps が 0 のときはスロットピルに戻るが、deepdive 中のスロットピルは意味をなさない。

**方針**: 3つの状態を明確にハンドリングする。

**変更ファイル:**
- `src/components/motivation/MotivationConversationSidebar.tsx:200-210` — 分岐ロジックを3パターンに:
  1. `isDeepDive && causalGaps.length > 0` → CausalGapSteps（現状維持）
  2. `isDeepDive && causalGaps.length === 0` → 「補強ポイントを全て確認しました」の完了インジケーター
  3. `!isDeepDive` → スロット進捗ピル（現状維持）
- フェーズバーが deepdive → completed に正しく遷移するよう `toStandardPhase` を検証

### 2-4. ES作成直後のHaiku呼び出し調査・修正 [S]

**問題**: ES作成直後に Claude Haiku 4.5 が呼ばれる。不要な API コスト。

**根本原因**: `summarize.py` が draft 生成時にも会話要約を実行する。`conversation_context` が `None` で渡されるとキャッシュ (`msg_count_at_summary` キー) が保存されず、次回また要約が走る。

**方針**: 会話コンテキストを適切に渡してキャッシュを有効化する。

**変更ファイル:**
- `backend/app/services/motivation/facade.py` — `maybe_summarize_older_messages` 呼び出し時に `conversation_context` を `None` ではなく実際の辞書を渡し、キャッシュを永続化
- `src/hooks/motivation/useMotivationPostDraftState.ts` — draft 生成成功後の副作用チェーンを検証（`nextQuestion: null` が返るため再質問は発生しないはずだが、不要な refetch トリガーの有無を確認）

### 2-5. 会話フローの自然化（半固定スロット順序） [L]

**問題**: 6スロットが固定順序（`industry_reason` → `company_reason` → ... → `differentiation`）で、学生の回答に関わらず機械的に次スロットに進むため会話が不自然に飛ぶ。

**方針**: 推奨順序を維持しつつ、LLMが会話の流れに応じてスロットを柔軟に選択可能にする。

**変更ファイル:**
- `backend/app/prompts/motivation_prompts.py` — スロット埋めセクションを再設計:
  - 推奨順序: 業界関心 → 企業理由 → 自分との接点 → やりたい仕事 → 貢献 → 差別化
  - 柔軟ルール:「学生の回答が自然に別スロットに触れた場合、そのスロットに遷移してよい」
  - 遷移ガイドライン: 各スロット間の自然な接続フレーズ例を提供
  - 前の回答の引用:「前の回答で触れた〇〇について」パターンを強制
- `backend/app/services/motivation/planner.py` または該当ルーター — スロット選択ロジックを更新。`filled`/`pending` に加えて「会話の流れスコア」を考慮
- フロントエンドは変更最小限（StageStatus の current/completed/pending は既に任意順序対応）

**依存**: Phase 2 の他タスクが安定してから実施。最大リスクのタスク。

---

## 8. Phase 3: 面接対策改善

### 3-1. 進捗UIの内部トピック名ラベル化 [S]（新規発見）

**問題**: `coveredTopics` / `remainingTopics` に `motivation_fit`, `role_understanding` 等の内部キーがそのまま `ConversationProgressBar` に表示されている。

**注意**: `labelWeakestQuestionType()` はフィードバック表示用であり、進捗バーには適用されていない。

**方針**: 進捗バー専用のラベルマッピング辞書を追加する。

**変更ファイル:**
- `src/lib/interview/ui.ts` — `TOPIC_DISPLAY_LABELS` 辞書を追加（20+ エントリ）:
  - `motivation_fit` → "志望動機"
  - `role_understanding` → "職種理解"
  - `company_fit` → "企業適合"
  - `case_fit` → "ケース適合"
  - `life_narrative_core` → "自分史の核"
  - その他全トピックキーをカバー
- `buildInterviewTopicStages()` の `label: topic` を `label: TOPIC_DISPLAY_LABELS[topic] ?? topic` に変更

### 3-2. 回答ヒントのfallback精度向上 [M]

**問題**: `_NEXT_QUESTION_HINT_BY_FOLLOWUP_STYLE` が8エントリのみ。`FOLLOWUP_STYLE_POLICY` には多数のスタイルが定義されているが、ヒント辞書がカバーしていないスタイルではヒントが出ない。

**方針**: スタイル辞書を拡充し、トピック別ヒントも追加する。

**変更ファイル:**
- `backend/app/routers/_interview/planning.py:957-973` — 不足エントリを追加:
  - `theme_choice_check`: テーマ選択の根拠ヒント
  - `value_change_check`: 価値観変化の言語化ヒント
  - `company_reason_check`: 企業固有接続ヒント
  - その他 `FOLLOWUP_STYLE_POLICY` 内の全スタイルをカバー
- 同ファイルに `_NEXT_QUESTION_HINT_BY_TOPIC` 辞書を追加。`topic_id` に基づくトピック別ヒント
  - 例: `motivation_fit` → "志望理由の核を1文で言い切ってから補足してみてください"
- `_fallback_next_question_hint` を拡張: スタイルヒント → トピックヒント の優先順位で合成

### 3-3. 質問数ターゲットの微調整 [S]

**問題**: 現在の soft min 12 / hard max 18 では 15問前後への収束が弱い。

**方針**: soft min 12 → 13, hard max 18 → 17 に変更。ターゲットの 15問 前後により強く収束させる。

**変更ファイル:**
- `backend/app/routers/_interview/planning.py:54-55` — `QUESTION_SOFT_MIN = 13`, `QUESTION_HARD_MAX = 17`

### 3-4. 確認シートのリッチUI + DL対応 [L]

現在は Markdown 版のみ（commit `5cc9d3aa`）。リッチUIコンポーネントとPDFダウンロードを追加する。

#### 3-4a. 構造化データモデル [M]

**方針**: Markdown に加え、JSON 構造化データも保存する。UIレンダリング用。

**変更ファイル:**
- `src/lib/interview/sheet-builder.ts` — `InterviewSheetData` 型を定義し `buildInterviewSheetData()` 関数を追加（既存 Markdown 関数は維持）
- `src/lib/db/schema.ts` — `interviewFeedbackHistories` テーブルに `sheetDataJson: jsonb` カラム追加（nullable、後方互換）
- `drizzle_pg/` — マイグレーション追加
- `src/app/api/companies/[id]/interview/sheet/route.ts` — 両形式で保存・返却
- `src/lib/interview/persistence-feedback.ts` — `saveInterviewFeedbackSheet` に `sheetDataJson` パラメータ追加

#### 3-4b. SheetViewer リッチUIコンポーネント [L]

**新規ファイル:**
- `src/components/interview/SheetViewer.tsx` — セクション構成:
  1. ヘッダー（企業名、生成日時、設定バッジ）
  2. スコアテーブル（7軸、2列グリッド、スコアバー + 根拠 + エビデンスピル）
  3. 総合コメント
  4. 良かった点 / 改善点 / 一貫性リスク（タブまたはスタック）
  5. Q&A（折りたたみ可能、初期は閉じた状態）
  6. 言い換え例（最弱設問 vs 改善例のサイドバイサイド）
  7. 次の準備点（番号付きアクションアイテム）
  8. フッター（設問タイプ、前提一致度）
- `src/components/interview/SheetViewerDialog.tsx` — フルスクリーンダイアログ + ツールバー（DL / 印刷ボタン）

**既存ファイル変更:**
- `src/components/interview/InterviewPageContent.tsx:415` — 「保存済み」→「確認シートを表示」ボタンに変更。SheetViewerDialog を統合

**依存**: 3-4a 完了後

#### 3-4c. PDF生成 + DL [M]

**方針**: html2canvas + jspdf でクライアントサイド生成。動的 import でバンドルサイズ影響を最小化。

**新規ファイル:**
- `src/lib/interview/sheet-pdf.ts` — `generateSheetPDF(sheetData)` 関数
- SheetViewer に `@media print` CSS を追加（A4最適化、影/ボーダー除去、ページブレーク制御）

**パッケージ追加**: `jspdf`, `html2canvas`（動的 import）

**依存**: 3-4b 完了後

---

## 9. 実行順序とタスク依存

```
Phase 0 (並列可能):
  0-1 進捗2列固定 [S]
  0-2 品質フィードバック永続化 [M]
  0-3 モーダルサイズ [S]

Phase 1 (Phase 0完了後、内部は並列可能):
  1-1 品質メッセージ非表示 [S]        ─ 独立
  1-2 会話忘却防止 [S]               ─ 独立
  1-3 進捗ズレ修正 [M]              ─ 独立
  1-4 resolvedFocuses保持 [S]       ─ 独立
  1-5 深堀り再開修正 [M]            ─ 独立
  1-6 二重質問修正 [M]              ─ 1-5の理解後
  1-7 ステージ切替引き継ぎ [S]       ─ 1-5と関連

Phase 2 (Phase 0完了後、Phase 1と並列可能):
  2-1 409エラー改善 [M]             ─ 独立
  2-2 内部変数名修正 [S]            ─ 独立
  2-3 深掘り進捗表示 [M]            ─ 独立
  2-4 Haiku呼び出し修正 [S]         ─ 独立
  2-5 会話フロー自然化 [L]          ─ Phase 2の他タスク完了後

Phase 3 (Phase 0完了後、Phase 1-2と並列可能):
  3-1 トピックラベル化 [S]          ─ 独立
  3-2 ヒントfallback改善 [M]        ─ 独立
  3-3 質問数調整 [S]               ─ 独立
  3-4a データモデル [M]             ─ 独立
  3-4b SheetViewer UI [L]          ─ 3-4a完了後
  3-4c PDF生成 [M]                ─ 3-4b完了後
```

---

## 10. サイズ別サマリ

| サイズ | タスク数 | タスク一覧 |
|--------|---------|-----------|
| S (1-2h) | 10 | 0-1, 0-3, 1-1, 1-2, 1-4, 1-7, 2-2, 2-4, 3-1, 3-3 |
| M (4-6h) | 8 | 0-2, 1-3, 1-5, 1-6, 2-1, 2-3, 3-2, 3-4a, 3-4c |
| L (8-12h) | 3 | 2-5, 3-4b |

**合計**: 21 タスク（修正済み4件 + 新規発見1件を含む全件対応）

---

## 11. リスクと対策

| # | リスク | 影響 | 対策 |
|---|--------|------|------|
| 1 | ConversationState スキーマ変更 (0-2) | 既存会話データとの互換 | `draftQuality` は nullable。既存データは `null` で安全。変更前の会話データでE2E検証 |
| 2 | focusKey 再整合 (1-3) | キーワードマッチ不正確 → 進捗表示が逆に悪化 | 保守的実装: 複数キーワードマッチ時のみ上書き、単一マッチは元値維持。ユニットテスト必須 |
| 3 | 二重質問除去 (1-6) | false positive で正当な新質問を抑制 | discard+resume フローからのみ除去ロジックを適用（汎用的に適用しない） |
| 4 | 409 緩和 (2-1) | temperature 上昇で品質低下 | 再生成時のみ 0.3→0.45 の小幅上昇。致命的でない品質問題は warning として返却 |
| 5 | 会話フロー再設計 (2-5) | **最大リスク**: 進捗トラッキングの決定論的振る舞いが崩れる | StageStatus のコントラクトは変更しない。ライブ会話で十分なテスト。Phase 2 の他タスク安定後に着手 |
| 6 | PDF生成 (3-4c) | html2canvas の日本語レンダリング品質 | ブラウザフォントをそのまま使用。`@media print` CSS でフォールバック保証。バンドルサイズは動的 import で対策 |

---

## 12. 検証方法

### 共通チェック
- `npx tsc --noEmit` で型チェック
- `npm run lint` で lint パス
- E2E: `make test-e2e-functional-local` で該当 feature のリグレッションなし

### ガクチカ
- [ ] 会話開始 → STAR要素の進捗が常に2列表示であること
- [ ] 5問以上の会話 → 既出トピックの再質問がないこと
- [ ] ES生成 → 品質フィードバック表示 → ページ遷移 → 戻る → フィードバックが保持されていること
- [ ] ES生成 → 深堀り再開 → 質問が1つだけ表示されること
- [ ] 進捗ピルの "current" が質問内容と一致していること
- [ ] 品質検証メッセージがチャットUIに表示されないこと

### 志望動機
- [ ] 会話開始 → 自然な流れで質問が進むこと（業界→企業→接点の大きな流れ維持）
- [ ] ES再生成（追加質問なし）→ 409 ではなく warning 付きドラフトが返ること
- [ ] 深掘りフェーズの CausalGapSteps で内部変数名が表示されないこと
- [ ] 深掘り完了後（gaps = 0）→ 完了インジケーターが表示されること
- [ ] モーダルサイズが拡大されていること

### 面接対策
- [ ] 進捗バーに日本語トピックラベルが表示されること
- [ ] 全 followup_style でヒントが表示されること
- [ ] 確認シート保存 → リッチUI表示 → PDF DL が動作すること
- [ ] 13-17問の範囲で面接が終了すること

---

## 13. Codex 委譲推奨タスク

以下のタスクは変更量が大きく、Codex MCP への委譲を推奨する:

| タスク | 理由 | 推奨エージェント |
|--------|------|-----------------|
| 2-5 会話フロー自然化 | プロンプト再設計 + バックエンドプランナー変更。反復テストが必要 | `prompt-engineer` + `fastapi-developer` |
| 3-4b SheetViewer UI | 新規大型コンポーネント（8セクション構成） | `ui-designer` |
| 3-4c PDF生成 | 新規ユーティリティ + パッケージ追加 | `nextjs-developer` |
| 0-2 品質フィードバック永続化 | フロント・BFF・バックエンド横断 | `nextjs-developer` + `fastapi-developer` |
