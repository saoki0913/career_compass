# Billing State Machine

## 目的

AI stream route における課金契約を統一し、二重消費・未消費完了・予約取り残しを防ぐ。

## 基本方針

- 成功時のみ消費する。失敗・abort・永続化失敗ではクレジットまたは無料枠を確定消費しない。
- 長時間処理・SSE・外部 I/O を伴う経路は `reserve -> confirm / cancel` を使う。
- 短時間の direct consume 経路は、永続化成功後にのみ消費する。
- 料金・無料枠・各 feature の単価は [features/CREDITS.md](../features/CREDITS.md) が正本。この文書は状態遷移の契約だけを扱う。

## 共通状態遷移

| 状態 | 課金 | 永続化 | 応答 |
| --- | --- | --- | --- |
| 開始前 | `precheck` / `reserve` | なし | 不足なら 402 |
| FastAPI fetch 開始 | 予約済みまたは未消費 | なし | progress |
| ストリーム中 | なし | なし | progress / chunk |
| `complete` 受信 | 未確定 | save 試行 | 待機 |
| save 成功 | `confirm` / `consumeCredits` | 完了 | enriched `complete` |
| save 失敗 | `cancel` / 未消費 | rollback / no-op | `error` |
| timeout / fetch 例外 | `cancel` / 未消費 | なし | 504 / 502 |
| stream error | `cancel` / 未消費 | なし | `error` |
| client disconnect | なし | なし | 到達不能 |
| `consumeCredits` 失敗 | 失敗ログのみ | save 済み | `complete` + 監視対象 |

## Feature 別

### Motivation

- stream 系は BFF billing policy に従い、成功時のみ確定する。
- save 後に `confirm` または `consumeCredits` を実行する。
- 課金確定失敗は監視対象にする。

### Gakuchika

- `reserve -> confirm / cancel` を使う経路では save 成功後に `confirm` する。
- save 前に direct consume しない。
- 独自 stream 実装でも課金順序は共通契約に従う。

### ES Review

- `reserve` を維持する
- `reserve` は fetch 前に成功していること
- `complete` で `confirm`
- 失敗系はすべて `cancel`
- `fetch` 例外でも `cancel` が必ず走るよう `try/finally` を使う

### Interview

- start / turn / continue / feedback などの長時間 AI 経路は `reserve -> confirm / cancel` を使う。
- drill など予約を使わない経路は [features/INTERVIEW.md](../features/INTERVIEW.md) と実装側 billing policy を正本にする。

## 監視対象

- save success + confirm / consume failure
- reserve success + confirm/cancel 未達
- 同一 request での重複 consume

## 契約テスト

- precheck 失敗時に consume / reserve が走らない
- fetch 例外で ES reservation が cancel される
- save 失敗時に consume が走らない
- stream error 時に consume が走らない
- consume failure 時に save 結果は残り、監視ログが出る
