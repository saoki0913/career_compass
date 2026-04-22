from __future__ import annotations

import importlib
import json
from pathlib import Path

import pytest


def test_build_prompt_manifest_filters_inactive_rows_and_preserves_metadata() -> None:
    from app.prompts.notion_sync import build_prompt_manifest

    manifest = build_prompt_manifest(
        [
            {
                "key": "motivation.evaluation",
                "feature": "motivation",
                "kind": "constant",
                "content": "評価: {conversation}",
                "variables": ["conversation"],
                "status": "active",
                "version": 3,
                "code_targets": ["backend/app/prompts/motivation_prompts.py"],
            },
            {
                "key": "motivation.question",
                "feature": "motivation",
                "kind": "constant",
                "content": "下書き",
                "variables": [],
                "status": "draft",
                "version": 1,
                "code_targets": [],
            },
        ],
        required_keys=set(),
    )

    assert set(manifest) == {"motivation.evaluation"}
    assert manifest["motivation.evaluation"]["feature"] == "motivation"
    assert manifest["motivation.evaluation"]["kind"] == "constant"
    assert manifest["motivation.evaluation"]["version"] == 3


def test_build_prompt_manifest_rejects_placeholder_mismatch() -> None:
    from app.prompts.notion_sync import build_prompt_manifest

    with pytest.raises(ValueError, match="unexpected format placeholders|variables mismatch"):
        build_prompt_manifest(
            [
                {
                    "key": "motivation.evaluation",
                    "feature": "motivation",
                    "kind": "constant",
                    "content": "評価: {conversation}",
                    "variables": ["company_context"],
                    "status": "active",
                    "version": 1,
                    "code_targets": [],
                }
            ]
        )


def test_build_prompt_manifest_rejects_unescaped_json_braces() -> None:
    from app.prompts.notion_sync import build_prompt_manifest

    with pytest.raises(ValueError, match="invalid format template"):
        build_prompt_manifest(
            [
                {
                    "key": "motivation.question",
                    "feature": "motivation",
                    "kind": "constant",
                    "content": "JSON only\n{\"labels\": [\"候補1\"]}",
                    "variables": [],
                    "status": "active",
                    "version": 1,
                    "code_targets": [],
                }
            ],
            required_keys={"motivation.question"},
        )


def test_build_prompt_manifest_rejects_missing_required_keys() -> None:
    from app.prompts.notion_sync import build_prompt_manifest

    with pytest.raises(ValueError, match="missing required prompt keys"):
        build_prompt_manifest(
            [
                {
                    "key": "motivation.evaluation",
                    "feature": "motivation",
                    "kind": "constant",
                    "content": "評価: {conversation}",
                    "variables": ["conversation"],
                    "status": "active",
                    "version": 1,
                    "code_targets": [],
                }
            ],
            required_keys={"motivation.evaluation", "motivation.question"},
        )


def test_prompt_registry_reads_generated_file_and_falls_back(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.prompts import notion_registry

    generated_path = tmp_path / "notion_prompts.json"
    generated_path.write_text(
        json.dumps(
            {
                "motivation.evaluation": {
                    "feature": "motivation",
                    "kind": "constant",
                    "content": "managed {conversation}",
                    "variables": ["conversation"],
                    "version": 7,
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(notion_registry, "GENERATED_PROMPTS_PATH", generated_path)
    notion_registry.reset_managed_prompt_cache()

    prompt = notion_registry.require_managed_prompt("motivation.evaluation")
    assert prompt.content == "managed {conversation}"
    assert prompt.version == 7
    assert notion_registry.get_managed_prompt_content("missing.key", fallback="fallback") == "fallback"


def test_prompt_registry_rejects_invalid_format_template(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.prompts import notion_registry

    generated_path = tmp_path / "notion_prompts.json"
    generated_path.write_text(
        json.dumps(
            {
                "motivation.suggestion_rewrite": {
                    "feature": "motivation",
                    "kind": "constant",
                    "content": "JSON only\n{\"labels\": [\"候補1\"]}",
                    "variables": [],
                    "version": 1,
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(notion_registry, "GENERATED_PROMPTS_PATH", generated_path)
    notion_registry.reset_managed_prompt_cache()

    with pytest.raises(ValueError, match="invalid format template"):
        notion_registry.load_managed_prompts(force_reload=True)


def test_motivation_prompts_use_generated_registry_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.prompts import notion_registry
    import app.prompts.motivation_prompts as motivation_prompts

    generated_path = tmp_path / "notion_prompts.json"
    generated_path.write_text(
        json.dumps(
            {
                "motivation.evaluation": {
                    "feature": "motivation",
                    "kind": "constant",
                    "content": "managed evaluation {conversation}",
                    "variables": ["conversation"],
                    "version": 2,
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(notion_registry, "GENERATED_PROMPTS_PATH", generated_path)
    notion_registry.reset_managed_prompt_cache()

    reloaded = importlib.reload(motivation_prompts)

    assert reloaded.MOTIVATION_EVALUATION_PROMPT == "managed evaluation {conversation}"
