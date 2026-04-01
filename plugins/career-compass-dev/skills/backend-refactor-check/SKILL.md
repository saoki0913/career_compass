---
name: backend-refactor-check
description: FastAPI / Next API の責務分離、structured error、business rule 維持を確認する。
---

# Backend Refactor Check

backend refactor では router / service / util の責務分離を優先し、business rule を崩さない。

## 確認項目

- structured error response を維持しているか
- request identity と guest/user 両対応を壊していないか
- JST 基準や成功時のみ消費などの business rule を維持しているか
- router に余計なロジックを抱え込んでいないか

## 対象

- `src/app/api/**`
- `backend/app/routers/**`
- `backend/app/utils/**`
- `backend/app/prompts/**`
