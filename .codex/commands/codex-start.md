---
description: Codex セッション開始時に orientation、guardrail、agent routing をそろえる。
---

<instructions>
Codex で作業を始める前に、次をこの順で実行する。

1. `bash .codex/hooks/session-orientation.sh`
2. 対象が UI なら設計判断が必要な場合に限り `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]` を検討する（必須ではない）。変更後は `npm run lint:ui:guardrails` と `npm run test:ui:review -- <route>` を推奨。
3. 対象変更に応じて `.codex/agents/*.toml` を優先して確認し、必要に応じて `AGENTS.md` と `.agents/agents/*.md` を補助資料として参照する。
4. secrets / release / destructive git 操作を触る場合は `.codex/hooks/secrets-guard.sh` と `.codex/hooks/git-push-guard.sh` のルールを守る。
5. 変更後の検証に使うコマンドを先に決め、必要なら `.codex/config.toml` の verification commands を参照する。

出力は簡潔でよい。branch、dirty files、直近 commit、利用候補 agent を把握できれば十分。
</instructions>
