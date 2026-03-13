#!/usr/bin/env python3
"""Preflight checks for Swallow 32B LoRA training on DLServer."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

MIN_VRAM_GB = 46
MIN_FREE_DISK_GB = 80


def _run(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True).strip()


def _query_gpus() -> list[dict[str, object]]:
    output = _run(
        [
            "nvidia-smi",
            "--query-gpu=index,name,memory.total,memory.free,driver_version",
            "--format=csv,noheader,nounits",
        ]
    )
    rows: list[dict[str, object]] = []
    for line in output.splitlines():
        index, name, memory_total, memory_free, driver = [part.strip() for part in line.split(",", 4)]
        rows.append(
            {
                "index": int(index),
                "name": name,
                "memory_total_mb": int(memory_total),
                "memory_free_mb": int(memory_free),
                "driver_version": driver,
            }
        )
    return rows


def _recommended_config_name(gpus: list[dict[str, object]], min_vram_gb: int) -> str | None:
    for gpu in gpus:
        if int(gpu["memory_total_mb"]) >= 75 * 1024:
            return "qwen3_swallow_32b_lora.json"
    for gpu in gpus:
        name = str(gpu["name"])
        if (
            ("A6000" in name or "RTX 6000 Ada" in name)
            and int(gpu["memory_total_mb"]) >= min_vram_gb * 1024
        ):
            return "qwen3_swallow_32b_a6000_lora.json"
    return None


def _recommended_gpu_index(gpus: list[dict[str, object]], min_vram_gb: int) -> int | None:
    eligible = [
        gpu for gpu in gpus if int(gpu["memory_total_mb"]) >= min_vram_gb * 1024
    ]
    if not eligible:
        return None
    best = max(eligible, key=lambda gpu: int(gpu["memory_free_mb"]))
    return int(best["index"])


def _check_imports() -> dict[str, str]:
    checks = {
        "torch": "import torch; print(torch.__version__)",
        "bitsandbytes": "import bitsandbytes as bnb; print(bnb.__version__)",
        "unsloth": "import unsloth; print(getattr(unsloth, '__version__', 'unknown'))",
        "transformers": "import transformers; print(transformers.__version__)",
    }
    results: dict[str, str] = {}
    for module, statement in checks.items():
        output = subprocess.check_output([sys.executable, "-c", statement], text=True).strip()
        results[module] = output
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Preflight checks for Swallow 32B training.")
    parser.add_argument("--min-vram-gb", type=int, default=MIN_VRAM_GB)
    parser.add_argument("--min-free-disk-gb", type=int, default=MIN_FREE_DISK_GB)
    parser.add_argument("--check-imports", action="store_true")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[3]
    disk = shutil.disk_usage(repo_root)
    free_disk_gb = disk.free / (1024 ** 3)
    gpus = _query_gpus()
    eligible_gpus = [
        gpu
        for gpu in gpus
        if gpu["memory_total_mb"] >= args.min_vram_gb * 1024
    ]

    summary = {
        "repo_root": str(repo_root),
        "free_disk_gb": round(free_disk_gb, 2),
        "min_free_disk_gb": args.min_free_disk_gb,
        "gpus": gpus,
        "eligible_gpu_indexes": [gpu["index"] for gpu in eligible_gpus],
        "recommended_config": _recommended_config_name(gpus, args.min_vram_gb),
        "recommended_gpu_index": _recommended_gpu_index(gpus, args.min_vram_gb),
    }

    if args.check_imports:
        summary["python_imports"] = _check_imports()

    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if free_disk_gb < args.min_free_disk_gb:
        raise SystemExit(
            f"Need at least {args.min_free_disk_gb} GiB free disk for Swallow 32B training."
        )
    if not eligible_gpus:
        raise SystemExit(
            f"No GPU with >= {args.min_vram_gb} GiB detected. Swallow 32B training is blocked."
        )


if __name__ == "__main__":
    main()
