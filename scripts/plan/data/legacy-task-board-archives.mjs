export const legacyTaskBoardArchives = [
  {
    "sourcePlan": "company-info-deadline-extraction-improvement-plan.md",
    "file": "company-info-phase0-tasks.json",
    "data": {
      "tasks": [
        {
          "id": "CI-001",
          "title": "Create backend/app/utils/jst.py",
          "status": "Done"
        },
        {
          "id": "CI-002",
          "title": "T-02 KeyError crash fix",
          "status": "Done"
        },
        {
          "id": "CI-003",
          "title": "T-01 TypeScript JST fixes",
          "status": "Done"
        },
        {
          "id": "CI-004",
          "title": "T-01 Python JST fixes",
          "status": "Done"
        },
        {
          "id": "CI-005",
          "title": "T-05 HTML table structure preservation",
          "status": "Done"
        },
        {
          "id": "CI-006",
          "title": "T-03 Task generation idempotency",
          "status": "Done"
        },
        {
          "id": "CI-007",
          "title": "T-04 Task rollback fix",
          "status": "Done"
        },
        {
          "id": "CI-008",
          "title": "Verification",
          "status": "Done"
        }
      ]
    }
  },
  {
    "sourcePlan": "monitoring-logging-incident-response-plan.md",
    "file": "monitoring-release-readiness-tasks.json",
    "data": {
      "schemaVersion": 1,
      "plan": "monitoring-release-readiness",
      "scope": "#17 release minimum",
      "statusValues": [
        "Todo",
        "Doing",
        "Blocked",
        "Review",
        "Done"
      ],
      "completionCriteria": [
        "All repo-scoped tasks are Done.",
        "External-only checks are documented with owner and manual steps.",
        "Sentry error boundary capture is no-op when DSNs are absent.",
        "Sentry event scrubbing removes raw headers, URL query/hash, breadcrumb data outside the allowlist, and prompt-like payloads.",
        "CLI verification results and remaining provider warnings are recorded in docs.",
        "docs/plan/execution-order.md is updated last with the actual release-readiness result.",
        "Focused verification and git diff checks pass before commit."
      ],
      "lastUpdated": "2026-05-10",
      "tasks": [
        {
          "id": "MRR-001",
          "status": "Done",
          "priority": "P0",
          "area": "Task Tracking",
          "task": "Create machine-readable task tracker and updater",
          "evidence": [
            "docs/plan/monitoring-release-readiness-tasks.json",
            "scripts/plan/update-monitoring-release-readiness-task-status.mjs"
          ],
          "acceptanceCriteria": "Task states can be updated without hand-editing JSON formatting.",
          "updatedAt": "2026-05-09",
          "notes": "Task tracker and updater added."
        },
        {
          "id": "MRR-002",
          "status": "Done",
          "priority": "P0",
          "area": "CLI Verification",
          "task": "Record current release monitoring readiness from CLI checks",
          "evidence": [
            "docs/ops/MONITORING_SETUP.md",
            "docs/release/PRODUCTION.md"
          ],
          "acceptanceCriteria": "Vercel, Railway health, Sentry projects, secrets check, robots, and sitemap results are documented with remaining warnings.",
          "updatedAt": "2026-05-09",
          "notes": "CLI baseline and remaining warnings documented."
        },
        {
          "id": "MRR-003",
          "status": "Done",
          "priority": "P0",
          "area": "Frontend Observability",
          "task": "Capture product route error boundary exceptions in Sentry",
          "evidence": [
            "src/app/(product)/error.tsx",
            "src/lib/observability/client.ts"
          ],
          "acceptanceCriteria": "Product error boundary sends sanitized boundary metadata to Sentry and keeps user-facing UI unchanged.",
          "updatedAt": "2026-05-09",
          "notes": "Product error boundary now captures via Sentry adapter."
        },
        {
          "id": "MRR-004",
          "status": "Done",
          "priority": "P0",
          "area": "Frontend Observability",
          "task": "Add root global-error boundary with Sentry capture",
          "evidence": [
            "src/app/global-error.tsx",
            "src/lib/observability/client.ts"
          ],
          "acceptanceCriteria": "Root rendering errors are captured without exposing raw error details in UI.",
          "updatedAt": "2026-05-09",
          "notes": "Root global-error boundary added."
        },
        {
          "id": "MRR-005",
          "status": "Done",
          "priority": "P0",
          "area": "Privacy",
          "task": "Harden Sentry event scrub allowlist",
          "evidence": [
            "src/lib/sentry-sanitize.ts",
            "src/lib/sentry-sanitize.test.ts"
          ],
          "acceptanceCriteria": "Sentry scrub removes URL query/hash, raw headers, breadcrumb data outside the allowlist, and prompt-like values.",
          "updatedAt": "2026-05-09",
          "notes": "Sentry scrub allowlist hardened for request URL, headers, query, and breadcrumb data."
        },
        {
          "id": "MRR-006",
          "status": "Done",
          "priority": "P0",
          "area": "Docs",
          "task": "Document release-minimum monitoring state and manual follow-ups",
          "evidence": [
            "docs/ops/MONITORING_SETUP.md",
            "docs/release/PRODUCTION.md"
          ],
          "acceptanceCriteria": "Docs distinguish completed release-minimum checks from deferred Loki, Crons, rollback automation, and deep health work.",
          "updatedAt": "2026-05-09",
          "notes": "Manual follow-ups and release-minimum state documented."
        },
        {
          "id": "MRR-007",
          "status": "Done",
          "priority": "P0",
          "area": "Execution Order",
          "task": "Update execution-order.md last",
          "evidence": [
            "docs/plan/execution-order.md"
          ],
          "acceptanceCriteria": "Execution order reflects the completed monitoring release minimum and explicitly deferred post-release monitoring work.",
          "updatedAt": "2026-05-09",
          "notes": "Execution order updated with monitoring release minimum and deferred P1+ scope."
        },
        {
          "id": "MRR-008",
          "status": "Done",
          "priority": "P0",
          "area": "Verification",
          "task": "Run focused verification and fix regressions",
          "evidence": [
            "npm run test:unit -- src/lib/sanitize.test.ts src/lib/sentry-sanitize.test.ts src/lib/logger.test.ts src/lib/observability/client.test.ts src/app/(product)/error.test.tsx src/app/global-error.test.tsx",
            "npm run lint"
          ],
          "acceptanceCriteria": "Focused tests, static checks, dead-code check, and git diff checks pass or failures are documented with a blocking reason.",
          "updatedAt": "2026-05-09",
          "notes": "Focused tests, backend sanitizer/health tests, lint, security scan, and git diff --check completed. npx tsc --noEmit is blocked by existing unrelated dirty worktree errors in src/bff/billing/es-review-stream-policy.test.ts and src/lib/stripe/config.test.ts."
        },
        {
          "id": "MRR-009",
          "status": "Done",
          "priority": "P0",
          "area": "Docs",
          "task": "Align release monitoring docs to Sentry-first policy",
          "evidence": [
            "docs/ops/MONITORING_SETUP.md",
            "docs/release/PRODUCTION.md",
            "docs/release/EXTERNAL_SERVICES.md",
            "docs/plan/execution-order.md"
          ],
          "acceptanceCriteria": "Docs make Sentry the primary release monitoring tool, remove comprehensive UptimeRobot setup as a release blocker, and keep UptimeRobot only as optional redundancy.",
          "updatedAt": "2026-05-10",
          "notes": "Docs aligned to the user-approved Sentry-first monitoring policy; UptimeRobot is optional redundancy only."
        },
        {
          "id": "MRR-010",
          "status": "Done",
          "priority": "P0",
          "area": "Docs",
          "task": "Record Railway shared-domain Sentry uptime limitation and defer backend monitors",
          "evidence": [
            "docs/ops/MONITORING_SETUP.md",
            "docs/release/PRODUCTION.md",
            "docs/release/EXTERNAL_SERVICES.md",
            "docs/plan/execution-order.md"
          ],
          "acceptanceCriteria": "Docs state that frontend uptime monitor reached 200 check-ins, backend Railway generated-domain monitors are blocked by Sentry domain-wide limit, and backend Sentry uptime is deferred until a custom backend domain is configured.",
          "updatedAt": "2026-05-10",
          "notes": "Sentry rejected additional uptime monitors for *.railway.app due to the domain-wide limit. Backend /health and /health/ready remain curl-verified on the Railway generated domain, but Sentry uptime monitoring is deferred to the final ops pass after configuring a custom backend domain such as api.shupass.jp."
        }
      ]
    }
  },
  {
    "sourcePlan": "monitoring-logging-incident-response-plan.md",
    "file": "monitoring-release-final-tasks.json",
    "data": {
      "title": "#17 Monitoring Phase 0 final release tasks",
      "updatedAt": "2026-05-05",
      "statusValues": [
        "Todo",
        "In Progress",
        "Blocked",
        "Review",
        "Done"
      ],
      "completionCriteria": [
        "All tasks in this file are Done or explicitly documented as Blocked with a follow-up owner.",
        "Shared TypeScript and Python sanitizers are covered by focused tests.",
        "Sentry initialization is no-op when DSNs are absent and uses recursive PII scrubbing when enabled.",
        "Public health responses do not expose provider key configuration.",
        "Monitoring setup docs list external services, allowed telemetry fields, and known deferred work.",
        "Focused verification, static checks, and git diff checks pass before commit.",
        "docs/plan/execution-order.md is updated last with the actual implementation result."
      ],
      "tasks": [
        {
          "id": "MON-P0-001",
          "status": "Done",
          "priority": "P0",
          "area": "Task Tracking",
          "task": "Create machine-readable task tracker and updater",
          "evidence": [
            "docs/plan/monitoring-release-final-tasks.json",
            "scripts/plan/update-monitoring-task-status.mjs"
          ],
          "acceptanceCriteria": "Task states can be updated without hand-editing JSON formatting.",
          "updatedAt": "2026-05-05"
        },
        {
          "id": "MON-P0-002",
          "status": "Done",
          "priority": "P0",
          "area": "PII Scrub",
          "task": "Extract TypeScript sanitizer and connect frontend logger",
          "evidence": [
            "src/lib/sanitize.ts",
            "src/lib/logger.ts",
            "src/lib/sanitize.test.ts",
            "src/lib/logger.test.ts"
          ],
          "acceptanceCriteria": "Nested headers, cookies, tokens, emails, and prompt-like payloads are redacted or dropped in log payloads.",
          "updatedAt": "2026-05-05"
        },
        {
          "id": "MON-P0-003",
          "status": "Done",
          "priority": "P0",
          "area": "PII Scrub",
          "task": "Extract Python sanitizer and connect backend logger",
          "evidence": [
            "backend/app/utils/sanitizer.py",
            "backend/app/utils/secure_logger.py",
            "backend/tests/observability/test_sanitizer.py",
            "backend/tests/shared/test_secure_logger.py"
          ],
          "acceptanceCriteria": "Backend structured logs use shared redaction for nested extras and known sensitive patterns.",
          "updatedAt": "2026-05-05"
        },
        {
          "id": "MON-P0-004",
          "status": "Done",
          "priority": "P0",
          "area": "Sentry",
          "task": "Add privacy-first Sentry initialization for Next.js and FastAPI",
          "evidence": [
            "instrumentation-client.ts",
            "src/instrumentation.ts",
            "sentry.server.config.ts",
            "sentry.edge.config.ts",
            "backend/app/observability/sentry_setup.py"
          ],
          "acceptanceCriteria": "Replay is disabled, DSN absence is safe, and beforeSend scrubs request, breadcrumb, and exception data.",
          "updatedAt": "2026-05-05"
        },
        {
          "id": "MON-P0-005",
          "status": "Done",
          "priority": "P0",
          "area": "Health",
          "task": "Reduce public readiness response details",
          "evidence": [
            "backend/app/routers/health.py",
            "backend/tests/shared/test_health.py"
          ],
          "acceptanceCriteria": "Readiness status does not expose provider key configured booleans or secret-derived details.",
          "updatedAt": "2026-05-05"
        },
        {
          "id": "MON-P0-006",
          "status": "Done",
          "priority": "P0",
          "area": "External Monitoring",
          "task": "Document UptimeRobot and Sentry production setup",
          "evidence": [
            "docs/ops/MONITORING_SETUP.md",
            "docs/release/EXTERNAL_SERVICES.md",
            "docs/ops/OBSERVABILITY.md"
          ],
          "acceptanceCriteria": "Docs list monitor targets, allowed telemetry, required env vars, and deferred SSL/heartbeat work.",
          "updatedAt": "2026-05-05"
        },
        {
          "id": "MON-P0-007",
          "status": "Done",
          "priority": "P0",
          "area": "Verification",
          "task": "Run focused verification and fix regressions",
          "evidence": [
            "npm run test:unit -- src/lib/sanitize.test.ts src/lib/logger.test.ts",
            "pytest backend/tests/observability/test_sanitizer.py backend/tests/shared/test_secure_logger.py backend/tests/shared/test_health.py -q",
            "npx tsc --noEmit",
            "npm run lint",
            "git diff --check"
          ],
          "acceptanceCriteria": "Focused tests and static checks pass or failures are documented with a blocking reason.",
          "updatedAt": "2026-05-05"
        },
        {
          "id": "MON-P0-008",
          "status": "Done",
          "priority": "P0",
          "area": "Execution Order",
          "task": "Update execution-order.md last",
          "evidence": [
            "docs/plan/execution-order.md"
          ],
          "acceptanceCriteria": "Execution order reflects completed Phase 0 monitoring work and deferred follow-up tasks.",
          "updatedAt": "2026-05-05"
        }
      ]
    }
  },
  {
    "sourcePlan": "maintainability-clean-architecture-roadmap.md",
    "file": "maintainability-clean-architecture-tasks.json",
    "data": {
      "schemaVersion": 1,
      "title": "Maintainability review and implementation loop tasks",
      "scope": "maintainability-review-to-zero-high-findings",
      "lastUpdated": "2026-05-08",
      "statusValues": [
        "Todo",
        "Doing",
        "Blocked",
        "Review",
        "Done"
      ],
      "completionCriteria": [
        "All tasks in this file are Done.",
        "Initial maintainability review documentation exists under docs/review/.",
        "Implementation changes address every High finding from the maintainability review without directly editing internal prompt content, except unchanged relocation or deduplication.",
        "At least one rerun maintainability review verifies that no High maintainability blockers remain.",
        "The final review document maps previous High findings to current code and boundary-test evidence.",
        "Focused frontend, backend, architecture, and prompt-integrity verification commands pass or any blocker is explicitly recorded.",
        "A final completion audit maps the user objective to concrete artifacts and command evidence.",
        "The completed work is committed."
      ],
      "stateUpdateRules": [
        "Before starting work on a task, set status to Doing with notes explaining the selected scope.",
        "After implementation and focused verification pass, set status to Review with command evidence.",
        "After diff review and completion audit pass, set status to Done.",
        "If progress depends on unavailable user input, network, external credentials, or an environment gate, set status to Blocked and record the blocker.",
        "Continue selecting the highest-priority non-Done task until completionCriteria are satisfied."
      ],
      "tasks": [
        {
          "id": "MNT-001",
          "status": "Done",
          "priority": "P0",
          "area": "Task Tracking",
          "task": "Create a machine-readable maintainability task tracker and updater.",
          "evidence": [
            "docs/plan/maintainability-clean-architecture-tasks.json",
            "scripts/plan/update-maintainability-task-status.mjs",
            "node scripts/plan/update-maintainability-task-status.mjs --id MNT-007 --status Doing"
          ],
          "acceptanceCriteria": "Task states can be updated without hand-editing JSON formatting.",
          "updatedAt": "2026-05-08",
          "notes": "Added after takeover because only Markdown task boards existed for maintainability work."
        },
        {
          "id": "MNT-002",
          "status": "Done",
          "priority": "P0",
          "area": "Review",
          "task": "Run initial maintainability review and document findings.",
          "evidence": [
            "docs/review/maintainability-review-2026-05-07.md"
          ],
          "acceptanceCriteria": "Review document records maintainability findings with severity and improvement direction.",
          "updatedAt": "2026-05-08",
          "notes": "Initial review exists and is tracked as the baseline for the implementation loop."
        },
        {
          "id": "MNT-003",
          "status": "Done",
          "priority": "P0",
          "area": "Planning",
          "task": "Define completion criteria, implementation loop, and maintainability roadmap.",
          "evidence": [
            "docs/plan/maintainability-clean-architecture-roadmap.md"
          ],
          "acceptanceCriteria": "Roadmap includes completion criteria, state update rules, task board, implementation order, and verification gates.",
          "updatedAt": "2026-05-08",
          "notes": "Roadmap is Markdown; this JSON file is the machine-readable SSOT requested by the user."
        },
        {
          "id": "MNT-004",
          "status": "Review",
          "priority": "P0",
          "area": "Implementation",
          "task": "Implement improvements for High maintainability findings.",
          "evidence": [
            "docs/review/maintainability-review-2026-05-07-final.md"
          ],
          "acceptanceCriteria": "Every previous High finding is either resolved or downgraded to non-blocking Medium with code and test evidence.",
          "updatedAt": "2026-05-08",
          "notes": "Awaiting independent subagent audit and focused verification before marking Done."
        },
        {
          "id": "MNT-005",
          "status": "Done",
          "priority": "P0",
          "area": "Review",
          "task": "Rerun maintainability review after implementation.",
          "evidence": [
            "docs/review/maintainability-review-2026-05-07-rerun.md",
            "docs/review/maintainability-review-2026-05-07-final.md"
          ],
          "acceptanceCriteria": "Rerun review checks previous High findings against current implementation evidence.",
          "updatedAt": "2026-05-08",
          "notes": "Final rerun reports High=0."
        },
        {
          "id": "MNT-006",
          "status": "Blocked",
          "priority": "P0",
          "area": "Prompt Integrity",
          "task": "Verify internal prompt content was not directly edited beyond relocation or deduplication.",
          "evidence": [],
          "acceptanceCriteria": "Prompt-related diff is explained as unchanged relocation/deduplication or any content change is explicitly blocked before commit.",
          "updatedAt": "2026-05-08",
          "notes": "prompt-engineer audit found runtime prompt content changes in backend/app/prompts and backend/app/utils/llm.py; violates user constraint until reverted or proven unchanged relocation."
        },
        {
          "id": "MNT-007",
          "status": "Doing",
          "priority": "P0",
          "area": "Verification",
          "task": "Run focused verification for architecture, backend, frontend, prompt integrity, and diff hygiene.",
          "evidence": [],
          "acceptanceCriteria": "Focused commands recommended by the audit pass or blockers are recorded.",
          "updatedAt": "2026-05-08",
          "notes": "Focused verification planning started after task tracker creation."
        },
        {
          "id": "MNT-008",
          "status": "Todo",
          "priority": "P0",
          "area": "Completion Audit",
          "task": "Map every explicit user requirement to concrete artifacts and command evidence.",
          "evidence": [],
          "acceptanceCriteria": "Audit identifies no missing objective requirement before completion is declared.",
          "updatedAt": "2026-05-08",
          "notes": "Must be completed immediately before marking the active goal complete."
        },
        {
          "id": "MNT-009",
          "status": "Todo",
          "priority": "P0",
          "area": "Commit",
          "task": "Commit completed maintainability-review implementation work.",
          "evidence": [],
          "acceptanceCriteria": "A git commit exists containing the completed reviewed work.",
          "updatedAt": "2026-05-08",
          "notes": "Commit is last because hooks may depend on staged diff and verification evidence."
        }
      ]
    }
  },
  {
    "sourcePlan": "security-vulnerability-hardening-plan.md",
    "file": "security-vulnerability-release-tasks.json",
    "data": {
      "version": 1,
      "updatedAt": "2026-05-05",
      "scope": {
        "focus": "security_vulnerabilities",
        "includedSeverities": [
          "High",
          "Medium-High",
          "Medium"
        ],
        "excludedSeverities": [
          "Low"
        ],
        "notes": [
          "DB owner constraints, Calendar POST conversion, and strict LLM/RAG hardening are in scope.",
          "Local existing data may be deleted if it blocks constraint or security-hardening validation.",
          "Low severity work is intentionally excluded from this release task list."
        ]
      },
      "statusWorkflow": [
        "Todo",
        "In Progress",
        "Blocked",
        "Review",
        "Done"
      ],
      "completionCriteria": [
        "Every task in tasks has status Done.",
        "Every task's acceptanceCriteria are satisfied by implementation and tests.",
        "Focused Vitest and pytest suites for changed areas pass.",
        "npm run test:security:static passes.",
        "npm run test:static passes.",
        "Required E2E or AI functional tests for auth, selection schedule, rag-ingest, and interview pass when their areas are touched.",
        "make ops-release-check passes before final release handoff."
      ],
      "verificationStatus": {
        "implementedTasks": "Done",
        "passedChecks": [
          "npx tsc --noEmit --pretty false",
          "npm run test:static",
          "npm run test:security:static",
          "focused Vitest security suites: 20 files, 86 tests passed",
          "focused pytest security suites: 89 tests passed",
          "make test-e2e-functional-local-selection-schedule passed: live pytest 1 passed and Playwright 6 passed",
          "bash security/scan/run-lightweight-scan.sh --fail-on=critical completed with no critical findings",
          "git diff --check",
          "code-reviewer final review: High/Medium none"
        ],
        "blockedChecks": [
          {
            "command": "make ops-release-check",
            "reason": "Release hook requires explicit release approval checkpoint; AskUserQuestion tool is unavailable in this Codex Default mode."
          }
        ],
        "updatedAt": "2026-05-05"
      },
      "stateUpdateRules": [
        "Before editing implementation files for a task, set that task to In Progress.",
        "After implementation and focused verification pass, set that task to Review.",
        "After diff review and required checks pass, set that task to Done.",
        "If a task cannot proceed because of an external dependency, set it to Blocked and record blocker in notes.",
        "Continue selecting the highest severity non-Done task until completionCriteria are satisfied."
      ],
      "tasks": [
        {
          "id": "SEC-001",
          "status": "Done",
          "severity": "High",
          "area": "stripe_billing",
          "task": "Stripe payment_failed and subscription deleted immediately downgrade users to free entitlements.",
          "acceptanceCriteria": [
            "invoice.payment_failed updates subscription status and sets userProfiles.plan to free.",
            "customer.subscription.deleted uses the same downgrade path.",
            "updatePlanAllocation is applied for free allocation after downgrade.",
            "invoice.payment_succeeded restores paid plan only for active or trialing subscriptions with a known price."
          ],
          "tests": [
            "src/app/api/webhooks/stripe/route.test.ts"
          ],
          "owner": "security-auditor",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-002",
          "status": "Done",
          "severity": "Medium-High",
          "area": "stripe_billing",
          "task": "Stripe webhook idempotency uses processing/succeeded/failed state and allows stale processing retry.",
          "acceptanceCriteria": [
            "processed_stripe_events records status, startedAt, processedAt, lastError, attemptCount, and stripeCreated.",
            "Webhook processing marks events succeeded only after all side effects succeed.",
            "Succeeded duplicate events are skipped.",
            "Stale processing or failed events can be retried safely."
          ],
          "tests": [
            "src/app/api/webhooks/stripe/route.test.ts"
          ],
          "owner": "security-auditor",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-003",
          "status": "Done",
          "severity": "High",
          "area": "billing_usage",
          "task": "Selection schedule fetch uses reservation, confirm, and cancel semantics to prevent unpaid success.",
          "acceptanceCriteria": [
            "Free quota or credit capacity is reserved before FastAPI work starts.",
            "Successful persistence confirms the reservation exactly once.",
            "Upstream, extraction, persistence, or confirm failures cancel the reservation.",
            "Parallel requests cannot exceed available free quota or credits."
          ],
          "tests": [
            "src/bff/billing/company-fetch-policy.test.ts",
            "src/app/api/companies/[id]/fetch-info/route.test.ts"
          ],
          "owner": "security-auditor",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-004",
          "status": "Done",
          "severity": "High",
          "area": "billing_usage",
          "task": "Company RAG monthly free usage is consumed atomically and schema fallback fails closed in staging/production.",
          "acceptanceCriteria": [
            "company_info_monthly_usage free unit consumption is row-locked or conditionally updated.",
            "HTML and PDF parallel ingestion cannot double-apply the same free units.",
            "Credit overflow and usage update are transactionally consistent.",
            "Missing usage schema fallback is not treated as success in staging or production."
          ],
          "tests": [
            "src/lib/company-info/usage.test.ts"
          ],
          "owner": "database-engineer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-005",
          "status": "Done",
          "severity": "High",
          "area": "guest_auth",
          "task": "Guest migration uses atomic claim and migrates interview-owned tables.",
          "acceptanceCriteria": [
            "Migration starts with a transaction-scoped claim on guest_users where migrated_to_user_id is null.",
            "Concurrent migration for the same guest has only one winner.",
            "interview_conversations, interview_feedback_histories, interview_turn_events, and interview_drill_attempts are migrated.",
            "Guest migration response no longer exposes guestId or userId to the browser."
          ],
          "tests": [
            "src/lib/auth/guest.test.ts",
            "src/app/api/guest/migrate/route.test.ts"
          ],
          "owner": "database-engineer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-006",
          "status": "Done",
          "severity": "High",
          "area": "db_integrity",
          "task": "Database parent-child owner integrity is enforced by migration constraints or triggers.",
          "acceptanceCriteria": [
            "Existing local owner mismatches are detected and removed or repaired before validation.",
            "Applications, documents, tasks, deadlines, motivation, and interview relations cannot reference a parent with a different owner.",
            "Migration SQL is generated and reviewed.",
            "Validation SQL reports zero owner mismatch rows after migration."
          ],
          "tests": [
            "migration validation SQL",
            "src/bff/identity/owner-access.test.ts"
          ],
          "owner": "database-engineer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-007",
          "status": "Done",
          "severity": "High",
          "area": "owner_boundary",
          "task": "High-risk CRUD mutations include owner conditions in database update/delete statements.",
          "acceptanceCriteria": [
            "Company, application, document, deadline, task, calendar event, and corporate URL mutations include id plus owner condition or equivalent transaction recheck.",
            "Foreign owner mutation affects zero rows and returns a private-resource 404.",
            "External I/O, notification creation, and credit confirm do not run for foreign resources."
          ],
          "tests": [
            "src/bff/identity/owner-access.test.ts",
            "src/app/api/companies/[id]/route.test.ts",
            "src/app/api/applications/[id]/route.test.ts"
          ],
          "owner": "nextjs-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-008",
          "status": "Done",
          "severity": "Medium",
          "area": "internal_auth",
          "task": "Internal test auth and local preflight routes are explicitly disabled unless opted in and allowlisted.",
          "acceptanceCriteria": [
            "CI_E2E_AUTH_ENABLED must equal 1 to enable test auth routes.",
            "Production-like environments and non-allowlisted hosts reject test auth.",
            "Missing or invalid internal test secret fails closed.",
            "Audit logs are emitted without raw secrets."
          ],
          "tests": [
            "src/app/api/internal/test-auth/**/*.test.ts"
          ],
          "owner": "security-auditor",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-009",
          "status": "Done",
          "severity": "Medium",
          "area": "csrf_calendar",
          "task": "Calendar GET side effects are moved to CSRF-protected POST routes.",
          "acceptanceCriteria": [
            "GET calendar routes are read-only.",
            "Google calendar reconcile/sync runs through POST with CSRF protection.",
            "Frontend callers use the POST route for reconcile/sync.",
            "CSRF failure prevents Google API calls and database mutation."
          ],
          "tests": [
            "src/app/api/calendar/google/route.test.ts",
            "src/hooks/useCalendar.test.ts"
          ],
          "owner": "nextjs-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-010",
          "status": "Done",
          "severity": "Medium",
          "area": "csrf_api",
          "task": "High-risk state-changing routes have route-level CSRF or inventory guard coverage.",
          "acceptanceCriteria": [
            "Guest migration, calendar mutation, Stripe checkout/portal, and key company mutations are covered by route-level CSRF or security inventory guard.",
            "CSRF failures return structured errors.",
            "CSRF failures do not reach identity-sensitive mutations."
          ],
          "tests": [
            "scripts/security/check-api-route-csrf.mjs",
            "src/app/api/guest/migrate/route.test.ts",
            "src/app/api/calendar/**/*.test.ts"
          ],
          "owner": "nextjs-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-011",
          "status": "Done",
          "severity": "High",
          "area": "pii_response",
          "task": "Calendar settings responses use an allowlist serializer and never expose OAuth tokens or owner ids.",
          "acceptanceCriteria": [
            "GET and PUT responses exclude googleAccessToken, googleRefreshToken, token expiry internals, googleGrantedScopes, userId, and database ids.",
            "Connection status and sync summary remain available.",
            "Existing UI continues to render calendar settings."
          ],
          "tests": [
            "src/app/api/calendar/settings/route.test.ts"
          ],
          "owner": "nextjs-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-012",
          "status": "Done",
          "severity": "High",
          "area": "pii_response",
          "task": "Company list/detail/create/update responses exclude normal credential fields.",
          "acceptanceCriteria": [
            "Normal company responses expose hasCredentials only.",
            "mypageLoginId and mypagePassword are returned only by the credentials endpoint.",
            "Credentials endpoint uses owner helper and structured errors while preserving successful response shape."
          ],
          "tests": [
            "src/app/api/companies/route.test.ts",
            "src/app/api/companies/[id]/route.test.ts",
            "src/app/api/companies/[id]/credentials/route.test.ts"
          ],
          "owner": "nextjs-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-013",
          "status": "Done",
          "severity": "Medium",
          "area": "url_validation",
          "task": "Company URL fields reject unsafe schemes, private hosts, protocol-relative URLs, and credentials URLs on save.",
          "acceptanceCriteria": [
            "recruitmentUrl and corporateUrl require public HTTPS source URLs.",
            "mypageUrl requires HTTPS and rejects credentials, localhost, and private IPs without applying public source compliance rules.",
            "javascript:, data:, protocol-relative, http:, and private IP URLs are rejected.",
            "Safe URLs are normalized before persistence."
          ],
          "tests": [
            "src/lib/security/public-url.test.ts",
            "src/app/api/companies/route.test.ts"
          ],
          "owner": "nextjs-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-014",
          "status": "Done",
          "severity": "Medium",
          "area": "error_handling",
          "task": "Security-sensitive APIs return structured errors and use logError instead of raw console/error payloads.",
          "acceptanceCriteria": [
            "calendar/google, calendar/disconnect, credentials, corporate fetch/search, and guest migration error paths use createApiErrorResponse.",
            "Responses include requestId and X-Request-Id.",
            "Developer details are limited to development debug output."
          ],
          "tests": [
            "scripts/security/check-raw-error-responses.mjs",
            "targeted route tests"
          ],
          "owner": "nextjs-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-015",
          "status": "Done",
          "severity": "High",
          "area": "fastapi_ssrf",
          "task": "FastAPI HTTP fetch protects against SSRF redirects and giant responses.",
          "acceptanceCriteria": [
            "Redirect targets are validated before each fetch.",
            "Content-Length over the configured cap is rejected before reading.",
            "Chunked responses are streamed and interrupted when cumulative bytes exceed the cap.",
            "Private, metadata, loopback, link-local, and IPv4-mapped private addresses are rejected."
          ],
          "tests": [
            "backend/tests/company_info/test_public_url_guard.py",
            "backend/tests/company_info/test_http_fetch_limits.py"
          ],
          "owner": "fastapi-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-016",
          "status": "Done",
          "severity": "Medium",
          "area": "fastapi_upload",
          "task": "PDF upload enforces read-before-cap and PDF validity checks.",
          "acceptanceCriteria": [
            "Upload routes do not depend on unbounded await file.read().",
            "Content-Length and chunked cumulative caps reject oversized uploads.",
            "Empty files, invalid PDF magic headers, and MIME/extension mismatches are rejected."
          ],
          "tests": [
            "backend/tests/company_info/test_upload_pdf_ingestion.py"
          ],
          "owner": "fastapi-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-017",
          "status": "Done",
          "severity": "High",
          "area": "fastapi_sse",
          "task": "Interview SSE routes use SseLease concurrency protection.",
          "acceptanceCriteria": [
            "Interview start, turn, continue, feedback, and drill streams acquire SseLease by actor.",
            "Guest limit, free, standard, and pro limits match shared SSE policy.",
            "Lease is released on stream completion, cancellation, and error.",
            "Second over-limit stream returns 429 without starting LLM work."
          ],
          "tests": [
            "backend/tests/shared/test_sse_concurrency.py",
            "backend/tests/interview/test_interview_streaming.py"
          ],
          "owner": "fastapi-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-018",
          "status": "Done",
          "severity": "High",
          "area": "llm_output_security",
          "task": "LLM output leakage is blocked before browser emission, including streaming paths.",
          "acceptanceCriteria": [
            "Non-streaming LLM leakage detection returns a blocked failure, not log-only success.",
            "Streaming paths scan a pre-emit buffer and never emit leakage chunks.",
            "Blocked output does not count as successful credit consumption.",
            "Raw blocked output is not logged."
          ],
          "tests": [
            "backend/tests/shared/test_prompt_safety.py",
            "backend/tests/shared/test_llm_output_guard.py",
            "backend/tests/shared/test_llm_streaming_guard.py"
          ],
          "owner": "fastapi-developer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-019",
          "status": "Done",
          "severity": "High",
          "area": "rag_security",
          "task": "RAG stored injection is sanitized, risk-scored, and quarantined without leaving legacy bypass paths.",
          "acceptanceCriteria": [
            "sanitize_rag_context and risk assessment are applied at RAG context formatter exits.",
            "Stored chunks receive injection risk metadata.",
            "High-risk chunks are excluded or quarantined by default.",
            "Existing unsafe legacy bypass paths are removed rather than left as dead code."
          ],
          "tests": [
            "backend/tests/security/test_rag_stored_injection.py"
          ],
          "owner": "rag-engineer",
          "updatedAt": "2026-05-05",
          "notes": []
        },
        {
          "id": "SEC-020",
          "status": "Done",
          "severity": "High",
          "area": "rag_privacy",
          "task": "Private PDF/RAG ingest requires source kind, explicit consent, metadata tracking, and deletion verification.",
          "acceptanceCriteria": [
            "PDF/RAG ingest distinguishes corporate_public and private_user_material.",
            "Private material cannot reach OCR, embedding, LLM, or RAG storage without explicit consent.",
            "Stored RAG metadata includes source kind, tenant key, company id, source id, and consent reference.",
            "Deletion verifies Chroma, BM25, Redis, Supabase object, and ingest job residuals."
          ],
          "tests": [
            "backend/tests/security/test_private_material_rag_contract.py",
            "backend/tests/security/test_rag_deletion_verification.py"
          ],
          "owner": "rag-engineer",
          "updatedAt": "2026-05-05",
          "notes": []
        }
      ]
    }
  },
  {
    "sourcePlan": "legal-commercial-support-plan.md",
    "file": "legal-commercial-support-tasks.json",
    "data": {
      "schemaVersion": 1,
      "plan": "legal-commercial-support-plan",
      "scope": "#14 Phase 0 legal and commercial P0",
      "statusValues": [
        "Todo",
        "Doing",
        "Blocked",
        "Review",
        "Done"
      ],
      "lastUpdated": "2026-05-06",
      "tasks": [
        {
          "id": "L-01",
          "status": "Done",
          "priority": "P0",
          "area": "Legal",
          "task": "AI生成物の著作権・知的財産条項追加",
          "acceptanceCriteria": "ユーザー入力の権利留保、運営者のAI出力への権利非主張、著作物性・独占性・第三者権利非侵害の非保証、類似出力可能性、最終確認責任、サービス提供に必要な限定処理許諾を/termsに明記する",
          "evidence": "terms page AI output rights regression test pass",
          "updatedAt": "2026-05-06",
          "notes": "AIプロバイダの学習不使用は断定せず、管理API利用・契約設定の範囲に限定した表現にした"
        },
        {
          "id": "L-05",
          "status": "Done",
          "priority": "P0",
          "area": "Legal",
          "task": "AI免責条項の強化",
          "acceptanceCriteria": "事実誤認、古い情報、類似性、選考結果非保証、企業公式情報での確認、外部プロバイダ依存、専門助言非代替を/termsに明記する",
          "evidence": "terms page AI disclaimer regression test pass",
          "updatedAt": "2026-05-06",
          "notes": "公開文面として安全寄りの表現で実装"
        },
        {
          "id": "L-03",
          "status": "Done",
          "priority": "P0",
          "area": "Legal",
          "task": "消費者契約法との整合性（返金例外条項）",
          "acceptanceCriteria": "原則返金なし、二重課金・誤課金・提供不能時の例外、軽過失時の賠償上限、故意重過失の除外を/termsとStripe表示へ反映する",
          "evidence": "checkout/terms/managed-config legal copy tests pass",
          "updatedAt": "2026-05-06",
          "notes": "課金ロジックはrefund/dispute webhook側で別途整合"
        },
        {
          "id": "T-04a",
          "status": "Done",
          "priority": "P0",
          "area": "Commerce",
          "task": "BCI-01/02/03 トランザクション整合性修正",
          "acceptanceCriteria": "consumeCreditsの残高更新と監査ログ挿入を同一transactionにし、plan allocationを競合安全な差分更新にする",
          "evidence": "credits focused Vitest pass",
          "updatedAt": "2026-05-06",
          "notes": "reserveCreditsとRAG free-unit lost updateは既に改善済みのため、残リスクに絞って実装"
        },
        {
          "id": "T-03",
          "status": "Done",
          "priority": "P0",
          "area": "Commerce",
          "task": "past_due 即時 free 制限",
          "acceptanceCriteria": "invoice.payment_failedのfree降格に加え、credit層でもpast_due等の不正状態をconsume/reserve前にfail-closedする",
          "evidence": "credit-layer block tests pass",
          "updatedAt": "2026-05-06",
          "notes": "hasEnoughCreditsもbilling blockを参照する"
        },
        {
          "id": "T-01",
          "status": "Done",
          "priority": "P0",
          "area": "Commerce",
          "task": "charge.refunded webhook 実装",
          "acceptanceCriteria": "全額返金時はfree降格し、部分返金は自動降格せずbilling notificationのみ作成する",
          "evidence": "stripe refund webhook tests pass",
          "updatedAt": "2026-05-06",
          "notes": "Stripe charge->invoice->subscription でユーザーを解決し、client metadataは信用しない"
        },
        {
          "id": "T-02",
          "status": "Done",
          "priority": "P0",
          "area": "Commerce",
          "task": "charge.dispute.* webhook 実装",
          "acceptanceCriteria": "dispute createdでbilling holdを保存して新規AI消費を停止し、closed/wonで解除、lostでfree降格する",
          "evidence": "stripe dispute webhook and billing hold tests pass",
          "updatedAt": "2026-05-06",
          "notes": "メール通知はP1へ分離し、今回はアプリ内通知のみ"
        }
      ]
    }
  },
  {
    "sourcePlan": "test-quality-gate-plan.md",
    "file": "test-quality-gate-tasks.json",
    "data": {
      "schemaVersion": 1,
      "plan": "test-quality-gate-plan",
      "scope": "#15 P0 infra",
      "statusValues": [
        "Todo",
        "Doing",
        "Blocked",
        "Review",
        "Done"
      ],
      "lastUpdated": "2026-05-05",
      "tasks": [
        {
          "id": "F1",
          "status": "Done",
          "priority": "P0",
          "area": "Infra",
          "task": "@vitest/coverage-v8 導入 + vitest.config.ts に coverage 設定追加",
          "evidence": "make test-coverage pass: 290 files / 1297 tests, v8 text/json/html coverage generated",
          "acceptanceCriteria": "npx vitest run --coverage が JSON + HTML レポートを生成する。初期閾値はベースライン計測後に設定する",
          "updatedAt": "2026-05-05",
          "notes": "coverage基盤を導入済み"
        },
        {
          "id": "B1",
          "status": "Done",
          "priority": "P0",
          "area": "Infra",
          "task": "pytest-cov 導入 + backend/pytest.ini に coverage 設定追加",
          "evidence": "make backend-test-coverage pass: 1477 passed, 42 deselected, coverage HTML/JSON generated",
          "acceptanceCriteria": "cd backend && python -m pytest --cov=app がカバレッジレポートを出力する",
          "updatedAt": "2026-05-05",
          "notes": "pytest-cov設定を導入済み"
        },
        {
          "id": "V1",
          "status": "Done",
          "priority": "P0",
          "area": "Infra",
          "task": "make test-coverage / make backend-test-coverage ターゲット追加",
          "evidence": "Makefile exposes test-coverage and backend-test-coverage targets",
          "acceptanceCriteria": "両ターゲットが HTML レポートを coverage/ / backend/htmlcov/ に生成する",
          "updatedAt": "2026-05-05",
          "notes": "Makefileターゲットを追加済み"
        },
        {
          "id": "F2-1",
          "status": "Done",
          "priority": "P0",
          "area": "Frontend",
          "task": "BFF es-review-stream-policy.ts テスト作成",
          "evidence": "npx vitest run src/bff/billing/ src/bff/identity/llm-cost-guard.test.ts pass",
          "acceptanceCriteria": "credit reservation の confirm/cancel、guest/user 境界、不足時 402 をカバーする",
          "updatedAt": "2026-05-05",
          "notes": "ES Review課金境界を検証済み"
        },
        {
          "id": "F2-2",
          "status": "Done",
          "priority": "P0",
          "area": "Frontend",
          "task": "BFF motivation-stream-policy.ts テスト作成",
          "evidence": "npx vitest run src/bff/billing/ src/bff/identity/llm-cost-guard.test.ts pass",
          "acceptanceCriteria": "成功時のみ consumeCredits し、非 billable / failure では消費しないことをカバーする",
          "updatedAt": "2026-05-05",
          "notes": "Motivation課金境界を検証済み"
        },
        {
          "id": "F2-3",
          "status": "Done",
          "priority": "P0",
          "area": "Frontend",
          "task": "BFF company-fetch-policy.ts テスト作成",
          "evidence": "npx vitest run src/bff/billing/ src/bff/identity/llm-cost-guard.test.ts pass",
          "acceptanceCriteria": "free quota reservation と credit reservation の precheck/reserve/confirm/cancel をカバーする",
          "updatedAt": "2026-05-05",
          "notes": "Company Fetch課金境界を検証済み"
        },
        {
          "id": "F2-4",
          "status": "Done",
          "priority": "P0",
          "area": "Frontend",
          "task": "BFF llm-cost-guard.ts テスト作成",
          "evidence": "npx vitest run src/bff/billing/ src/bff/identity/llm-cost-guard.test.ts pass",
          "acceptanceCriteria": "ガード発動、パススルー、guest/user plan、Retry-After header をカバーする",
          "updatedAt": "2026-05-05",
          "notes": "LLM daily token guardを検証済み"
        },
        {
          "id": "G1",
          "status": "Done",
          "priority": "P0",
          "area": "Gate",
          "task": "変更パス分類ロジックを Shadow/Advisory utility として追加",
          "evidence": "node --test scripts/harness/command-classifier.test.mjs scripts/harness/diff-snapshot.test.mjs pass",
          "acceptanceCriteria": "classify-change-path CLI が FAST_PATH / INFRA_PATH / STANDARD_PATH / EXTENDED_PATH を返し、既存 blocking gate は変更しない",
          "updatedAt": "2026-05-05",
          "notes": "Shadow/Advisory分類utilityを追加済み"
        },
        {
          "id": "G3",
          "status": "Done",
          "priority": "P0",
          "area": "Gate",
          "task": "diff-snapshot.mjs に batch-verify を Shadow/Advisory utility として追加",
          "evidence": "node --test scripts/harness/command-classifier.test.mjs scripts/harness/diff-snapshot.test.mjs pass",
          "acceptanceCriteria": "batch-verify が複数 checkpoint を一括検証し、無効化リストを JSON で報告する",
          "updatedAt": "2026-05-05",
          "notes": "checkpoint batch verification utilityを追加済み"
        }
      ]
    }
  }
];
