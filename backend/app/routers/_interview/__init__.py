"""Internal package for the interview router.

Phase 2 Stage 2 split: the façade lives at ``app.routers.interview`` and
re-exports everything public. Submodules are private (``_interview`` prefix) to
discourage external callers from importing them directly; however existing
tests may ``monkeypatch.setattr`` symbols on these submodules (generators in
particular) to intercept LLM calls.
"""
