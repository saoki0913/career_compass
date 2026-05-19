#!/bin/bash
# PreToolUse (Bash): block production promotion without staging verification + approval checkpoint (Codex variant).
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"
# shellcheck source=lib/autonomy.sh
. "$SCRIPT_DIR/lib/autonomy.sh"
CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ] || ! guard_command_is_production_promotion "$CMD"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "本番反映の確認状態を読み取れないため、実行できませんでした。" >&2
  exit 2
fi

HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")
STATE_DIR=$(guard_state_dir_for_runtime codex)

# Gate 1: staging must be verified for the current HEAD
STAGING_FLAG="$STATE_DIR/staging-verified-$HEAD_SHA"

if [ ! -f "$STAGING_FLAG" ]; then
  printf '{"decision":"block","reason":"STAGING_NOT_VERIFIED","message":"本番へ反映する前に、同じ内容をステージングで確認してください。"}\n' >&2
  exit 2
fi
if ! jq -e '.kind == "staging-verified" and .decision == "verified" and .headSha == "'"$HEAD_SHA"'"' "$STAGING_FLAG" >/dev/null 2>&1; then
  printf '{"decision":"block","reason":"STAGING_VERIFICATION_INVALID","message":"ステージング確認記録の形式が不正なため、本番反映を停止しました。"}\n' >&2
  exit 2
fi
if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$STAGING_FLAG" >/dev/null; then
  printf '{"decision":"block","reason":"STAGING_VERIFICATION_STALE","message":"ステージング確認後に差分が変わったため、本番反映を停止しました。"}\n' >&2
  exit 2
fi

# Gate 2: explicit production promotion approval
PROMO_FLAG="$STATE_DIR/production-promotion-approved-$SESSION_ID"

if codex_autonomy_allows_action "$PROJECT_DIR" "$STATE_DIR" "$SESSION_ID" "production-promotion" "$CMD" "production"; then
  exit 0
fi

if [ ! -f "$PROMO_FLAG" ]; then
  printf '{"decision":"block","reason":"ESCALATION_REQUIRED","message":"本番へ反映する前に、対象コミットと影響範囲の確認が必要です。"}\n' >&2
  exit 2
fi

APPROVED_HEAD=$(jq -r '.headSha // empty' "$PROMO_FLAG" 2>/dev/null || echo "")
DECISION=$(jq -r '.decision // empty' "$PROMO_FLAG" 2>/dev/null || echo "")
KIND=$(jq -r '.kind // empty' "$PROMO_FLAG" 2>/dev/null || echo "")
APPROVED_COMMAND_HASH=$(jq -r '.commandHash // empty' "$PROMO_FLAG" 2>/dev/null || echo "")
if [ "$KIND" != "production-promotion" ] || [ "$DECISION" != "approved" ] || [ "$APPROVED_HEAD" != "$HEAD_SHA" ]; then
  echo "確認後にコミットが変わったため、本番反映前の確認をもう一度行ってください。" >&2
  exit 2
fi
if [ -z "$APPROVED_COMMAND_HASH" ]; then
  echo "本番反映の確認が実行コマンドに結び付いていないため、確認をもう一度行ってください。" >&2
  exit 2
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$PROMO_FLAG" --command "$CMD" >/dev/null; then
  echo "確認後に差分が変わったため、本番反映前の確認をもう一度行ってください。" >&2
  exit 2
fi

exit 0
