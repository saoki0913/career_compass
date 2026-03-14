"""Serve the fine-tuned Qwen ES review model on Modal with vLLM."""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path

import modal

APP_NAME = os.environ.get("QWEN_MODAL_APP_NAME", "career-compass-qwen-es-review-swallow-32b")


def _resolve_project_root() -> Path:
    current = Path(__file__).resolve()
    for candidate in [current.parent, *current.parents]:
        if (candidate / ".env.local").exists():
            return candidate
    return current.parent


ROOT = _resolve_project_root()


def _load_local_env() -> dict[str, str]:
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return {}

    values: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip('"')
    return values


LOCAL_ENV = _load_local_env()


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name) or LOCAL_ENV.get(name, default)


MODEL_NAME = _env("QWEN_MODAL_MODEL_NAME", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")
SERVED_MODEL_NAME = _env("QWEN_MODAL_SERVED_MODEL_NAME", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")
ADAPTER_ALIAS = _env("QWEN_MODAL_ADAPTER_ALIAS", "es_review")
ADAPTER_DIRNAME = _env("QWEN_MODAL_ADAPTER_DIRNAME", "qwen3-swallow-32b-es-review-lora")
ADAPTER_REPO_ID = _env("QWEN_MODAL_ADAPTER_REPO_ID", "saoki0913/career-compass-qwen3-swallow-32b-es-review-lora")
GPU_TYPE = _env("QWEN_MODAL_GPU", "A100-80GB")
MAX_MODEL_LEN = _env("QWEN_MODAL_MAX_MODEL_LEN", "8192")
API_KEY = _env("QWEN_MODAL_API_KEY", "local-qwen")
FAST_BOOT = _env("QWEN_MODAL_FAST_BOOT", "false").lower() == "true"
PROFILE = _env("QWEN_MODAL_PROFILE", "interactive").strip().lower() or "interactive"
DEFAULT_REASONING_PARSER = "" if PROFILE == "interactive" else "qwen3"
REASONING_PARSER = _env("QWEN_MODAL_REASONING_PARSER", DEFAULT_REASONING_PARSER)

HF_CACHE_DIR = "/cache/hf"
VLLM_CACHE_DIR = "/cache/vllm"
ADAPTER_DIR = f"/adapters/{ADAPTER_DIRNAME}"

app = modal.App(APP_NAME)

secret_values = {
    key: value
    for key, value in {
        "HF_TOKEN": _env("HF_TOKEN", ""),
        "QWEN_MODAL_API_KEY": _env("QWEN_MODAL_API_KEY", ""),
        "QWEN_MODAL_ADAPTER_REPO_ID": _env("QWEN_MODAL_ADAPTER_REPO_ID", ""),
        "QWEN_MODAL_MODEL_NAME": _env("QWEN_MODAL_MODEL_NAME", ""),
        "QWEN_MODAL_SERVED_MODEL_NAME": _env("QWEN_MODAL_SERVED_MODEL_NAME", ""),
        "QWEN_MODAL_ADAPTER_ALIAS": _env("QWEN_MODAL_ADAPTER_ALIAS", ""),
        "QWEN_MODAL_ADAPTER_DIRNAME": _env("QWEN_MODAL_ADAPTER_DIRNAME", ""),
        "QWEN_MODAL_GPU": _env("QWEN_MODAL_GPU", ""),
        "QWEN_MODAL_MAX_MODEL_LEN": _env("QWEN_MODAL_MAX_MODEL_LEN", ""),
        "QWEN_MODAL_PROFILE": _env("QWEN_MODAL_PROFILE", ""),
        "QWEN_MODAL_FAST_BOOT": _env("QWEN_MODAL_FAST_BOOT", ""),
        "QWEN_MODAL_REASONING_PARSER": _env("QWEN_MODAL_REASONING_PARSER", ""),
    }.items()
    if value
}
modal_secrets = [modal.Secret.from_dict(secret_values)] if secret_values else []

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .uv_pip_install(
        "vllm==0.10.2",
        "huggingface_hub[hf_transfer]==0.35.0",
        "flashinfer-python==0.3.1",
        "torch==2.8.0",
        "requests>=2.32.0",
    )
    .env(
        {
            "HF_HUB_ENABLE_HF_TRANSFER": "1",
            "HF_HOME": HF_CACHE_DIR,
            "VLLM_DISABLE_COMPILE_CACHE": "0",
        }
    )
)

hf_cache_volume = modal.Volume.from_name("career-compass-hf-cache", create_if_missing=True)
vllm_cache_volume = modal.Volume.from_name("career-compass-vllm-cache", create_if_missing=True)
adapter_volume = modal.Volume.from_name("career-compass-qwen-es-review-adapter", create_if_missing=True)


def _build_vllm_command() -> list[str]:
    command = [
        "python",
        "-m",
        "vllm.entrypoints.openai.api_server",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
        "--model",
        MODEL_NAME,
        "--served-model-name",
        SERVED_MODEL_NAME,
        "--max-model-len",
        MAX_MODEL_LEN,
        "--api-key",
        API_KEY,
        "--enable-lora",
        "--lora-modules",
        f"{ADAPTER_ALIAS}={ADAPTER_DIR}",
        "--generation-config",
        "vllm",
    ]
    if REASONING_PARSER:
        command.extend(["--reasoning-parser", REASONING_PARSER])
    if PROFILE == "interactive":
        command.extend(
            [
                "--gpu-memory-utilization",
                "0.85",
                "--max-num-seqs",
                "2",
            ]
        )
        if FAST_BOOT:
            command.append("--enforce-eager")
    elif FAST_BOOT:
        command.extend(
            [
                "--enforce-eager",
                "--max-num-seqs",
                "8",
            ]
        )
    else:
        command.extend(
            [
                "--gpu-memory-utilization",
                "0.92",
                "--max-num-seqs",
                "16",
            ]
        )
    return command


def _ensure_adapter_present() -> None:
    adapter_path = Path(ADAPTER_DIR)
    if (adapter_path / "adapter_config.json").exists():
        return
    if not ADAPTER_REPO_ID:
        raise RuntimeError(
            "LoRA adapter not found locally and QWEN_MODAL_ADAPTER_REPO_ID is unset."
        )

    from huggingface_hub import snapshot_download

    adapter_path.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=ADAPTER_REPO_ID,
        repo_type="model",
        local_dir=str(adapter_path),
        local_dir_use_symlinks=False,
        token=os.environ.get("HF_TOKEN"),
    )
    adapter_volume.commit()


