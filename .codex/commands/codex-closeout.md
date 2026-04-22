---
description: Codex 作業終了時に summary と cleanup を行う。
---

<instructions>
Codex の作業終了時に、次を実行する。

1. `bash .codex/hooks/stop-summary.sh`
2. session_id が分かる場合は `bash .codex/hooks/session-end-cleanup.sh` に JSON を渡して cleanup する。
3. 非自明な変更では、必要に応じて `docs/ops/agent-usage.log` を確認する。
4. 最終回答では、変更点、検証結果、未実施項目だけを短く述べる。

この command は repo 状態の見落としを減らすための closeout 導線であり、コミットや push を自動実行しない。
</instructions>
