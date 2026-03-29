#!/usr/bin/env sh
# Shared secrets root resolution for bash and zsh consumers.
# Sets CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE (directory containing career_compass/ and google-oauth/).
#
# Priority:
#   1. CODEX_COMPANY_SECRETS_ROOT if set (typically .../codex-company/.secrets)
#   2. Else CODEX_COMPANY_ROOT/.secrets (legacy bootstrap-cloudflare compatibility)
#   3. Else default macOS path for this workspace

if [ -n "${CODEX_COMPANY_SECRETS_ROOT:-}" ]; then
  CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE="$CODEX_COMPANY_SECRETS_ROOT"
else
  CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE="${CODEX_COMPANY_ROOT:-/Users/saoki/work/codex-company}/.secrets"
fi

export CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE
