#!/usr/bin/env python3
"""
Train a CrossEncoder reranker on generated JSONL data.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def _load_samples(path: Path):
    from sentence_transformers import InputExample

    samples: list[InputExample] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            query = str(obj.get("query", "") or "")
            passage = str(obj.get("passage", "") or "")
            label = float(obj.get("label", 0))
            if not query or not passage:
                continue
            samples.append(InputExample(texts=[query, passage], label=label))
    return samples


def main() -> None:
    parser = argparse.ArgumentParser(description="Train job-hunting reranker.")
    parser.add_argument("--train", required=True, help="train.jsonl path")
    parser.add_argument("--valid", required=True, help="valid.jsonl path")
    parser.add_argument(
        "--base-model",
        default="hotchpotch/japanese-reranker-small-v2",
        help="Base CrossEncoder model name/path",
    )
    parser.add_argument("--output-dir", required=True, help="Model output directory")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--warmup-ratio", type=float, default=0.1)
    args = parser.parse_args()

    from torch.utils.data import DataLoader
    from sentence_transformers import CrossEncoder
    from sentence_transformers.cross_encoder.evaluation import CEBinaryClassificationEvaluator

    train_samples = _load_samples(Path(args.train))
    valid_samples = _load_samples(Path(args.valid))
    if not train_samples:
        raise ValueError("No train samples loaded")
    if not valid_samples:
        raise ValueError("No valid samples loaded")

    model = CrossEncoder(args.base_model, num_labels=1)
    train_loader = DataLoader(train_samples, shuffle=True, batch_size=args.batch_size)
    evaluator = CEBinaryClassificationEvaluator.from_input_examples(
        valid_samples, name="valid"
    )
    warmup_steps = int(len(train_loader) * args.epochs * args.warmup_ratio)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    model.fit(
        train_dataloader=train_loader,
        evaluator=evaluator,
        epochs=args.epochs,
        warmup_steps=warmup_steps,
        optimizer_params={"lr": args.lr},
        output_path=str(output_dir),
        save_best_model=True,
    )

    metadata = {
        "base_model": args.base_model,
        "train_samples": len(train_samples),
        "valid_samples": len(valid_samples),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "lr": args.lr,
        "warmup_steps": warmup_steps,
    }
    (output_dir / "training_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"saved_model={output_dir}")


if __name__ == "__main__":
    main()
