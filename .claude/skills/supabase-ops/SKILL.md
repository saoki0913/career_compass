---
name: supabase-ops
description: 就活Pass の Supabase shared project 運用。bootstrap check と secret sync を扱う。
language: ja
---

# Supabase Ops

- bootstrap check: `scripts/bootstrap-career-compass-supabase.sh --check`
- secret sync: `scripts/release/sync-career-compass-secrets.sh --target supabase`
- shared production project 前提で扱う
