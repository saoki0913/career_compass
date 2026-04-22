---
topic: harness
review_date: 2026-04-14
category: harness
supersedes: 2026-04-12-harness-strict-review.md
status: active
---

# Career Compass Claude Harness 厳しめレビュー

> **レビュー日**: 2026-04-14
> **対象**: `docs/ops/AI_HARNESS.md`, `docs/review/harness/*`, `.claude/settings.json`, `.claude/settings.local.json`, `.claude/agents/*`, `.claude/hooks/*`, `.mcp.json`
> **外部基準**:
> - Claude Code settings: https://code.claude.com/docs/en/settings
> - Claude Code hooks: https://code.claude.com/docs/en/hooks
> - Claude Code skills / commands: https://code.claude.com/docs/en/slash-commands
> - Claude Code status line: https://code.claude.com/docs/en/statusline
> - OSS 参照: https://github.com/ChrisWiles/claude-code-showcase , https://github.com/feiskyer/claude-code-settings

## エグゼクティブサマリー

**総合評価: B**

土台は強い。特に `private/agent-pipeline` を正本にした canonical → mirror 設計、`AGENTS.md` の routing、9 hook の基本ガードはかなり整理されている。`AI_HARNESS.md` も、少なくとも「何が正本で、どこを更新すべきか」は明示できている。[docs/ops/AI_HARNESS.md:3](../../ops/AI_HARNESS.md:3) [docs/ops/AI_HARNESS.md:54](../../ops/AI_HARNESS.md:54)

一方で、2026 年の Claude Code 運用として見ると、**安全・観測・prompt入口制御・共有設定**が弱い。特に `settings.local.json` にしか permissions がなく、shared project settings に policy がほぼ乗っていない点、`UserPromptSubmit` や `PermissionRequest` など prompt / permission 系 hook を使っていない点、Notion MCP が実質死蔵されている点は、現状のコスト感と運用成熟度に対して見劣りする。

また、2026-04-12 の既存レビューは一部がすでに stale。現状 repo では `.claude/skills` に 35 skill が存在しているのに、旧レビューは「実在しない skill が多い」と強く断じており、レビュー文書自体の保守が追いついていない。[docs/ops/AI_HARNESS.md:39](../../ops/AI_HARNESS.md:39) [docs/ops/AI_HARNESS.md:146](../../ops/AI_HARNESS.md:146) [docs/review/harness/2026-04-12-harness-strict-review.md:17](./2026-04-12-harness-strict-review.md:17)

## Findings

### High — shared project settings が薄すぎて、運用ポリシーがチーム共有されていない

- **根拠**: shared `.claude/settings.json` は hooks のみで、permissions や deny policy が存在しない。[.claude/settings.json:1](../../../.claude/settings.json:1)
- **根拠**: 一方で `.claude/settings.local.json` には `permissions.allow` があるが、これは個人ローカル設定でありチーム共有されない。[.claude/settings.local.json:1](../../../.claude/settings.local.json:1)
- **根拠**: `AI_HARNESS.md` も project scope と user/local scope の境界を明記している。[docs/ops/AI_HARNESS.md:81](../../ops/AI_HARNESS.md:81)
- **問題**: 重要な安全制御が「存在するが共有されない」状態。別マシン・別メンバーでは再現されず、`/status` 上も project policy として可視化されない。
- **公式比較**: Claude Code settings は shared project settings で `permissions`, `allowedHttpHookUrls`, `statusLine` などを持てる。現状はこのレイヤをほぼ hooks 専用にしか使っていない。
- **推奨**: `settings.json` に最低限の shared policy を移す。候補は `permissions.deny`, `allowedHttpHookUrls`, `statusLine`, 必要なら `agent` や MCP 承認系。`settings.local.json` は個人 override のみに縮める。

### High — prompt 入口の制御がなく、skill / agent 活性化が最初の1手で負けやすい

- **根拠**: 現行 hooks は `PreToolUse`, `PostToolUse`, `SessionStart`, `FileChanged`, `SubagentStart`, `Stop`, `SessionEnd` のみで、`UserPromptSubmit` がない。[.claude/settings.json:2](../../../.claude/settings.json:2)
- **根拠**: `AI_HARNESS.md` でも現行構造として `UserPromptSubmit` を運用対象に含めていない。[docs/ops/AI_HARNESS.md:306](../../ops/AI_HARNESS.md:306)
- **問題**: skill suggestion、session title 付与、prompt validation、危険依頼の入口ブロックを「Claude が最初に道を間違える前」にかけられない。
- **公式比較**: Claude Code hooks は `UserPromptSubmit` で `decision: "block"`、`additionalContext`、`sessionTitle` を返せる。現行ハーネスはここを完全に未使用。
- **OSS比較**: `claude-code-showcase` は `UserPromptSubmit` で skill evaluation を走らせ、キーワード・path・intent から skill を提案する構成を採っている。
- **推奨**: まずは軽量な `UserPromptSubmit` hook を 1 本追加し、`route/path`, `deploy/release`, `security`, `prompt`, `UI` の 5 系統だけでも skill / agent suggestion を出す。最初から LLM 判定 hook にせず、静的ルールで十分。

