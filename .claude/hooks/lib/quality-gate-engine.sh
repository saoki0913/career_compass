#!/bin/bash
# Shared quality gate library for post-edit-dispatcher.sh.
# Fail-open: every public function is wrapped so it never exits non-zero.

if [ -n "${__QUALITY_GATE_ENGINE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__QUALITY_GATE_ENGINE_SOURCED=1

# shellcheck source=skill-recommender.sh
. "$(dirname "${BASH_SOURCE[0]}")/skill-recommender.sh"

_QG_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
_QG_CONFIG_FILE="$_QG_PROJECT_DIR/.claude/quality-gate.json"

_qg_read_config_value() {
  local key="${1:-}"
  local default="${2:-}"
  if [ ! -f "$_QG_CONFIG_FILE" ]; then
    printf '%s\n' "$default"
    return 0
  fi
  local val=""
  if command -v jq >/dev/null 2>&1; then
    val=$(jq -r ".$key // empty" "$_QG_CONFIG_FILE" 2>/dev/null || true)
  fi
  if [ -z "$val" ]; then
    val=$(grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$_QG_CONFIG_FILE" 2>/dev/null \
      | head -1 | sed 's/.*"[^"]*"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/' || true)
  fi
  if [ -z "$val" ]; then
    val=$(grep -o "\"$key\"[[:space:]]*:[[:space:]]*[0-9]*" "$_QG_CONFIG_FILE" 2>/dev/null \
      | head -1 | sed 's/.*:[[:space:]]*//' || true)
  fi
  printf '%s\n' "${val:-$default}"
}

_QG_HINT_MESSAGES_security="認証・認可チェックを確認してください"
_QG_HINT_MESSAGES_auth="ログイン必須判定・権限チェックを確認してください"
_QG_HINT_MESSAGES_payment="二重課金・webhook検証・テストキーを確認してください"
_QG_HINT_MESSAGES_datetime="JST/UTC の一貫性を確認してください（本プロジェクトは JST 基準）"
_QG_HINT_MESSAGES_apiDesign="HTTP メソッド・ステータスコード・createApiErrorResponse を確認してください"
_QG_HINT_MESSAGES_frontend="loading/error/empty ステート・disabled 制御を確認してください"
_QG_HINT_MESSAGES_aiLlm="prompt injection・出力検証・トークン効率を確認してください"
_QG_HINT_MESSAGES_cost="API 呼び出し回数・モデル選択・トークン量を確認してください"
_QG_HINT_MESSAGES_performance="N+1 クエリ・不要な再レンダリング・pagination を確認してください"
_QG_HINT_MESSAGES_database="migration 整合性・index・constraint を確認してください"
_QG_HINT_MESSAGES_correctness="null チェック・境界値・型整合性を確認してください"
_QG_HINT_MESSAGES_maintainability="dead code・重複ロジック・ファイルサイズを確認してください"
_QG_HINT_MESSAGES_testing="対応するテストファイルの更新を確認してください"
_QG_HINT_MESSAGES_externalServices="外部 API の失敗処理・タイムアウト・リトライを確認してください"
_QG_HINT_MESSAGES_operations="CI/CD パイプライン変更の影響を確認してください"
_QG_HINT_MESSAGES_deployment="環境変数・デプロイ設定の一貫性を確認してください"
_QG_HINT_MESSAGES_documentation="ドキュメントの更新を確認してください"

_QG_CATEGORY_PRIORITY=(
  security payment auth aiLlm cost database datetime
  apiDesign performance frontend externalServices
  correctness maintainability testing operations deployment documentation
)

_qg_hint_message_for() {
  local cat="${1:-}"
  local varname="_QG_HINT_MESSAGES_${cat}"
  eval "printf '%s\n' \"\${${varname}:-}\""
}

_qg_category_for_path_impl() {
  local file_path="${1:-}"
  [ -z "$file_path" ] && return 0

  local categories=""

  case "$file_path" in
    */src/lib/auth/*|*/src/lib/csrf.ts|*/src/bff/identity/*)
      categories="security auth"
      ;;
    */src/lib/stripe/*|*/src/app/api/stripe/*|*/src/app/api/webhooks/stripe/*|*/src/app/api/credits/*|*/src/bff/billing/*)
      categories="payment security"
      ;;
    */src/lib/calendar/*|*/src/app/api/calendar/*)
      categories="externalServices"
      ;;
    */src/app/api/*/route.ts)
      categories="security apiDesign"
      ;;
    */backend/app/routers/*)
      categories="security apiDesign performance"
      ;;
    */backend/app/prompts/*|*/backend/app/utils/llm*)
      categories="aiLlm cost"
      ;;
    */src/components/*|*/src/app/*/page.tsx|*/src/app/*/layout.tsx|*/src/app/*/loading.tsx)
      categories="frontend"
      ;;
    */src/lib/db/schema.ts|*/drizzle_pg/*)
      categories="database"
      ;;
    */src/lib/datetime/*)
      categories="datetime"
      ;;
  esac

  case "$file_path" in
    *.ts|*.tsx|*.py)
      if [ -z "$categories" ]; then
        categories="correctness maintainability"
      else
        categories="$categories correctness maintainability"
      fi
      ;;
  esac

  printf '%s\n' "$categories"
}

qg_category_for_path() {
  (
    _qg_category_for_path_impl "$@"
  ) 2>/dev/null || true
}

_qg_maybe_emit_hint_impl() {
  local file_path="${1:-}"
  local session_id="${2:-unknown}"

  [ -z "$file_path" ] && return 0

  local rollout_phase
  rollout_phase=$(_qg_read_config_value "rollout_phase" "A")
  if [ "$rollout_phase" != "A" ] && [ "$rollout_phase" != "B" ] && [ "$rollout_phase" != "C" ]; then
    return 0
  fi

  local categories
  categories=$(_qg_category_for_path_impl "$file_path")
  [ -z "$categories" ] && return 0

  local state_dir
  state_dir=$(skill_session_state_dir)
  local counter_file="$state_dir/qg-edit-counter-$session_id"

  local current_count
  current_count=$(skill_increment_counter "$counter_file")

  local cooldown
  cooldown=$(_qg_read_config_value "hint_cooldown_edits" "3")
  [ "$cooldown" -lt 1 ] 2>/dev/null && cooldown=3
  if [ $((current_count % cooldown)) -ne 0 ]; then
    return 0
  fi

  local max_hints
  max_hints=$(_qg_read_config_value "max_hints_per_session" "8")
  local hints_emitted_file="$state_dir/qg-hints-emitted-$session_id"
  local hints_emitted=0
  if [ -f "$hints_emitted_file" ]; then
    hints_emitted=$(awk 'NR==1 {print int($0)}' "$hints_emitted_file" 2>/dev/null || printf '0')
    [ -z "$hints_emitted" ] && hints_emitted=0
  fi
  if [ "$hints_emitted" -ge "$max_hints" ] 2>/dev/null; then
    return 0
  fi

  local chosen_cat=""
  for pcat in "${_QG_CATEGORY_PRIORITY[@]}"; do
    local found=0
    for ccat in $categories; do
      if [ "$ccat" = "$pcat" ]; then
        found=1
        break
      fi
    done
    [ "$found" -eq 0 ] && continue

    local dedup_flag="$state_dir/qg-hinted-${pcat}-$session_id"
    if [ -f "$dedup_flag" ]; then
      continue
    fi

    chosen_cat="$pcat"
    break
  done

  [ -z "$chosen_cat" ] && return 0

  local message
  message=$(_qg_hint_message_for "$chosen_cat")
  [ -z "$message" ] && return 0

  local cat_upper
  cat_upper=$(printf '%s' "$chosen_cat" | tr '[:lower:]' '[:upper:]')
  printf '💡 QG-%s: %s — %s\n' "$cat_upper" "$message" "$file_path" >&2

  local dedup_flag="$state_dir/qg-hinted-${chosen_cat}-$session_id"
  : > "$dedup_flag"

  hints_emitted=$((hints_emitted + 1))
  printf '%s\n' "$hints_emitted" > "$hints_emitted_file"
}

qg_maybe_emit_hint() {
  _qg_maybe_emit_hint_impl "$@" || true
}

_qg_is_deferred_impl() {
  local item_id="${1:-}"
  local session_id="${2:-unknown}"

  [ -z "$item_id" ] && return 1

  local state_dir
  state_dir=$(skill_session_state_dir)

  local deferral_file="$state_dir/qg-deferral-${item_id}-${session_id}"
  if [ -f "$deferral_file" ]; then
    local expiry_days
    expiry_days=$(_qg_read_config_value "deferral_expiry_days" "7")
    local file_age_days
    if command -v stat >/dev/null 2>&1; then
      local mod_time
      mod_time=$(stat -f '%m' "$deferral_file" 2>/dev/null || stat -c '%Y' "$deferral_file" 2>/dev/null || echo "0")
      local now
      now=$(date +%s)
      file_age_days=$(( (now - mod_time) / 86400 ))
    else
      file_age_days=0
    fi
    if [ "$file_age_days" -lt "$expiry_days" ] 2>/dev/null; then
      return 0
    fi
  fi

  return 1
}

qg_is_deferred() {
  (
    _qg_is_deferred_impl "$@"
  ) 2>/dev/null || true
}
