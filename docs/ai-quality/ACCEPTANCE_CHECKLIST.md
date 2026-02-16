# AI機能 受け入れチェックリスト

## 1. ガクチカ深掘り (`qualityRationale`)
- 深掘り開始後、質問生成時に入力欄上へ「この質問の狙い」が表示される。
- 連続回答時、SSE完了イベントで `qualityRationale` が更新される。
- セッション切替時、前セッションの `qualityRationale` が残留しない。

## 2. 志望動機深掘り (`evidenceSummary`)
- 初回質問取得で `evidenceSummary` が返り、サイドバー「企業根拠サマリー」に表示される。
- 回答送信（SSE）後、`evidenceSummary` が更新される。
- 根拠が無いケースでは説明文（プレースホルダ）が表示される。

## 3. ES添削 (`top3.why_now`)
- 添削結果 `top3` 各項目で `why_now` が存在する。
- 改善リストで「今直すべき理由」が表示される。
- 開発用モック結果でも `why_now` が欠落しない。

## 4. RAG品質（Adaptive Retrieval + Excerpt整形）
- 長文クエリ/短文クエリ/事実照会クエリで retrieval profile が変化する。
- `sources.excerpt` に見出しが付与され、極端な文途中切断が減る。
- 既存のRAG取得が空になる退行がない。

## 5. 実施済み静的検証
- `python -m compileall`（関連backendファイル）: 成功
- `pnpm -s tsc --noEmit`: 成功
