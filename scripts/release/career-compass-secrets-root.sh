#!/usr/bin/env sh
# Shared secrets root resolution for bash and zsh consumers.
# Sets CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE (directory containing google-oauth/ etc.).
#
# Priority:
#   1. CODEX_COMPANY_SECRETS_ROOT if set
#   2. codex-company/.secrets (legacy fallback)
#
# Note: sync-career-compass-secrets.sh は CAREER_COMPASS_SECRETS_DIR / repo_root/.secrets/
# を優先的に使用する。このスクリプトは google-oauth など SSOT root 配下の
# 兄弟ディレクトリ解決にのみ使われる。

if [ -n "${CODEX_COMPANY_SECRETS_ROOT:-}" ]; then
  CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE="$CODEX_COMPANY_SECRETS_ROOT"
else
  CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE="${CODEX_COMPANY_ROOT:-/Users/saoki/work/codex-company}/.secrets"
fi

export CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE
