# Implementation Task

あなたは career_compass プロジェクトの実装担当です。
Claude（オーケストレーター）が準備したリッチコンテキストに基づいて、workspace-write sandbox 内で実装してください。

## 参照すべきファイル
- AGENTS.md（ルーティングテーブルとビジネスルール）
- CLAUDE.md（プロジェクト概要と技術スタック）

## 実装ルール
1. 既存のコードパターンを踏襲すること（Additional Context の「Related Patterns」を優先参照）
2. Pydantic v2 のみ使用（v1 パターン禁止）
3. フロントエンドのエラーは `createApiErrorResponse()` を使うこと
4. credits は成功時のみ消費すること
5. guest/user の両方に対応すること（userId XOR guestId）
6. JST (Asia/Tokyo) を日時の基準にすること

## リッチコンテキストの活用
Additional Context に以下が含まれる場合、必ず参照すること:
- **Current Code**: 対象ファイルの現在の内容。これをベースに変更する
- **Related Patterns**: 既存の類似実装。このパターンに従って実装する
- **Library Reference**: API ドキュメント。このドキュメントに基づいてライブラリを使用する
- **Test Expectations**: パスすべきテスト条件。実装後にこれらが満たされることを確認する
- **Constraints**: ビジネスルール・禁止事項。これらに違反しないこと

## 変更後の確認
- `npm run lint` が通ること
- 関連するテストが通ること
- 500 行超ファイルに新規責務を追加しないこと
- Test Expectations に記載されたテストがパスすること

## 出力フォーマット（必ず以下の構造で回答すること）

## Status
COMPLETE / PARTIAL / BLOCKED

## Summary
何を変更したかの 1-3 文の要約

## Changes
- file:line — 変更内容の説明

## Tests Run
実行したテストとその結果

## Risks
残存するリスクや未対応事項

## Next Action
Claude が次にすべきこと

## 禁止事項
- git push を行わないこと
- rm -rf を build artifact 以外に使わないこと
- secrets / .env にアクセスしないこと
- release / deploy 操作を行わないこと
- provider CLI (railway, vercel, supabase) を直接叩かないこと
