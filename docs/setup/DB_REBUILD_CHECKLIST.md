# ローカルDB再設計・再作成チェックリスト

**最終更新**: 2026-04-12

**この文書の目的**: `career_compass` のローカル開発DBを破棄して再設計・再作成するときに、判断漏れや schema drift を避けるための実務用チェックリストをまとめます。

**前提**:
- 対象は **ローカル開発DB**（`DATABASE_URL=127.0.0.1:54322` など）
- 開発データの消失は許容
- source of truth は **`src/lib/db/schema.ts` + `drizzle_pg/`**
- アプリ実行時の接続先は `DATABASE_URL`、Drizzle CLI は設定次第で `DIRECT_URL` を使う

---

## 1. 再作成の判断基準

次のいずれかに当てはまるなら、ローカルDBを個別修復するより再作成を優先してよい。

- migration は通るが、実行時に `column does not exist` が複数テーブルで出る
- `db:push` が列追加と列削除を同時に要求し、差分が広がっている
- `text -> jsonb` のような型変更が複数世代ぶん未反映で、手当てが連鎖しそう
- `DATABASE_URL` と `DIRECT_URL` の向き先が曖昧で、どのDBを直しているか信用できない
- local only の検証環境であり、seed から作り直した方が早い

再作成に入る前に、次の 3 点だけは固定する。

- source of truth を `schema.ts` と `drizzle_pg/` に寄せる
- ローカルでは `DIRECT_URL` を空にするか、`DATABASE_URL` と同一にする
- 今後の通常運用は `db:migrate` ベースに戻し、`db:push` は初期再構築や緊急修復時に限定する

---

## 2. この repo 向けの DB 再作成チェックリスト

### 2.1 事前確認

- [ ] `.env.local` の `DATABASE_URL` がローカルDBを向いている
- [ ] `.env.local` の `DIRECT_URL` が空、または `DATABASE_URL` と同じ向き先になっている
- [ ] `src/lib/db/index.ts` が `DATABASE_URL` 固定であることを理解している
- [ ] `drizzle.config.ts` が `DIRECT_URL || DATABASE_URL` 優先であることを理解している
- [ ] ローカルDBを消しても困らないことを確認している
- [ ] seed で最低限復元したいデータ（テストユーザー、企業、応募、締切など）を整理している

### 2.2 設計確認

- [ ] owner モデルは `userId` / `guestId` の XOR を維持する
- [ ] `company`, `application`, `deadline`, `task` の親子関係を再確認する
- [ ] `text` で持っている JSON ライクな列は `jsonb` に統一するか判断済み
- [ ] 認証・課金・通知・カレンダー連携の本番要件を壊さない
- [ ] RAG/検索系の外部ストア（ChromaDB/BM25）は Postgres 外であることを認識している

### 2.3 再作成前の性能確認

- [ ] dashboard の主要 read パスを洗い出した
- [ ] `tasks(user_id, status)` / `tasks(guest_id, status)` の複合 index 要否を確認した
- [ ] `deadlines(company_id, due_date)` / `deadlines(is_confirmed, completed_at, due_date)` を確認した
- [ ] `applications(company_id)` / `companies(user_id)` / `companies(guest_id)` を確認した
- [ ] `motivation_conversations(company_id, user_id|guest_id)` の unique 制約を確認した
- [ ] 「画面で必要な列だけ select する」方針に変えるべき箇所を把握した

### 2.4 再作成前のセキュリティ確認

- [ ] `mypagePassword` など資格情報の保存方針を見直した
- [ ] ローカルでも secrets をコードに直書きしない
- [ ] guest/user の owner 判定を DB 制約と API の両方で守る
- [ ] 将来の client direct access を考え、RLS の適用方針を決めた
- [ ] 監査ログや重要な履歴（課金、クレジット消費）を安易に JSON に埋め込まない

### 2.5 再作成後の確認

- [ ] `/dashboard` が `tasks` / `deadlines` で落ちない
- [ ] motivation 会話開始 / stream / draft 生成が通る
- [ ] companies / applications / deadlines / tasks の CRUD が通る
- [ ] guest と user の両フローが通る
- [ ] `npm run test:unit` の DB 依存テストが通る

---

## 3. 再設計時に見直すべきテーブル一覧

### 優先度 A: いまの障害に直結しているテーブル

#### `deadlines`

見直し観点:
- `google_*` 列、`statusOverride`、`autoCompletedTaskIds` の責務が明確か
- Google ミラー状態と業務上の締切状態を同じテーブルで持つ妥当性
- `completedAt` と `statusOverride` の整合
- dashboard / calendar 用 index が足りているか

推奨:
- 同期状態列は維持してよいが、画面クエリでは必要列だけ取る
- `status_override` は enum と runtime derived 状態の境界を文書化する

#### `tasks`

見直し観点:
- `dependsOnTaskId`, `isBlocked`, `templateKey` を本当にテーブル列として持つべきか
- `deadlineId` との関係と、自動生成タスクのライフサイクル
- open task を引く主要クエリに index が足りているか

推奨:
- 少なくとも `user_id + status`, `guest_id + status`, `deadline_id` の query path を基準に設計
- 依存関係を使うなら self-FK と index を最初から baseline に含める

### 優先度 B: drift を起こしやすい会話系テーブル

#### `motivation_conversations`

見直し観点:
- `messages`, `motivationScores`, `conversationContext`, `lastEvidenceCards`, `stageStatus` の `jsonb` 化を前提化するか
- 旧 `text` 列の名残を完全に切れるか
- 最新の会話状態を 1 row に集約し続けるか

推奨:
- 現行方針どおり `jsonb` を使ってよい
- ただし検索・分析したい属性は個別列として残す

