#!/usr/bin/env python3
"""Compare per-request Modal GPU cost against Claude Sonnet pricing."""

from __future__ import annotations

import argparse
import json

GPU_RATE_PER_SECOND = {
    "A100-80GB": 2.50 / 3600,
    "H100-80GB": 4.55 / 3600,
    "L40S": 1.53 / 3600,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Estimate per-request serving cost.")
    parser.add_argument("--avg-input-tokens", type=int, required=True)
    parser.add_argument("--avg-output-tokens", type=int, required=True)
    parser.add_argument("--avg-gpu-seconds", type=float, required=True)
    parser.add_argument("--gpu-type", default="A100-80GB")
    parser.add_argument("--gpu-rate-per-second", type=float, default=0.0)
    parser.add_argument("--claude-input-rate-per-mtok", type=float, default=3.0)
    parser.add_argument("--claude-output-rate-per-mtok", type=float, default=15.0)
    args = parser.parse_args()

    gpu_rate = args.gpu_rate_per_second or GPU_RATE_PER_SECOND.get(args.gpu_type)
    if gpu_rate is None:
        raise SystemExit("Unknown gpu type. Provide --gpu-rate-per-second explicitly.")

    claude_cost = (
        (args.avg_input_tokens / 1_000_000) * args.claude_input_rate_per_mtok
        + (args.avg_output_tokens / 1_000_000) * args.claude_output_rate_per_mtok
    )
    modal_cost = args.avg_gpu_seconds * gpu_rate
    break_even_gpu_seconds = claude_cost / gpu_rate if gpu_rate > 0 else None

    print(
        json.dumps(
            {
                "gpu_type": args.gpu_type,
                "gpu_rate_per_second": round(gpu_rate, 8),
                "avg_input_tokens": args.avg_input_tokens,
                "avg_output_tokens": args.avg_output_tokens,
                "avg_gpu_seconds": args.avg_gpu_seconds,
                "claude_sonnet_per_request_usd": round(claude_cost, 6),
                "modal_gpu_per_request_usd": round(modal_cost, 6),
                "break_even_gpu_seconds": round(break_even_gpu_seconds, 2)
                if break_even_gpu_seconds is not None
                else None,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
