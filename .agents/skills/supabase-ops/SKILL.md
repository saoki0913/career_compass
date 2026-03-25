---
name: supabase-ops
description: "就活Pass の Supabase 運用。shared production project 前提の bootstrap check と secret sync を扱う。Trigger: Supabase, shared project, db release, supabase secret sync."
---

# Supabase Ops

Supabase は shared production project 前提で扱う。

## Use

- bootstrap check: `scripts/bootstrap-career-compass-supabase.sh --check`
- secret sync: `scripts/release/sync-career-compass-secrets.sh --target supabase`

## Notes

- 通常 release で `supabase db push` は使わない
- 必要な secrets は `codex-company/.secrets/career_compass/supabase.env`
