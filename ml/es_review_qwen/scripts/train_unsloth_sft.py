#!/usr/bin/env python3
"""Train a Qwen3 LoRA adapter for ES review with Unsloth + TRL."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _render_chat_text(messages: list[dict[str, str]], tokenizer: Any) -> str:
    if hasattr(tokenizer, "apply_chat_template"):
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False,
        )

    chunks: list[str] = []
    for message in messages:
        role = str(message.get("role") or "user").upper()
        content = str(message.get("content") or "")
        chunks.append(f"<|{role}|>\n{content}")
    return "\n".join(chunks)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Qwen3 ES review LoRA with Unsloth.")
    parser.add_argument("--config", required=True, help="JSON config path")
    args = parser.parse_args()

    config_path = Path(args.config)
    config = _load_config(config_path)

    try:
        from datasets import load_dataset
        from trl import SFTConfig, SFTTrainer
        from unsloth import FastLanguageModel
    except ImportError as error:  # pragma: no cover - environment specific
        raise SystemExit(
            "Missing training dependencies. Run `pip install -r ml/es_review_qwen/requirements-train.txt`."
        ) from error

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=config["base_model"],
        max_seq_length=int(config.get("max_seq_length", 4096)),
        load_in_4bit=bool(config.get("load_in_4bit", True)),
    )
    model = FastLanguageModel.get_peft_model(
        model,
        r=int(config.get("lora_rank", 32)),
        lora_alpha=int(config.get("lora_alpha", 64)),
        lora_dropout=float(config.get("lora_dropout", 0.05)),
        target_modules=list(config.get("target_modules") or []),
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    dataset = load_dataset(
        "json",
        data_files={
            "train": config["train_dataset_path"],
            "valid": config["valid_dataset_path"],
        },
    )

    def _format_row(row: dict[str, Any]) -> dict[str, str]:
        return {"text": _render_chat_text(list(row["messages"]), tokenizer)}

    train_dataset = dataset["train"].map(_format_row, remove_columns=dataset["train"].column_names)
    valid_dataset = dataset["valid"].map(_format_row, remove_columns=dataset["valid"].column_names)

    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        eval_dataset=valid_dataset,
        dataset_text_field="text",
        max_seq_length=int(config.get("max_seq_length", 4096)),
        packing=False,
        args=SFTConfig(
            output_dir=str(output_dir),
            num_train_epochs=float(config.get("num_train_epochs", 2)),
            per_device_train_batch_size=int(config.get("per_device_train_batch_size", 1)),
            per_device_eval_batch_size=int(config.get("per_device_eval_batch_size", 1)),
            gradient_accumulation_steps=int(config.get("gradient_accumulation_steps", 16)),
            learning_rate=float(config.get("learning_rate", 2e-4)),
            warmup_ratio=float(config.get("warmup_ratio", 0.03)),
            weight_decay=float(config.get("weight_decay", 0.01)),
            logging_steps=int(config.get("logging_steps", 10)),
            save_steps=int(config.get("save_steps", 100)),
            eval_steps=int(config.get("eval_steps", 100)),
            eval_strategy="steps",
            save_strategy="steps",
            lr_scheduler_type="cosine",
            seed=int(config.get("seed", 42)),
            report_to=[],
        ),
    )

    train_result = trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    summary = {
        "base_model": config["base_model"],
        "output_dir": str(output_dir),
        "train_rows": len(train_dataset),
        "valid_rows": len(valid_dataset),
        "train_runtime_seconds": getattr(train_result, "metrics", {}).get("train_runtime"),
        "train_loss": getattr(train_result, "metrics", {}).get("train_loss"),
        "config": config,
    }
    (output_dir / "training_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
