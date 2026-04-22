# Codex Routing Specs

このディレクトリは Codex 用の人間向け routing spec を置く。runtime で Codex が参照する custom agent の正本は `.codex/agents/*.toml` で、ここは `AGENTS.md` の routing 表を補助するための説明資料として扱う。

運用ルール:
- 変更対象の path / task type が `AGENTS.md` の Subagent Routing 表に一致したら、まず `.codex/agents/*.toml` を確認し、必要に応じて対応する spec を読む。
- spec は `scope`, `trigger`, `skills`, `execution notes` の 4 点を最低限持つ。
- Claude 側の agent 定義を直接編集しない。Codex の runtime 差分は `.codex/agents/` に、補助説明はここに閉じ込める。
- 13 spec の名前は `AGENTS.md` の routing 名とそろえる。
