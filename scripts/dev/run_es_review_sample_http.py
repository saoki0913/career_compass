"""
全9設問タイプの ES 添削サンプルを FastAPI HTTP 経由で出力するスクリプト (v2)。

アプリ実フローを再現:
  - char_min = char_max - 10 = 390 (handle-review-stream.ts / es_review.py と同じ導出)
  - FastAPI /api/es/review/stream (SSE) 経由
  - 元回答は長短ミックス (200〜350字 × 6 + 50〜120字 × 3)

使い方:
  # 1. FastAPI を起動
  npx dotenv -e .env.local -- uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

  # 2. スクリプト実行
  npx dotenv -e .env.local -- python scripts/dev/run_es_review_sample_http.py
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
import time
import httpx

FASTAPI_BASE = "http://127.0.0.1:8000"
ENDPOINT = "/api/es/review/stream"
CHAR_MAX = 400
CHAR_MIN = CHAR_MAX - 10  # 390 — アプリ実フローと同じ導出
LLM_MODEL = "claude-sonnet"

TEMPLATE_LABELS: dict[str, str] = {
    "company_motivation": "企業志望理由",
    "role_course_reason": "コース志望理由",
    "intern_reason": "インターン参加理由",
    "intern_goals": "インターンで学びたいこと",
    "post_join_goals": "入社後にやりたいこと",
    "self_pr": "自己PR",
    "gakuchika": "ガクチカ",
    "work_values": "働く上で大切にしていること",
    "basic": "汎用",
}

# ---------------------------------------------------------------------------
# テストケース定義 (9件)
# ---------------------------------------------------------------------------
# リアル長 (200〜350字) × 6 + 短文 (50〜120字) × 3
CASES: list[dict] = [
    # ── リアル長入力 (200〜350字) ──────────────────────────
    {
        "id": 1,
        "template_type": "company_motivation",
        "company_name": "三菱商事",
        "role_name": "総合職",
        "question": "三菱商事を志望する理由を400字以内で教えてください。",
        "answer": (
            "研究活動を通じて、仮説を立てて検証を繰り返し、得られた知見を論理的に整理して"
            "価値ある結論へと導く力を養ってきた。特に、複数の関係者と議論しながら研究の方向性を"
            "すり合わせ、限られたリソースの中で最大の成果を出すための優先順位づけに注力してきた。"
            "この経験を通じて、事業の全体像を俯瞰しながら各ステークホルダーの利害を調整し、"
            "社会に届く価値を生み出す仕事に携わりたいという思いが強まった。"
            "貴社は成長領域への投資を積極的に進め、若手にも早期から挑戦の機会を与える環境があると理解している。"
        ),
        "input_category": "リアル長",
    },
    {
        "id": 2,
        "template_type": "role_course_reason",
        "company_name": "三菱商事",
        "role_name": "デジタル企画",
        "question": "デジタル企画コースを志望する理由を400字以内で教えてください。",
        "answer": (
            "事業課題の本質を見極め、テクノロジーを手段として解決策を設計・実行する役割に強い関心がある。"
            "研究では課題を構造化し、データに基づく仮説検証を繰り返しながら、"
            "指導教員や共同研究者と認識をそろえて議論を前進させてきた。"
            "この過程で培った構造化思考と合意形成の力は、事業部門と技術部門の橋渡しをする"
            "デジタル企画の役割に直結すると考える。"
            "貴社のデジタル企画コースでは、データと事業知見を組み合わせて現場の価値創出を加速する"
            "取り組みが進んでいると聞いており、自分の強みを最も発揮できる環境だと確信している。"
        ),
        "input_category": "リアル長",
    },
    {
        "id": 3,
        "template_type": "post_join_goals",
        "company_name": "三菱商事",
        "role_name": "総合職",
        "question": "三菱商事で手掛けてみたいビジネスや、働く中で獲得したい経験・スキルについて、400字以内で教えてください。",
        "answer": (
            "入社後まず現場で事業理解を深め、投資判断や事業開発に必要な論点整理と検証の力を"
            "確実に身につけたい。研究では複数の仮説を比較検討し、関係者の認識をそろえながら"
            "実行可能な方針に落とし込む作業を繰り返してきた。この経験を土台に、"
            "まずは産業構造や取引の実態を現場で吸収し、事業の可否を判断するための"
            "論点の精度を高めていきたい。将来的には、社会課題の解決につながる"
            "新規事業機会の発掘から実現まで一貫して関わり、多様なステークホルダーを巻き込みながら"
            "価値を形にできる人材へ成長したいと考えている。"
        ),
        "input_category": "リアル長",
    },
    {
        "id": 4,
        "template_type": "self_pr",
        "company_name": "三菱商事",
        "question": "あなたの強みを400字以内で教えてください。",
        "answer": (
            "複雑な状況でも論点を整理し、周囲の認識をそろえながら議論を前進させる力が"
            "自分の強みである。研究室のゼミ討論では意見が拡散しがちな場面で、"
            "まず論点を書き出して全員が見える形に整理し、次に各自の役割を明示することで"
            "議論の収束を促してきた。この行動の根底には、認識のずれが放置されると"
            "判断の質が下がるという問題意識がある。曖昧さを残さず言語化し、"
            "全員が同じ前提で議論できる状態をつくることを習慣としてきた。"
            "この力は、多様な関係者と意思決定を進める環境で直接発揮できると考える。"
        ),
        "input_category": "リアル長",
    },
    {
        "id": 5,
        "template_type": "work_values",
        "company_name": "三菱商事",
        "question": "働くうえで大切にしていることを400字以内で教えてください。",
        "answer": (
            "自律的に学び続け、得た知識を現場の判断に直結させることを最も大切にしている。"
            "研究室では議論が停滞するたびに論点を書き出して整理し、"
            "各メンバーの役割を明示することでチームの意思決定を前に進めてきた。"
            "この経験から、学びは蓄積するだけでなく、その場の課題に即して形にして"
            "初めて意味を持つと確信している。多様な立場の関係者と協働しながら"
            "判断を積み重ねる環境でも、この姿勢を軸に貢献したい。"
            "具体的には、常に現場の声を拾い、自分なりの仮説を持ったうえで"
            "関係者と議論に臨むことで、チーム全体の意思決定の質を底上げしていきたい。"
        ),
        "input_category": "リアル長",
    },
    {
        "id": 6,
        "template_type": "basic",
        "company_name": "三菱商事",
        "question": "自己PRと志望動機を400字以内にまとめてください。",
        "answer": (
            "議論が拡散する局面で論点を絞り、合意を形成して前進させる力が自分の強みだ。"
            "研究室での議論では、論点が散らばるたびに仮説を立てて検証サイクルを回し、"
            "各自の役割を明確にすることで停滞を打開してきた。この経験から、"
            "曖昧な状況でも構造を与えて意思決定を動かす姿勢が身についた。"
            "貴社が社会に価値を届ける事業を展開するなかで、現場の複雑な論点を整理し、"
            "関係者が判断を下せる状態をつくることで意思決定の質を高める役割を担いたい。"
            "事業の現場で多様な観点を束ね、実行可能な方針へ落とし込む経験を積みながら、"
            "自分自身も視野を広げていきたいと考えている。"
        ),
        "input_category": "リアル長",
    },
    # ── 短文入力 (50〜120字) ──────────────────────────────
    {
        "id": 7,
        "template_type": "intern_reason",
        "company_name": "三井物産",
        "role_name": "Business Intelligence",
        "intern_name": "Business Intelligence Internship",
        "question": "Business Intelligence Internshipの参加理由を400字以内で教えてください。",
        "answer": "研究で磨いた分析力を、実務に近い課題で試しながら意思決定へつなげる視点を学びたい。",
        "input_category": "短文",
    },
    {
        "id": 8,
        "template_type": "intern_goals",
        "company_name": "三井物産",
        "role_name": "Business Intelligence",
        "intern_name": "Business Intelligence Internship",
        "question": "インターンで学びたいことを400字以内で教えてください。",
        "answer": (
            "分析を意思決定へつなげる思考を、実務に近い環境で確かめたい。"
            "研究では仮説検証を回してきたが、事業や顧客の制約を踏まえて優先順位をつける経験はまだ足りない。"
        ),
        "input_category": "短文",
    },
    {
        "id": 9,
        "template_type": "gakuchika",
        "company_name": "三菱商事",
        "question": "学生時代に力を入れたことを400字以内で教えてください。",
        "answer": "研究室で進捗共有の型を見直し、情報の滞留を減らした。論点を整理し、役割分担と共有頻度を調整して、チーム全体の前進を支えた。",
        "input_category": "短文",
    },
]


def _build_request_body(case: dict) -> dict:
    """アプリ実フローと同じリクエストボディを構築"""
    template_request: dict = {
        "template_type": case["template_type"],
        "company_name": case.get("company_name"),
        "question": case["question"],
        "answer": case["answer"],
        "char_min": CHAR_MIN,
        "char_max": CHAR_MAX,
    }
    if case.get("role_name"):
        template_request["role_name"] = case["role_name"]
    if case.get("intern_name"):
        template_request["intern_name"] = case["intern_name"]

    return {
        "content": case["answer"],
        "section_title": case["question"],
        "section_char_limit": CHAR_MAX,
        "template_request": template_request,
        "llm_model": LLM_MODEL,
    }


def _parse_sse_events(response: httpx.Response) -> dict | None:
    """SSE ストリームを読み、complete or error イベントを返す"""
    for line in response.iter_lines():
        if not line.startswith("data: "):
            continue
        raw = line[6:]
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            continue

        event_type = event.get("type", "")
        if event_type == "progress":
            label = event.get("label", "")
            progress = event.get("progress", 0)
            print(f"  [{progress:3d}%] {label}", flush=True)
        elif event_type == "string_chunk":
            # リアルタイムチャンク — 表示しない (complete で全文取得)
            pass
        elif event_type == "complete":
            return event
        elif event_type == "error":
            return event
    return None


def _generate_jwt() -> str | None:
    """INTERNAL_API_JWT_SECRET から HS256 JWT を生成。未設定なら None。"""
    secret = os.environ.get("INTERNAL_API_JWT_SECRET", "").strip()
    if not secret:
        return None

    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    now = int(time.time())
    payload_data = {
        "iss": "next-bff",
        "aud": "career-compass-fastapi",
        "sub": "next-bff",
        "service": "next-bff",
        "iat": now,
        "nbf": now,
        "exp": now + 3600,
    }
    payload = base64.urlsafe_b64encode(json.dumps(payload_data).encode()).decode().rstrip("=")
    signed = f"{header}.{payload}".encode()
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), signed, hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{header}.{payload}.{signature}"


def _check_server() -> bool:
    """FastAPI が起動しているか確認"""
    try:
        r = httpx.get(f"{FASTAPI_BASE}/health", timeout=3)
        return r.status_code == 200
    except httpx.ConnectError:
        return False


def main() -> None:
    if not _check_server():
        print("ERROR: FastAPI サーバーが起動していません。")
        print("  npx dotenv -e .env.local -- uvicorn backend.app.main:app --host 127.0.0.1 --port 8000")
        sys.exit(1)

    jwt_token = _generate_jwt()
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if jwt_token:
        headers["Authorization"] = f"Bearer {jwt_token}"
        print("  JWT 認証トークン生成済み")
    else:
        print("  INTERNAL_API_JWT_SECRET 未設定 — localhost バイパスで認証")

    total = len(CASES)
    results: list[dict] = []
    print(f"ES 添削サンプル出力 v2: {total} 設問タイプ × {CHAR_MAX}字上限 × {LLM_MODEL}")
    print(f"  char_min={CHAR_MIN}, char_max={CHAR_MAX} (アプリ実フロー再現)")
    print(f"{'=' * 60}")

    for case in CASES:
        idx = case["id"]
        ttype = case["template_type"]
        label = TEMPLATE_LABELS.get(ttype, ttype)
        answer_len = len(case["answer"])

        print(f"\n{'=' * 60}")
        print(f"[{idx}/{total}] {ttype}（{label}）— {case['input_category']}入力")
        print(f"{'=' * 60}")
        print(f"  企業      : {case.get('company_name', '(なし)')}")
        if case.get("role_name"):
            print(f"  職種/コース: {case['role_name']}")
        if case.get("intern_name"):
            print(f"  インターン : {case['intern_name']}")
        print(f"  文字数制限: {CHAR_MIN}〜{CHAR_MAX}字")
        print(f"\n■ 設問:\n  {case['question']}")
        print(f"\n■ 元回答 ({answer_len}字):\n  {case['answer']}")
        print(f"\n  SSE ストリーム受信中...", flush=True)

        body = _build_request_body(case)
        try:
            with httpx.stream(
                "POST",
                f"{FASTAPI_BASE}{ENDPOINT}",
                json=body,
                headers=headers,
                timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10),
            ) as response:
                if response.status_code != 200:
                    print(f"\n  *** HTTP {response.status_code}")
                    response.read()
                    print(f"  {response.text[:500]}")
                    continue

                event = _parse_sse_events(response)

            if event is None:
                print("\n  *** SSE ストリームが終了しましたが complete/error イベントがありませんでした")
                continue

            if event.get("type") == "error":
                msg = event.get("message", "unknown error")
                print(f"\n  *** ERROR: {msg}")
                results.append({"id": idx, "template": f"{ttype}({label})", "category": case["input_category"], "input_len": answer_len, "output_len": 0, "status": "ERROR"})
                continue

            result = event.get("result", {})
            rewrites = result.get("rewrites", [])
            rewrite = rewrites[0] if rewrites else "(添削結果なし)"
            meta = result.get("review_meta", {})

            print(f"\n{'─' * 60}")
            print(f"■ 添削結果 ({len(rewrite)}字):\n")
            print(f"  {rewrite}")
            print(f"\n{'─' * 60}")
            print("■ メタ情報:")
            print(f"  - model: {meta.get('llm_model', '?')} / retries: {meta.get('rewrite_attempt_count', '?')} / length_fix: {meta.get('length_fix_result', '?')}")
            print(f"  - grounding: {meta.get('grounding_mode', '?')} / evidence: {meta.get('evidence_coverage_level', '?')} ({meta.get('company_evidence_count', 0)}件)")
            print(f"  - validation: {meta.get('rewrite_validation_status', '?')}")
            codes = meta.get("rewrite_validation_codes", [])
            if codes:
                print(f"  - validation_codes: {codes}")
            if meta.get("fallback_triggered"):
                print(f"  - fallback: {meta.get('fallback_reason', '?')}")
            length_policy = meta.get("length_policy", "")
            if length_policy and length_policy != "strict":
                print(f"  - length_policy: {length_policy}")

            results.append({
                "id": idx,
                "template": f"{ttype}({label})",
                "category": case["input_category"],
                "input_len": answer_len,
                "output_len": len(rewrite),
                "status": meta.get("rewrite_validation_status", "?"),
            })

        except httpx.ConnectError:
            print("\n  *** FastAPI サーバーへの接続に失敗しました")
            sys.exit(1)
        except Exception as e:
            print(f"\n  *** ERROR: {e}")

        print(f"{'=' * 60}")

    # サマリー表
    print(f"\n{'=' * 60}")
    print("■ サマリー")
    print(f"{'=' * 60}")
    header = f"{'#':>2} | {'テンプレート':<20} | {'入力種別':<6} | {'元':>4} | {'添削':>4} | {'status':<12}"
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r['id']:>2} | {r['template']:<20} | {r['category']:<6} | "
            f"{r['input_len']:>4} | {r['output_len']:>4} | {r['status']:<12}"
        )
    print(f"\n全 {total} 件完了。上記の各添削結果をレビューしてください。")


if __name__ == "__main__":
    main()
