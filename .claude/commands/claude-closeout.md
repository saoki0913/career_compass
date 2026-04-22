---
description: Claude 作業終了時に strict verification を確認して closeout する。
---

<instructions>
Claude の作業終了時に、次を実行する。

1. `npm run verify:closeout`
2. `bash .claude/hooks/stop-summary.sh`
3. session_id が分かる場合は `bash .claude/hooks/session-end-cleanup.sh` に JSON を渡して cleanup する。
4. 最終回答では、変更点、検証結果、未実施項目だけを短く述べる。

verification が green でない限り、この closeout は完了扱いにしない。
</instructions>
