# 志望動機作成プロンプト

> runtime_linkage: forbidden

## Runtime Sources

- `backend/app/prompts/motivation_prompts.py`
- `backend/app/services/motivation/question.py`
- `backend/app/services/motivation/pipeline.py`
- `backend/app/services/motivation/draft.py`
- `backend/app/services/motivation/summarize.py`

## Prompt Surfaces

- `evaluation.md`: 6 slot 充足評価。
- `question.md`: 次質問生成。
- `deepdive-question.md`: 完成 draft 後の深掘り質問。
- `draft-generation.md`: 志望動機 ES 下書き生成。
- `conversation-summary.md`: 長い会話の要約。

