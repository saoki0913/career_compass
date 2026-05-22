# Hook 安全ゲートマップ

Claude Code / Codex が危険な操作を実行する際に自動で発火するフック（PreToolUse hook）の一覧。
各フックは `pre-tool-dispatcher.sh` からディスパッチされる。

---

## ゲートアーキテクチャ

```
ユーザー/AI のコマンド
    │
    ▼
pre-tool-dispatcher.sh
    │
    ├─ コマンド分類（command-classifier.mjs）
    │
    ├─ 専用ガードが該当する場合
    │    ├─ migration-safety-guard.sh
    │    ├─ production-promotion-guard.sh
    │    └─ secret-apply-guard.sh
    │
    ├─ 汎用リリースガード（上記に該当しない場合）
    │    └─ release-provider-guard.sh
    │
    └─ その他のガード
         ├─ git-push-guard.sh
         ├─ git-branch-guard.sh
         ├─ destructive-rm-guard.sh
         ├─ secrets-guard.sh
         ├─ commit-codex-gate.sh
         ├─ bandaid-guard.sh
         └─ tdd-enforcement-guard.sh
```

**優先順位**: 専用ガード → 汎用ガードの `elif` チェインで、最初にマッチしたガードのみが実行される。
専用ガードは内部で汎用ガードの責務（release-approved checkpoint）も検証する。

---

## Claude Code vs Codex の挙動差分

| 要素 | Claude Code (`.claude/hooks/`) | Codex (`.codex/hooks/`) |
|---|---|---|
| ブロック時の動作 | stderr にメッセージ + exit 2 | JSON `{"decision":"block","reason":"ESCALATION_REQUIRED"}` + exit 2 |
| 確認方法 | AskUserQuestion でユーザーに直接確認 | **確認不可**（Claude Code に制御を返す） |
| checkpoint 作成 | 自分で作成可能 | **作成不可**（Claude Code が事前に作成） |
| checkpoint パス | `~/.claude/sessions/career_compass/` | `~/.codex/sessions/career_compass/` |
| リトライ | ユーザー確認後に再実行 | リトライせず即停止 |

**委譲フロー**: Claude Code が AskUserQuestion → 承認 → 両方のパスに checkpoint 作成 → Codex に委譲 → Codex の hook が checkpoint を検証 → 通過

---

## フック一覧

### デプロイ・リリース系

| フック | トリガー | 自動許可条件 | ブロック条件 | checkpoint |
|---|---|---|---|---|
| `migration-safety-guard.sh` | `run-migrations.mjs`（dry-run なし）、`make deploy-migrate` | pending=0 または全て expand-auto | risky/contract 検出 | `migration-approved-<SESSION_ID>` |
| `production-promotion-guard.sh` | `deploy-production.sh`、`make deploy-production` | なし（常にブロック） | 常に | `production-promotion-approved-<SESSION_ID>` |
| `secret-apply-guard.sh` | `sync-career-compass-secrets.sh --apply` | staging ターゲット | production ターゲット | `secret-apply-approved-<SESSION_ID>` |
| `release-provider-guard.sh` | `make deploy-*`、provider CLI（vercel/railway/supabase）| なし（常にブロック） | 常に | `release-approved-<SESSION_ID>` |

### Git 操作系

| フック | トリガー | 自動許可条件 | ブロック条件 | checkpoint |
|---|---|---|---|---|
| `git-push-guard.sh` | `git push`（全て） | なし | 常に | `push-approved-<SESSION_ID>` |
| `git-branch-guard.sh` | `git branch` 作成 | なし | 常に | `branch-creation-approved-<SESSION_ID>` |
| `commit-codex-gate.sh` | `git commit`（大規模変更） | 変更ファイル数・行数が閾値未満 | 閾値超過 or hotspot | `codex-commit-delegation-<SESSION_ID>` |

### コード品質系

| フック | トリガー | 自動許可条件 | ブロック条件 | checkpoint |
|---|---|---|---|---|
| `bandaid-guard.sh` | Edit/Write でコードファイル編集 | テストファイル内の免除パターン | `@ts-ignore`, `as any`, `console.log`, `TODO` 等 | `bandaid-approved-<SESSION_ID>` |
| `tdd-enforcement-guard.sh` | Edit/Write で実装ファイル編集 | テストファイルがセッション内で編集済み | テスト未編集 | なし（hard block） |
| `prompt-edit-confirm-guard.sh` | Edit/Write でプロンプトファイル編集 | なし | 常に | `prompt-review-confirmed-<SESSION_ID>` |

### セキュリティ系

| フック | トリガー | 自動許可条件 | ブロック条件 | checkpoint |
|---|---|---|---|---|
| `secrets-guard.sh` | Read/Bash で `.secrets/`, `.env*`, `*.pem` 等 | なし | 常に | なし（hard deny） |
| `destructive-rm-guard.sh` | `rm -rf`（非ホワイトリスト） | `node_modules`, `.next`, `dist` 等 | その他全て | なし（hard deny） |
| `permission-request-guard.sh` | PermissionRequest レベル | なし | 上記全ての操作 | なし（deny） |

### テスト・品質ゲート系

| フック | トリガー | 自動許可条件 | ブロック条件 | checkpoint |
|---|---|---|---|---|
| `test-category-gate.sh` | テストランナー実行 | なし | テストカテゴリ未選択 | `test-categories-<SESSION_ID>` |
| `codex-delegate-gate.sh` | `delegate.sh plan_review/post_review` | なし | 常に | `codex-plan-review-approved-<SESSION_ID>` |

---

## checkpoint の共通仕様

全 checkpoint は `scripts/harness/diff-snapshot.mjs` で生成する JSON ファイル。

### 共通フィールド

```json
{
  "schemaVersion": 1,
  "kind": "<checkpoint-type>",
  "decision": "<approved|verified|reviewed-proceed|...>",
  "releaseMode": "<staging|production|migration-risky|...>",
  "headSha": "<git HEAD at creation time>",
  "stagedDiffHash": "<hash of staged changes>",
  "createdAt": "<ISO 8601 timestamp>"
}
```

### 検証ルール

- `headSha` が現在の HEAD と一致すること（コミット後は無効化される）
- `stagedDiffHash` が現在の staged diff と一致すること
- `diff-snapshot.mjs verify --project <dir> --file <checkpoint>` で検証

### セッションスコープ

checkpoint は SESSION_ID にスコープされる:
- Claude Code: `CLAUDE_CODE_SESSION_ID` 環境変数
- Codex: Codex セッション ID

セッション終了時に `session-end-cleanup.sh` が checkpoint ファイルを削除する。

---

## dispatcher の実行フロー

`pre-tool-dispatcher.sh` 内の Bash case での実行順序:

```
1. secrets-guard         — 機密パス読み取りの検出
2. git-push-guard        — git push の検出
3. git-branch-guard      — ブランチ作成の検出
4. destructive-rm-guard  — rm -rf の検出
5. migration-safety-guard   ← 新規（専用ガード）
6. production-promotion-guard ← 新規（専用ガード）
7. secret-apply-guard       ← 新規（専用ガード）
8. release-provider-guard    — 汎用リリースガード（5-7 に該当しない場合のみ）
9. commit-codex-gate      — git commit の検出
10. test-category-gate    — テストランナーの検出
11. codex-delegate-gate   — Codex 委譲の検出
```

5-8 は `elif` チェイン。それ以外は独立した `if` ブロック（複数発火可能）。
