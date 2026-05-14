#!/bin/bash
# Shared secret leak detection patterns for PostToolUse hooks.
# Used by .claude/hooks/post-bash-output-guard.sh and .codex/hooks/post-bash-output-guard.sh
#
# Defense-in-depth layer: primary protection is permissions.deny / security.deny_patterns
# which block AI from reading .secrets/ files. This scanner is SUPPLEMENTARY — it catches
# accidental leaks in Bash command output (e.g., env dump, curl response, log tail).
#
# MUST be fail-open: sourcing or scanning failures must never block the agent.

if [ -n "${__SECRET_PATTERNS_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__SECRET_PATTERNS_SOURCED=1

# Each pattern is an extended regex matched by grep -E.
# Order: most specific first to short-circuit on common leaks.
SECRET_LEAK_PATTERNS=(
  'sk_live_[0-9a-zA-Z]{20,}'
  'sk_test_[0-9a-zA-Z]{20,}'
  'whsec_[0-9a-zA-Z]{20,}'
  'sk-proj-[0-9a-zA-Z_-]{20,}'
  'sk-ant-[0-9a-zA-Z_-]{20,}'
  'sk-[0-9a-zA-Z]{20,}'
  'ghp_[0-9a-zA-Z]{36}'
  'gho_[0-9a-zA-Z]{36}'
  'ghs_[0-9a-zA-Z]{36}'
  'ghu_[0-9a-zA-Z]{36}'
  'sbp_[0-9a-f]{40}'
  'eyJ[0-9a-zA-Z_-]+\.eyJ[0-9a-zA-Z_-]+\.[0-9a-zA-Z_-]+'
  'postgres(ql)?://[^"[:space:]<>]+@[^"[:space:]<>]*(supabase\.com|pooler\.supabase\.com)[^"[:space:]<>]*'
  'OPENAI_API_KEY=sk-[^ ]+'
  'ANTHROPIC_API_KEY=sk-ant-[^ ]+'
  'BETTER_AUTH_SECRET=[^ ]+'
  'DATABASE_URL=[^ ]+'
  'STRIPE_SECRET_KEY=[^ ]+'
  'SUPABASE_SERVICE_ROLE_KEY=[^ ]+'
  'service_role["[:space:]]*[:=]["[:space:]]*eyJ'
)

# scan_for_leaked_secrets TEXT
# Returns 0 (true) if a secret pattern is found, 1 (false) otherwise.
scan_for_leaked_secrets() {
  local text="${1:-}"
  [ -z "$text" ] && return 1
  local pattern
  for pattern in "${SECRET_LEAK_PATTERNS[@]}"; do
    if printf '%s' "$text" | grep -qE "$pattern" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}