### High — Notion MCP が repo にあるのに、用途が「人手で見るだけ」へ縮退している

- **根拠**: `.mcp.json` には `notion` が定義されている。[.mcp.json:13](../../../.mcp.json:13)
- **根拠**: しかし `AI_HARNESS.md` は notion を「アプリ実行時の prompt 管理・同期には使わない。必要な場合だけ人手で参照」と定義している。[docs/ops/AI_HARNESS.md:504](../../ops/AI_HARNESS.md:504)
- **根拠**: `prompt-engineer` を含む現行 agent 定義には notion 利用手順がない。[.claude/agents/prompt-engineer.md:13](../../../.claude/agents/prompt-engineer.md:13)
- **問題**: OAuth/接続コストを払いながら、Claude の実働能力にはほぼ寄与していない。MCP surface だけ増やしている。
- **推奨**: 2 択にすべき。
- `prompt-engineer` や `product-strategist` に notion 利用手順を本当に載せる。
- 使わないなら `.mcp.json` から notion を削除し、docs も「未導入」に寄せる。

### Medium — hook はあるが、2026 の official capability を半分以上使えていない

- **根拠**: 現行 event は `PreToolUse`, `PostToolUse`, `SessionStart`, `FileChanged`, `SubagentStart`, `Stop`, `SessionEnd` のみ。[.claude/settings.json:2](../../../.claude/settings.json:2)
- **根拠**: `AI_HARNESS.md` でも hook handler 追加手順は command hook 前提で、JSON decision control や `if` 条件には触れていない。[docs/ops/AI_HARNESS.md:455](../../ops/AI_HARNESS.md:455)
- **問題**:
- `PermissionRequest` がないので、承認要求のメタ運用ができない。
- `PostToolUseFailure` / `StopFailure` がないので、失敗の再試行指針や telemetry が弱い。
- JSON decision control を使っていないので、block/warn の表現力が低い。
- `if` で hook 内フィルタを減らさず、shell 側で毎回判定している。
- **公式比較**: Claude Code hooks は `PermissionRequest`, `PostToolUseFailure`, `StopFailure`, `UserPromptSubmit`, JSON output, `if` 条件をサポートする。
- **推奨**: まず `PermissionRequest`, `PostToolUseFailure`, `UserPromptSubmit` の 3 つを足す。次に `git-push-guard` と `secrets-guard` は JSON decision control へ寄せて、stderr テキスト頼みを減らす。

### Medium — コストは高いのに、コスト観測が弱い

- **根拠**: `AI_HARNESS.md` は opus 11 / sonnet 2 の体制を明記している。[docs/ops/AI_HARNESS.md:99](../../ops/AI_HARNESS.md:99) [docs/ops/AI_HARNESS.md:121](../../ops/AI_HARNESS.md:121)
- **根拠**: ただし計測は `SubagentStart` で `docs/ops/agent-usage.log` に起動記録を残すだけで、token / cost / duration は可視化していない。[docs/ops/AI_HARNESS.md:389](../../ops/AI_HARNESS.md:389)
- **問題**: 「Opus を維持する妥当性」を継続的に説明できない。今の設計は高品質寄りで理解できるが、費用対効果の観測がなく、議論が感覚に寄る。
- **公式比較**: Claude Code は `statusLine` で context usage, costs, git status を常時表示できる。
- **OSS比較**: `feiskyer/claude-code-settings` は `status-line.sh` を repo に持ち、観測を first-class にしている。
- **推奨**: すぐに model を削るのではなく、先に `statusLine` か同等の常時観測を入れる。その上で agent ごとの Opus 維持理由を 1 行ずつ文書化する。

### Medium — 旧レビュー文書が stale で、レビュー資産自体の信頼性を落としている

- **根拠**: 2026-04-12 の既存レビューは「参照スキルの実在性が保証されていない」としているが、現状の `AI_HARNESS.md` では `.claude/skills` は 35 skill と明記され、実体も存在する。[docs/review/harness/2026-04-12-harness-strict-review.md:17](./2026-04-12-harness-strict-review.md:17) [docs/ops/AI_HARNESS.md:39](../../ops/AI_HARNESS.md:39) [docs/ops/AI_HARNESS.md:146](../../ops/AI_HARNESS.md:146)
- **問題**: 「厳しめレビュー」が stale だと、次の設計判断で誤差分に引っ張られる。ハーネスは docs で運用する比重が高いため、この stale は地味に痛い。
- **推奨**: `docs/review/harness` は「履歴」だと割り切るか、最新一本だけを正本化するかを決める。現状は両方の悪いところを取っている。

