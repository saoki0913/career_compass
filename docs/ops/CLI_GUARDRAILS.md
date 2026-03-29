# CLI Guardrails

Codex が承認なしで使う想定の CLI は、repo 内の安全ラッパーを先に通す。

## 対象 CLI

- `git`
- `gh`
- `vercel`
- `railway`
- `supabase`
- `stripe`
- `modal`
- `hf`
- `huggingface-cli`
- `gcloud`

安全ラッパーは `tools/cli-safe/bin/` にある。使うときは次の PATH を先頭に置く。

```bash
export PATH="/Users/saoki/work/career_compass/tools/cli-safe/bin:$PATH"
```

## 運用ルール

- `develop` にだけ push できる
- `main` への反映は `make deploy` のみ
- `main` push で Vercel / Railway が本番デプロイされる
- 危険操作は CLI レベルで拒否する
- release automation は `scripts/release/` が正本で、必要な provider 操作は script 内で実バイナリを解決して行う

## 許可される代表操作

| CLI | 代表コマンド |
|---|---|
| `git` | `status`, `diff`, `fetch`, `pull`, `checkout develop`, `checkout main`, `push origin develop` |
| `gh` | `auth login`, `repo view`, `pr view`, `pr checks`, `run list`, `run view` |
| `vercel` | `whoami`, `projects ls`, `ls`, `inspect`, `domains ls`, `env ls`, `logs` |
| `railway` | `login`, `whoami`, `status`, `logs`, `variables`, `service` |
| `supabase` | `login`, `projects list`, `status`, `start`, `stop`, `migration list`, `gen types` |
| `stripe` | `login`, `listen`, `trigger`, `events list` |
| `modal` | `token new`, `token set`, `app list`, `deploy`, `logs` |
| `hf` / `huggingface-cli` | `auth login`, `whoami`, `download` |
| `gcloud` | `auth login`, `auth list`, `config list`, `projects list`, `services list` |

## 禁止する代表操作

- `git push origin main`
- `git push --force`
- `git reset --hard`
- `gh repo delete`
- `gh pr create`
- `gh pr merge`
- `vercel deploy --prod`
- `railway up`
- `railway delete`
- `supabase db reset`
- `supabase db push`
- `stripe` のリソース削除系
- `modal` / `hf` / `gcloud` の削除系

## 使うコマンド

- 状態確認: `make ops-status`
- 認証確認: `make ops-auth-check`
- リリース前確認: `make ops-release-check`
- 本番リリース: `make deploy`
- ローカル変更を全部含めて本番リリース: `make deploy-stage-all`
- provider auth baseline: `scripts/release/provider-auth-status.sh --strict`
- bootstrap check: `scripts/bootstrap-career-compass-infra.sh --check`
- secrets inventory sync: `scripts/release/sync-career-compass-secrets.sh --check|--apply`（正本は codex-company `.secrets/career_compass`。`codex-company/.secrets/` 内の実ファイルを直接読まず、一覧・検証はこのスクリプト経由に寄せる）

自然文で `本番にデプロイして` / `本番反映して` / `公開して` / `ship it` / `deploy to production` と依頼された場合は、標準の本番リリース依頼として扱い、明示がなければ `make ops-release-check` → `make deploy-stage-all` を使う。

`gh pr create` / `gh pr merge` / `vercel env add` / `railway variable set` のような操作は、手打ちではなく release scripts 経由の controlled path のみを正本にする。