#### `interview_conversations`, `interview_feedback_histories`

見直し観点:
- `jsonb` 列が多く、型変更 drift が起きやすい
- 更新頻度が高いので row サイズが肥大化しすぎていないか

推奨:
- 高頻度更新 JSON は用途ごとに分離する
- 大きい配列を持つなら履歴テーブルへの分離を検討する

### 優先度 C: owner / multi-tenant 安全性に関わるテーブル

#### `companies`

見直し観点:
- `userId` / `guestId` XOR 制約
- 資格情報列（`mypagePassword`）の取り扱い
- `status`, `sortOrder`, `isPinned` の UI 依存度

推奨:
- XOR 制約は維持
- 機微情報は暗号化前提。不要なら保存自体をやめる

#### `applications`, `submission_items`, `documents`, `gakuchika_contents`

見直し観点:
- company 配下の owner モデルが冗長かどうか
- `userId` / `guestId` を各テーブルに持つ理由が query 性能と owner 検証に見合っているか

推奨:
- API 側の owner check を簡単に保つため、現行の owner 列重複は大きく崩さない
- ただし FK と index は明示的に設計し直す

### 優先度 D: 運用・課金テーブル

#### `credits`, `credit_transactions`, `subscriptions`

見直し観点:
- 成功時のみ消費ルールを DB で破りにくくできているか
- idempotency / webhook 二重処理耐性

推奨:
- `credit_transactions` は append-only を維持
- 一意制約・外部イベントIDを使って二重計上を防ぐ

#### `notification_settings`, `calendar_settings`, `calendar_sync_jobs`

見直し観点:
- 設定値、ジョブ状態、外部同期状態が分離されているか
- JST 基準ルールを壊さないか

推奨:
- 設定テーブルとジョブテーブルの責務分離を維持
- 時刻列はすべて `timestamptz` 前提にする

---

## 4. baseline 作成の具体手順

この repo では、**ローカルDBを一度クリーンにして、`schema.ts` と `drizzle_pg/` に揃った baseline を作る**ことを指す。

### 4.1 推奨方針

- ローカルDBは捨てる
- `DATABASE_URL` を唯一の真実にして初期反映する
- baseline 完成後にのみ seed を入れる
- 以降は `db:migrate` を基本運用に戻す

### 4.2 手順

#### 手順 1: 接続先を固定する

`.env.local` を次のどちらかにする。

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=
```

または

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

重要:
- ローカルでは `DIRECT_URL` を別DBに向けない

#### 手順 2: ローカル Supabase を停止・破棄する

```bash
supabase stop --no-backup
```

必要に応じて Docker volume も整理する。

```bash
docker volume prune -f
```

#### 手順 3: ローカル Supabase を起動し直す

```bash
supabase start
```

起動後、`.env.local` の `DATABASE_URL` ポートが実際の `DB URL` と一致していることを確認する。

#### 手順 4: baseline を反映する

ローカルではまずアプリと同じ接続先に対して反映する。

```bash
npm run db:push:as-app
```

注意:
- これは初回再構築用
- 以後の通常変更は migration に戻す

#### 手順 5: schema と実DBが一致しているか確認する

最低限、次のテーブルで主要列が存在することを確認する。

- `tasks.depends_on_task_id`
- `tasks.is_blocked`
- `tasks.template_key`
- `deadlines.status_override`
- `motivation_conversations.messages` が `jsonb`
- `motivation_conversations.conversation_context` が `jsonb`

#### 手順 6: baseline 後に migration 運用へ戻す

次からの変更は次の順序を守る。

```bash
npm run db:generate
npm run db:migrate:as-app
```

ローカルでは `db:push` を日常運用にしない。

#### 手順 7: seed / smoke を入れる

最低限の seed 対象:
- test user / guest
- 1 company
- 1 application
- 1 deadline
- 1 open task
- motivation conversation の最小 row

最小 smoke:
- `/dashboard`
- `/companies`
- motivation 開始API
- task/deadline 関連 API

---

## 5. パフォーマンス設計の観点

- dashboard は「最新・未完了・期限近いもの」を読む。`status`, `due_date`, `completed_at`, owner 列の複合 index を先に決める
- `jsonb` は柔軟だが、filter / sort / join の主軸には使わない
- 会話テーブルの 1 row 集約は更新頻度が高い。肥大化するなら履歴と現在状態を分ける
- `select({ task: tasks })` のような丸ごと取得は drift と過剰取得の両方を招く。主要 loader は必要列だけ選ぶ

---

## 6. セキュリティ設計の観点

- owner 制約は DB (`check owner xor`) と API の両方で持つ
- 機微情報は保存しないか、保存するなら暗号化前提
- guest の識別は browser-visible header ではなく cookie を正とする現行方針を崩さない
- 課金・クレジット・Webhook は append-only / idempotent を優先する
- RLS は今すぐ必須ではなくても、将来の直接アクセスに備えた防御線として設計余地を残す

---

## 7. 再作成後に必ず確認すること

- [ ] `/dashboard` が落ちない
- [ ] `tasks` / `deadlines` の loader が正常に返る
- [ ] motivation conversation の start / stream / generate draft が通る
- [ ] guest と user の両方で owner 判定が崩れていない
- [ ] 開発DBの接続先が `DATABASE_URL` と一致している
- [ ] 次回の schema 変更で `db:generate -> db:migrate:as-app` が通る

---

## 8. この文書の使い方

1. まず「再作成の判断基準」で本当に DB を捨てるべきか確認する
2. 次に「見直すべきテーブル一覧」で設計論点を洗い出す
3. 最後に「baseline 作成の具体手順」を上から順に実行する

この順序を飛ばすと、再作成後に再び drift しやすい。
