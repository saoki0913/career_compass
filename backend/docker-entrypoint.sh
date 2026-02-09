#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"

# Railway Volume is mounted at runtime. Ensure expected subdirs exist.
mkdir -p "$DATA_DIR/chroma" "$DATA_DIR/bm25"

if [ "$(id -u)" = "0" ]; then
  # Try to make the mounted disk writable for the non-root runtime user.
  if ! chown -R appuser:appgroup "$DATA_DIR"; then
    echo "[entrypoint] ERROR: failed to chown $DATA_DIR for appuser." >&2
    ls -ld "$DATA_DIR" >&2 || true
    exit 1
  fi

  # Verify write access before dropping privileges (fail fast if misconfigured).
  if ! gosu appuser:appgroup sh -c "test -w '$DATA_DIR' && test -w '$DATA_DIR/chroma' && test -w '$DATA_DIR/bm25'"; then
    echo "[entrypoint] ERROR: $DATA_DIR is not writable by appuser after chown." >&2
    ls -ld "$DATA_DIR" "$DATA_DIR/chroma" "$DATA_DIR/bm25" >&2 || true
    exit 1
  fi

  exec gosu appuser:appgroup "$@"
fi

exec "$@"