@app.function(
    image=image,
    gpu=GPU_TYPE,
    scaledown_window=900,
    timeout=60 * 60,
    volumes={
        HF_CACHE_DIR: hf_cache_volume,
        VLLM_CACHE_DIR: vllm_cache_volume,
        "/adapters": adapter_volume,
    },
    secrets=modal_secrets,
)
@modal.web_server(8000, startup_timeout=60 * 30)
def serve() -> None:
    _ensure_adapter_present()

    process = subprocess.Popen(_build_vllm_command())
    if process.poll() is not None:
        raise RuntimeError("vLLM failed to start")

    # Give the vLLM subprocess time to bind before Modal begins proxying traffic.
    time.sleep(20)


@app.function(
    image=image,
    timeout=60 * 30,
    volumes={
        "/adapters": adapter_volume,
    },
    secrets=modal_secrets,
)
def upload_adapter(local_adapter_dir: str) -> str:
    """Copy adapter files from a mounted local directory into the Modal volume."""
    source = Path(local_adapter_dir)
    if not source.exists():
        raise FileNotFoundError(f"Adapter dir not found: {source}")

    destination = Path(ADAPTER_DIR)
    destination.mkdir(parents=True, exist_ok=True)
    for item in source.iterdir():
        target = destination / item.name
        if item.is_dir():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)

    adapter_volume.commit()
    return str(destination)


@app.local_entrypoint()
def main(healthcheck_url: str = "") -> None:
    if not healthcheck_url:
        print("Provide --healthcheck-url once the Modal deployment is live.")
        return

    import requests

    response = requests.get(f"{healthcheck_url.rstrip('/')}/health", timeout=60)
    response.raise_for_status()
    print(response.text)
