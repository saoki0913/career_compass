---
topic: pre-release-foundation
plan_date: 2026-05-03
status: 進行中
---

# 本番前基盤改善計画

**根拠レビュー**: セキュリティ、DB、FastAPI、Next BFF、RAG、Post-CA、検証戦略の横断レビュー
**目標**: 本番リリース前にセキュリティ、保守性、DB、性能、RAG、検証基盤の release blocker をすべて完了する
**委譲先**: architect / security-auditor / database-engineer / fastapi-developer / nextjs-developer / rag-engineer / test-automator / code-reviewer

## 1. リリースポリシー

- P0 / P1 / P2 の全 track を `releaseBlocker: true` とし、すべて完了するまで本番リリースしない。
- 実装順は P0 → P1 → P2 で固定する。P1/P2 を先行して進める場合も、P0 の blocker を解消しない限り release ready にしない。
- 状態更新の正本は `docs/plan/PLAN_EXECUTION_TASKS.json`。手作業のメモだけで `done` にしない。
- 完了ループは `check-plan-release-readiness -> 最上位 blocker を in_progress -> 実装/検証 -> evidence 追加 -> done/blocked -> 再チェック` とする。

## 2. 外部基準との対応

- OWASP Top 10 2025
  - Broken Access Control: owner check、guest/user identity、tenant isolation。
  - Security Misconfiguration: CSP、trusted origins、rate-limit fallback、secret inventory。
  - Supply Chain Failures: dependency cleanup、direct dependency 化、deadcode gate。
  - Security Logging and Alerting Failures: structured requestId、Server-Timing、SSE/LLM/RAG telemetry。
  - Mishandling of Exceptional Conditions: structured API errors、SSE timeout/cancel、success-only credit rollback。
- OWASP LLM Top 10 2025
  - Prompt Injection / Sensitive Information Disclosure: RAG source contract、reference ES consent、tenant leakage audit。
  - Excessive Agency / Insecure Output Handling: LLM request budget、JSON repair/fallback 制限、structured error。
  - Vector and Embedding Weaknesses: Chroma/BM25 tenant filter、metadata validation、default-on gate。

## 3. P0 Workstreams

| ID | 目的 | 完了条件 |
|---|---|---|
| `release-gate-repair-p0` | release gate 自体の破損を直す | `test:release-critical` が削除済み `_shared` を参照せず PASS。Remotion scripts / dependencies の扱いが確定 |
| `plan-status-automation-p0` | タスク状態更新を機械化する | updater / checker が JSON schema、required gates、release blockers を検証し、unit test が PASS |
| `post-ca-deadcode-triage-p0` | CA 後の残骸を release blocker として整理する | `make deadcode` の backend ruff / Knip findings を削除 / entry / intentional ignore に分類し、hard gate 化 |
| `security-bff-hardening-p0` | API error、identity、owner、CSRF、課金境界を固定する | raw error と browser-visible `x-device-token` 正本 route が残らず、release critical / CSRF / security scan が PASS |
| `fastapi-sse-llm-budget-p0` | SSE/LLM の timeout、cancel、budget を統一する | ES / Motivation / Gakuchika / Interview の cancel・timeout・error contract が pytest で固定 |
| `rag-production-readiness-p0` | RAG の漏洩・品質・BM25同期を release gate 化する | ローカル fixture の RAG readiness gate が skip 不可、metadata contract と tenant leakage audit が PASS、default-off matrix と reference ES dry-run evidence が記録済み |
| `db-high-load-readiness-p0` | migration と高負荷 DB 安全性を固定する | `node scripts/dev/check-db-high-load-readiness.mjs` で journal / index / JSONB preflight / rollback のローカル静的 gate が PASS し、EXPLAIN evidence が揃う |

## 4. P1/P2 Workstreams

| ID | 目的 | 完了条件 |
|---|---|---|
| `performance-observability-p1` | read-heavy API と LLM/SSE/RAG の観測性を揃える | requestId、feature、actor_kind、latency、timeout、fallback、cancelled が追える |
| `db-query-performance-p1` | deadline / company / task loader を DB-side bounded query 化する | targeted Vitest と EXPLAIN で read rows / latency 改善を確認 |
| `large-module-and-runbook-p2` | 大型モジュール分割と運用 runbook を閉じる | 対象 >1000 行ファイルの分割方針・実装・feature regression が完了 |

## 5. Evidence Schema

`PLAN_EXECUTION_TASKS.json` の新規 track は以下を持つ。

```json
{
  "id": "security-bff-hardening-p0",
  "priority": "P0",
  "releaseBlocker": true,
  "status": "todo",
  "requiredGates": [
    { "id": "csrf-check", "command": "node scripts/security/check-api-route-csrf.mjs", "required": true }
  ],
  "evidence": [
    {
      "gateId": "csrf-check",
      "command": "node scripts/security/check-api-route-csrf.mjs",
      "status": "passed",
      "completedAt": "2026-05-03T00:00:00+09:00",
      "evidencePath": null,
      "notes": "PASS"
    }
  ],
  "releaseBlockers": [],
  "e2eFunctional": {
    "requiredFeatures": [],
    "manifestPaths": [],
    "snapshotHash": null,
    "status": "not_required"
  }
}
```

## 6. Global Gates

- `bash scripts/test-review-tracker.sh`
- `node tools/check-plan-release-readiness.mjs --json`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:architecture`
- `make deadcode`
- `npm run test:release-critical`
- `bash security/scan/run-lightweight-scan.sh --staged-only --fail-on=critical`
- `make ops-release-check`

## 7. 運用ルール

- `done` は required gate の `passed` evidence が揃うまで禁止。
- `blocked` は `releaseBlockers[]` に理由を必ず残す。
- E2E scope が必要な feature は、該当 local AI manifest が current かつ passed であることを evidence に残す。
- soft fail / judge fail を許容する場合は、checkpoint と理由を evidence に残す。
