#!/bin/bash
# PreToolUse (Bash): rm -rf をホワイトリスト方式でガード。
set -e
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -z "$CMD" ]; then
  exit 0
fi

# rm を含まないコマンドは素通り
if ! echo "$CMD" | grep -qE '(^|[;&|]|`|\$\()\s*rm\s'; then
  exit 0
fi

# 再帰+強制フラグの組み合わせを検出 (-rf, -fr, -rfv, -r -f 等)
# 非再帰の rm -f は許可
if ! echo "$CMD" | grep -qE '(^|[;&|]|`|\$\()\s*rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r)'; then
  exit 0
fi

# ホワイトリスト: ビルド成果物・キャッシュ等の安全な対象
SAFE_TARGETS='(node_modules|\.next|build|dist|__pycache__|coverage|\.turbo|\.cache|\.pytest_cache|\.mypy_cache|\.ruff_cache|out|\.parcel-cache|\.vercel|target|tmp|\.output|\.nuxt|\.svelte-kit)'

# rm -rf の対象パスを抽出（フラグ以外の引数群）
TARGETS=$(echo "$CMD" | grep -oE '(^|[;&|]|`|\$\()\s*rm\s+[^;&|]*' | sed -E 's/.*rm[[:space:]]+//' | tr ' ' '\n' | grep -v '^-' | grep -v '^$')

if [ -z "$TARGETS" ]; then
  # 対象パスなし（rm -rf だけ等）→ ブロック
  cat >&2 <<'EOF'
⛔ rm -rf の対象パスが不明です。明示的なパスを指定してください。
EOF
  exit 2
fi

ALL_SAFE=true
while IFS= read -r t; do
  # 絶対パス (/foo) はシステムディレクトリの可能性 → 常にブロック
  case "$t" in
    /*) ALL_SAFE=false; break ;;
  esac
  # 末尾スラッシュを除去してベースネーム取得
  BASENAME=$(basename "${t%/}")
  if ! echo "$BASENAME" | grep -qE "^${SAFE_TARGETS}$"; then
    ALL_SAFE=false
    break
  fi
done <<< "$TARGETS"

if [ "$ALL_SAFE" = true ]; then
  exit 0
fi

cat >&2 <<'EOF'
⛔ rm -rf の対象がホワイトリスト外です。

許可されている対象:
  node_modules, .next, build, dist, __pycache__, coverage,
  .turbo, .cache, .pytest_cache, .mypy_cache, .ruff_cache,
  out, .parcel-cache, .vercel, target, tmp

プロジェクトのソースコードやルートディレクトリの削除は禁止です。
個別ファイルの削除には rm -f (非再帰) を使用してください。
EOF
exit 2