### Medium — `AI_HARNESS.md` が詳細すぎて、実運用で読むには重い

- **根拠**: 本文は 600 行近くあり、hook dry-run、MCP 方針、PR checklist、件数確認まで 1 ファイルに集約されている。[docs/ops/AI_HARNESS.md:1](../../ops/AI_HARNESS.md:1)
- **問題**: CLAUDE.md を薄くしたのに、運用正本が別の巨大ファイルになっている。必要な節だけ読みたい運用には向かない。
- **OSS比較**: `claude-code-showcase` は `settings.md`, `README`, `agents`, `skills`, `hooks` を分け、設定の人間向け説明を分割している。
- **推奨**: `AI_HARNESS.md` を「overview + policy」に絞り、`HOOKS.md`, `MCP.md`, `SKILLS.md` のように分離する。少なくとも 5 章と 6 章は切り出した方が読みやすい。

### Low — `release-engineer` と `product-strategist` の tool 制限は再点検余地あり

- **根拠**: `release-engineer` は `Read, Bash, Grep, Glob` のみで `Edit` / `Write` を持たない。[.claude/agents/release-engineer.md:4](../../../.claude/agents/release-engineer.md:4)
- **根拠**: `product-strategist` は `WebFetch` を持つが `Bash` を持たない。[.claude/agents/product-strategist.md:4](../../../.claude/agents/product-strategist.md:4)
- **問題**: どちらも意図があれば成立するが、README / docs には制限理由が書かれていない。今後の運用者が「バグか仕様か」を判断しづらい。
- **推奨**: 意図的なら `AI_HARNESS.md` か agent prompt に理由を 1 行追記する。特に release-engineer は「スクリプト修正は別 agent に委譲するため」などが必要。

## 外部比較

### Claude Code 公式と比べて足りないもの

1. **shared settings policy**
   - 公式 settings docs は project-level `settings.json` を team-shared policy の核にしている。
   - 現状は hooks しか shared 化されておらず、permissions / observability は local 依存。

2. **prompt / permission lifecycle hooks**
   - 公式 hooks docs は `UserPromptSubmit`, `PermissionRequest`, `PostToolUseFailure`, `StopFailure` まで含めて agent loop を扱う。
   - 現状は tool 実行前後だけに偏っている。

3. **status line**
   - 公式 status line は cost / context / git status を常時監視するための機能。
   - 現状は session start の 1 回だけ要約して終わる。

### 人気 OSS と比べて足りないもの

1. **skill evaluation**
   - `claude-code-showcase` は `UserPromptSubmit` で skill-eval を走らせる。
   - career_compass は routing 表に強いが、prompt 入口での skill / agent suggestion がない。

2. **observability と settings の明示**
   - `feiskyer/claude-code-settings` は `settings`, `status-line.sh`, `hooks`, `skills`, `agents` を明示的に分けている。
   - career_compass は docs に強く寄っている一方、settings の共有強度が弱い。

3. **maintenance automation**
   - `claude-code-showcase` は PR review や docs sync を GitHub Actions に持ち込んでいる。
   - career_compass は local harness と release automation は強いが、review / docs alignment の定期実行までは未整備。

## 改善計画

### P0

- `.claude/settings.json` に shared policy を追加する
  - `permissions.deny`
  - `allowedHttpHookUrls`（HTTP hook を使うなら）
  - `statusLine`
- `UserPromptSubmit` hook を追加し、最低限の skill / agent suggestion を入れる
- Notion MCP を「使う」か「消す」か決める
- 2026-04-12 の旧レビューを履歴扱いにし、最新レビューへの導線を明示する

### P1

- `PermissionRequest`, `PostToolUseFailure`, `StopFailure` hook を追加する
- JSON decision control と `if` 条件へ徐々に寄せる
- `agent-usage.log` だけでなく、cost / duration の観測を status line か別ログに追加する
- agent ごとの model 選択理由を 1 行ずつ文書化する

### P2

- `AI_HARNESS.md` を分割する
- skill-eval をルールベースから始めて、必要なら prompt hook へ拡張する
- docs sync / harness self-review を GitHub Actions へ載せるか検討する

## 総評

今のハーネスは「雑ではない」。むしろ個人 repo としてはかなり整っている。ただし、強いのは **routing と repo-local guardrail** であって、**shared settings policy / prompt入口制御 / observability** は 2026 標準にまだ届いていない。ここを埋めない限り、ハーネスの成熟度は B 止まりです。
