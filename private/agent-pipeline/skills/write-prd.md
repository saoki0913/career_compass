---
name: write-prd
description: Convert a validated design into a PRD that captures scope, constraints, and acceptance criteria.
command_description: Write a PRD from the validated design and save it under docs/prd.
cursor_description: Convert a validated design into a PRD and save it under docs/prd.
---

# Write PRD

Convert the shared understanding into an implementation-ready PRD.

## Workflow

1. Re-read the latest design decisions and inspect the codebase where claims need validation.
2. Run a short Grill Me loop again if important ambiguity remains.
3. Sketch the modules, surfaces, or workflows that will likely change.
4. Write the PRD in Japanese using `private/agent-pipeline/templates/prd-template.md`.
5. Save it to `docs/prd/YYYY-MM-DD-<slug>.md`.

## PRD requirements

- State the problem clearly.
- Separate goals from non-goals.
- Define user flows and functional requirements.
- Capture data or interface boundaries that implementation must respect.
- Include acceptance criteria and unresolved questions.

## Rules

- Do not turn guesses into facts.
- Validate codebase-specific claims before writing them.
- Keep the document concise but decision-complete.
- After the PRD is written, hand off to `prd-to-issues`.
