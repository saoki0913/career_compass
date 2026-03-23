---
name: supabase-ops
description: 就活Pass の Supabase 運用。shared production project の前提確認、secret inventory check、Supabase CLI auth 確認、release 前 bootstrap で使う。
---

# Supabase Ops

就活Pass では staging / production で shared production project を参照する。

## 正本

- `scripts/bootstrap/career-compass/bootstrap-career-compass-supabase.sh`
- `scripts/bootstrap/career-compass/sync-career-compass-env.sh --target supabase`
- `docs/release/SUPABASE.md`

## 標準操作

- check: `scripts/bootstrap/career-compass/bootstrap-career-compass-supabase.sh --check`
- apply: `scripts/bootstrap/career-compass/sync-career-compass-env.sh --apply --target supabase`

## 注意

- direct `supabase db push` は release 導線に含めない
- project ref と access token は `codex-company/.secrets/career_compass/supabase.env` を正本にする
