import json
from pathlib import Path

from app.utils.llm_prompt_safety import detect_es_injection_risk, detect_output_leakage

DATASET = Path(__file__).parent / "fixtures" / "prompt_safety_dataset.json"


def _load():
    return json.loads(DATASET.read_text(encoding="utf-8"))


def _holdout_items(items: list[dict]) -> list[dict]:
    return [i for i in items if i.get("split") == "holdout"]


def test_input_side_precision_recall():
    data = _load()["input_side"]
    positives = _holdout_items(data["positive"])
    negatives = _holdout_items(data["negative"])
    assert len(positives) >= 10, f"holdout positive too small: {len(positives)}"
    assert len(negatives) >= 20, f"holdout negative too small: {len(negatives)}"

    tp = fp = fn = tn = 0
    for item in positives:
        risk, _ = detect_es_injection_risk(item["text"])
        if risk in ("high", "medium"):
            tp += 1
        else:
            fn += 1
    for item in negatives:
        risk, _ = detect_es_injection_risk(item["text"])
        if risk in ("high", "medium"):
            fp += 1
        else:
            tn += 1

    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0
    assert precision >= 0.95, f"input precision {precision:.3f} (tp={tp}, fp={fp})"
    assert recall >= 0.90, f"input recall {recall:.3f} (tp={tp}, fn={fn})"


def test_output_side_precision_recall():
    data = _load()["output_side"]
    positives = _holdout_items(data["positive"])
    negatives = _holdout_items(data["negative"])
    assert len(positives) >= 5, f"holdout positive too small: {len(positives)}"
    assert len(negatives) >= 10, f"holdout negative too small: {len(negatives)}"

    tp = fp = fn = tn = 0
    for item in positives:
        r = detect_output_leakage(item["text"])
        if r.is_leaked:
            tp += 1
        else:
            fn += 1
    for item in negatives:
        r = detect_output_leakage(item["text"])
        if r.is_leaked:
            fp += 1
        else:
            tn += 1

    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0
    assert precision >= 0.95, f"output precision {precision:.3f} (tp={tp}, fp={fp})"
    assert recall >= 0.90, f"output recall {recall:.3f} (tp={tp}, fn={fn})"


def test_dataset_size_requirements():
    data = _load()
    inp = data["input_side"]
    out = data["output_side"]
    assert len(inp["positive"]) >= 50, f"input positive: {len(inp['positive'])}"
    assert len(inp["negative"]) >= 100, f"input negative: {len(inp['negative'])}"
    assert len(out["positive"]) >= 30, f"output positive: {len(out['positive'])}"
    assert len(out["negative"]) >= 60, f"output negative: {len(out['negative'])}"
