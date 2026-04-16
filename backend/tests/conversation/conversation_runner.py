"""Conversation loop runner for AI Live tests (pytest + httpx).

Ports SSE parsing and conversation loop logic from
e2e/live-ai-conversations.spec.ts so the same scenario coverage can run
inside the pytest suite against a staging or local backend via a
StagingClient (any object with an async `request(method, path, json?)` that
returns an httpx.Response).
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

# Overall timeout for a single conversation loop (matches TypeScript's 5-min budget)
CONVERSATION_TIMEOUT_SECONDS = 300

# ---------------------------------------------------------------------------
# Fallback answer banks (ported verbatim from the TypeScript source)
# ---------------------------------------------------------------------------

GAKUCHIKA_FALLBACK_ANSWERS: list[str] = [
    "宿題未提出が続く生徒が増え、保護者からも学習習慣への相談が続いていたため、校舎全体で対応を見直す必要がありました。",
    "私は担当講師としてだけでなく、他の講師も同じ基準で動けるように共有フォーマットを整える役割も担いました。",
    "宿題提出率と面談メモを見て要注意生徒から優先して声かけし、週次ミーティングで改善提案を回しました。",
    "その結果、宿題提出率が上がり、保護者相談への初期対応も早くなって学習継続率の改善につながりました。",
    "数字と現場の声を両方見て基準をそろえることで、個人依存ではなく再現性ある改善になると学びました。",
]

MOTIVATION_FALLBACK_ANSWERS: list[str] = [
    "大学の企画運営で非効率な進行を立て直した経験から、仕組みで顧客課題を減らせる仕事に関心を持ちました。",
    "株式会社テストDXはDX推進を通じて現場課題を整理し改善まで伴走できる点が魅力です。",
    "大学では関係者の意見を整理し、優先順位を決めて改善を進めたため、企画職でもその強みを活かせます。",
    "入社後は現場に近い位置で課題を構造化し、提案から実行までやり切る企画として価値を出したいです。",
    "他社よりも御社を志望するのは、若手でも仮説を持って改善提案できる環境があると感じているからです。",
]

MOTIVATION_EXPERIENCE_FALLBACKS: list[str] = [
    "学園祭運営で申請漏れが重なり、確認フローを整理して混乱を減らした経験が原体験です。",
    "ゼミの共同発表で情報共有の型を作った結果、準備の抜け漏れが減り、仕組みで現場を楽にできると実感しました。",
    "大学の企画運営で現場の負荷を下げる改善を続けた経験から、課題整理を仕事にしたいと考えるようになりました。",
]


# ---------------------------------------------------------------------------
# SSE parsing helpers
# ---------------------------------------------------------------------------


def parse_sse_events(raw_text: str) -> list[dict[str, Any]]:
    """Split raw SSE text by double newline, find ``data: `` lines, parse JSON.

    Returns a list of parsed event dicts.  Lines that fail JSON parsing are
    silently skipped, matching the TypeScript implementation.
    """
    normalized = raw_text.replace("\r\n", "\n")
    blocks = normalized.split("\n\n")
    events: list[dict[str, Any]] = []
    for block in blocks:
        stripped = block.strip()
        if not stripped:
            continue
        data_line: str | None = None
        for line in stripped.split("\n"):
            if line.startswith("data: "):
                data_line = line
                break
        if data_line is None:
            continue
        payload = data_line[len("data: "):].strip()
        try:
            events.append(json.loads(payload))
        except json.JSONDecodeError:
            pass
    return events


def parse_complete_data(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Return the ``data`` payload of the last ``complete`` event.

    Raises ``ValueError`` if no complete event is present, matching the
    TypeScript ``parseCompleteData`` which throws in that case.
    """
    complete_events = [e for e in events if e.get("type") == "complete"]
    if not complete_events:
        raise ValueError("stream did not emit a complete event")
    last = complete_events[-1]
    data = last.get("data")
    if isinstance(data, dict):
        return data
    return {}


def collect_chunks(events: list[dict[str, Any]], path_name: str) -> str:
    """Concatenate text from events with ``type=string_chunk`` and matching path."""
    parts: list[str] = []
    for event in events:
        if event.get("type") == "string_chunk" and event.get("path") == path_name:
            parts.append(str(event.get("text") or ""))
    return "".join(parts)


# ---------------------------------------------------------------------------
# Draft-ready detection
# ---------------------------------------------------------------------------


def is_gakuchika_draft_ready(complete_data: dict[str, Any] | None) -> bool:
    """Return True when the gakuchika conversation has reached a draft-ready state.

    Mirrors ``isGakuchikaDraftReady`` from the TypeScript source exactly:

    - ``isCompleted == True``
    - ``isInterviewReady == True``
    - ``conversationState.readyForDraft == True``
    - ``conversationState.stage in ("draft_ready", "interview_ready")``
    - ``nextAction in ("show_generate_draft_cta", "continue_deep_dive", "show_interview_ready")``
    """
    if not complete_data:
        return False

    conversation_state = complete_data.get("conversationState")
    if not isinstance(conversation_state, dict):
        conversation_state = {}

    next_action = complete_data.get("nextAction", "")
    if not isinstance(next_action, str):
        next_action = ""

    stage = conversation_state.get("stage", "")
    if not isinstance(stage, str):
        stage = ""

    return (
        complete_data.get("isCompleted") is True
        or complete_data.get("isInterviewReady") is True
        or conversation_state.get("readyForDraft") is True
        or stage == "draft_ready"
        or stage == "interview_ready"
        or next_action == "show_generate_draft_cta"
        or next_action == "continue_deep_dive"
        or next_action == "show_interview_ready"
    )


# ---------------------------------------------------------------------------
# Deterministic follow-up answer generators
# ---------------------------------------------------------------------------


def build_deterministic_gakuchika_followup(
    next_question: str,
    attempt_index: int,
    latest_complete: dict[str, Any] | None = None,
    case_answers: list[str] | None = None,
) -> str:
    """Generate a deterministic gakuchika follow-up answer based on question context.

    Ported from ``buildDeterministicGakuchikaFollowupAnswer`` (lines 745-784 of
    ``e2e/live-ai-conversations.spec.ts``), with case-awareness.

    When ``case_answers`` is provided, answers are drawn from the case's own
    answer bank to stay on-topic.  Falls back to ``GAKUCHIKA_FALLBACK_ANSWERS``
    only when no case-specific answers are available.

    Priority order:
    1. Match explicit question patterns → map to the appropriate dimension
       index in the answer bank.
    2. Fall back to ``conversationState.focusKey`` or first
       ``conversationState.missingElements`` entry.
    3. Default to answer bank indexed by ``attempt_index`` (cycling).
    """
    bank = case_answers if case_answers and len(case_answers) >= 4 else GAKUCHIKA_FALLBACK_ANSWERS

    def _pick(dimension_index: int) -> str:
        """Pick from the bank, mapping dimension to a bank index."""
        # Map 5 dimensions (0-4) to bank positions:
        #   0=context/challenge, 1=role/task, 2=action/reasoning,
        #   3=result/evidence, 4+=learning/reflection
        if len(bank) <= 5:
            return bank[min(dimension_index, len(bank) - 1)]
        # For larger banks (8+ answers), use the second half for
        # role-clarity, action-reasoning, result-evidence, learning
        dim_map = {
            0: 0,  # context → first answer
            1: 4 if len(bank) > 4 else 1,  # role → 5th answer (role clarity)
            2: 5 if len(bank) > 5 else 2,  # action reasoning → 6th answer
            3: 6 if len(bank) > 6 else 3,  # result evidence → 7th answer
            4: 7 if len(bank) > 7 else min(len(bank) - 1, 4),  # learning → 8th answer
        }
        idx = dim_map.get(dimension_index, dimension_index % len(bank))
        return bank[idx]

    conversation_state: dict[str, Any] = {}
    if isinstance(latest_complete, dict):
        cs = latest_complete.get("conversationState")
        if isinstance(cs, dict):
            conversation_state = cs

    focus_key_raw = conversation_state.get("focusKey")
    if isinstance(focus_key_raw, str):
        focus_key = focus_key_raw
    else:
        missing = conversation_state.get("missingElements")
        if isinstance(missing, list):
            focus_key = next(
                (v for v in missing if isinstance(v, str)),
                "",
            )
        else:
            focus_key = ""

    normalized = re.sub(r"\s+", "", next_question.strip())

    # Explicit question-pattern matches take priority over focusKey
    if re.search(r"結果|変化|どれだけ|改善|成果|前後で|どのような変化|見られたか", normalized):
        return _pick(3)
    if re.search(r"学び|今後|活か|再現", normalized):
        return _pick(4)
    if re.search(r"基準|判断軸|優先|なぜその順番|どう決め", normalized):
        return _pick(2)
    if re.search(r"課題|きっかけ|どんな場面|背景", normalized):
        return _pick(0)
    if re.search(r"役割|どこまで判断|担当", normalized):
        return _pick(1)

    # focusKey fallback
    if focus_key in ("context", "challenge"):
        return _pick(0)
    if focus_key in ("role", "task"):
        return _pick(1)
    if focus_key in ("action", "action_reason"):
        return _pick(2)
    if focus_key in ("result", "result_evidence"):
        return _pick(3)
    if focus_key in ("learning", "learning_transfer"):
        return _pick(4)

    # Cycle through the bank to avoid repeating the same answer
    return bank[attempt_index % len(bank)]


def build_deterministic_motivation_followup(
    next_question: str,
    attempt_index: int,
    latest_complete: dict[str, Any] | None = None,
) -> str:
    """Generate a deterministic motivation follow-up answer based on question context.

    Ported from ``buildDeterministicMotivationFollowupAnswer`` (lines 634-735 of
    ``e2e/live-ai-conversations.spec.ts``).

    Priority order:
    1. ``questionStage`` from ``latest_complete`` (or ``stageStatus.current``).
    2. Normalised question text patterns.
    3. Default to ``MOTIVATION_FALLBACK_ANSWERS`` indexed by ``attempt_index``.
    """
    question_stage = ""
    if isinstance(latest_complete, dict):
        qs = latest_complete.get("questionStage")
        if isinstance(qs, str):
            question_stage = qs
        else:
            stage_status = latest_complete.get("stageStatus")
            if isinstance(stage_status, dict):
                current = stage_status.get("current")
                if isinstance(current, str):
                    question_stage = current

    normalized = re.sub(r"\s+", "", next_question.strip())

    # Stage-driven targeted answers
    if question_stage == "industry_reason":
        return (
            "学園祭運営で申請と連絡の流れを整理し、確認漏れを減らした経験から、"
            "業務改革で顧客課題を減らせるIT業界を志望しています。"
        )
    if question_stage == "company_reason":
        return (
            "株式会社テストDXは現場の業務改革を企画から実装まで支援しており、"
            "企画職として課題整理から提案まで担える点に魅力を感じています。"
        )
    if question_stage == "self_connection":
        return (
            "大学の企画運営では関係者の要望を整理し、優先順位を決めて改善を進めてきたため、"
            "企画職でも論点整理と巻き込み力を活かせます。"
        )
    if question_stage == "desired_work":
        return "入社後は現場ヒアリングを通じて課題を構造化し、実行可能な改善企画に落とし込む役割を担いたいです。"
    if question_stage == "value_contribution":
        return "まずは利用部門の声を定量・定性の両面で整理し、関係者を巻き込みながら改善提案を前に進めたいです。"
    if question_stage == "differentiation":
        return "他社比較では事業の広さより、顧客業務に入り込み改善を回し続けられる点で御社の志望度が高いです。"

    # Question-text pattern matches
    if re.search(r"他社|御社|この会社|選ぶ理由|志望理由", normalized):
        return (
            "他社よりも御社を志望するのは、DX推進で現場課題を構造化し、"
            "若手でも改善提案まで担える環境に魅力を感じているからです。"
        )
    if re.search(r"原体験|きっかけ|経験|関心を持った", normalized):
        return MOTIVATION_EXPERIENCE_FALLBACKS[attempt_index % len(MOTIVATION_EXPERIENCE_FALLBACKS)]
    if re.search(r"印象に残っている場面|どの場面|最初のきっかけ", normalized):
        return (
            "学園祭準備で申請状況の共有が曖昧で当日対応が遅れた場面があり、"
            "関係者一覧と確認フローを作って改善したことが印象に残っています。"
        )
    if re.search(r"企画職|活かせる|強み|再現", normalized):
        return (
            "大学では関係者の意見を整理し、優先順位を決めて改善を進めてきたため、"
            "企画職でも論点整理と巻き込み力を活かして貢献できます。"
        )
    if re.search(r"入社後|挑戦|やりたい|貢献", normalized):
        return (
            "入社後は現場に近い位置で課題を構造化し、関係者を巻き込みながら"
            "提案から実行までやり切る企画として価値を出したいです。"
        )
    if re.search(r"IT・通信|業界|顧客課題|業務改革", normalized):
        return (
            "IT・通信業界を志望するのは、仕組みや業務改革によって顧客課題を"
            "継続的に減らせる点に魅力を感じているからです。"
        )

    return MOTIVATION_FALLBACK_ANSWERS[min(attempt_index, len(MOTIVATION_FALLBACK_ANSWERS) - 1)]


# ---------------------------------------------------------------------------
# Transcript helper
# ---------------------------------------------------------------------------


def push_assistant_if_present(transcript: list[dict[str, str]], content: str) -> None:
    """Append an assistant turn to transcript only when content is non-empty."""
    if content.strip():
        transcript.append({"role": "assistant", "content": content})


# ---------------------------------------------------------------------------
# Conversation loop helpers
# ---------------------------------------------------------------------------


async def _read_response_body(response: Any, label: str) -> str:
    """Return response body text, raising on non-2xx status codes."""
    body: str = response.text
    if response.status_code < 200 or response.status_code >= 300:
        raise RuntimeError(
            f"{label} failed with {response.status_code}\n{body[:1200]}"
        )
    return body


async def run_gakuchika_conversation(
    client: Any,
    gakuchika_id: str,
    answers: list[str],
    transcript: list[dict[str, str]] | None = None,
    timeout: float = CONVERSATION_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Run full gakuchika conversation loop.

    Steps:
    1. POST /api/gakuchika/{id}/conversation/new — start a fresh session.
    2. Loop: send each answer (then fallback answers) via
       POST /api/gakuchika/{id}/conversation/stream.
    3. Parse SSE events; check ``is_gakuchika_draft_ready`` after each turn.
    4. On HTTP 429, retry with exponential back-off (max 12 retries).

    Parameters
    ----------
    client:
        Any object with ``async request(method, path, **kwargs) -> httpx.Response``.
    gakuchika_id:
        DB id of the gakuchika resource.
    answers:
        Explicit answers to supply first.  After exhaustion, deterministic
        fallback answers are generated automatically.
    transcript:
        Optional list that will be mutated in-place with user/assistant turns.
    timeout:
        Overall timeout in seconds for the entire conversation loop.

    Returns
    -------
    dict
        The ``data`` payload of the last ``complete`` SSE event.

    Raises
    ------
    RuntimeError
        If the conversation does not reach draft-ready within the attempt budget.
    asyncio.TimeoutError
        If the conversation exceeds the overall timeout.
    """
    if transcript is None:
        transcript = []

    async def _loop() -> dict[str, Any]:
        start_response = await client.request(
            "POST", f"/api/gakuchika/{gakuchika_id}/conversation/new", json={}
        )
        start_body_text = await _read_response_body(
            start_response, f"gakuchika start {gakuchika_id}"
        )
        start_body: dict[str, Any] = json.loads(start_body_text)

        session_id: str = start_body["conversation"]["id"]
        messages: list[dict[str, str]] = start_body.get("messages") or []
        first_question: str = start_body.get("nextQuestion") or (messages[0].get("content") if messages else "") or ""
        push_assistant_if_present(transcript, first_question)
        print(f"  [gak] started session={session_id} q0={first_question[:80]!r}")

        latest_complete: dict[str, Any] | None = None
        next_question_text: str = first_question

        total_attempts = max(len(answers) + len(GAKUCHIKA_FALLBACK_ANSWERS), 16)
        rate_limit_retries = 0
        max_rate_limit_retries = 12

        attempt = 0
        while attempt < total_attempts:
            if attempt < len(answers):
                answer = answers[attempt]
            else:
                answer = build_deterministic_gakuchika_followup(
                    next_question=next_question_text,
                    attempt_index=attempt - len(answers),
                    latest_complete=latest_complete,
                    case_answers=answers,
                )

            transcript.append({"role": "user", "content": answer})

            stream_response = await client.request(
                "POST",
                f"/api/gakuchika/{gakuchika_id}/conversation/stream",
                json={"answer": answer, "sessionId": session_id},
            )

            if stream_response.status_code == 429 and rate_limit_retries < max_rate_limit_retries:
                rate_limit_retries += 1
                transcript.pop()  # undo the user turn we just appended
                # exponential back-off: 2s, 4s, 6s, … (matches TypeScript: 2000 * retries)
                await asyncio.sleep(2.0 * rate_limit_retries)
                # do NOT increment attempt — retry the same attempt
                continue

            stream_body = await _read_response_body(
                stream_response, f"gakuchika stream {gakuchika_id}"
            )
            events = parse_sse_events(stream_body)
            next_question_chunk = collect_chunks(events, "question")
            try:
                latest_complete = parse_complete_data(events)
            except ValueError:
                print(f"  [gak] attempt={attempt} no complete event; events={len(events)} body_len={len(stream_body)}")
                latest_complete = {}
            next_question_text = str(
                latest_complete.get("nextQuestion") or next_question_chunk or ""
            )
            push_assistant_if_present(transcript, next_question_text)

            # Debug: log key signals from each turn
            cs = latest_complete.get("conversationState") or {}
            missing = cs.get("missingElements", [])
            qc = {k: v for k, v in (cs.get("draftQualityChecks") or {}).items() if v}
            print(
                f"  [gak] attempt={attempt} "
                f"stage={cs.get('stage')!r} "
                f"readyForDraft={cs.get('readyForDraft')} "
                f"isCompleted={latest_complete.get('isCompleted')} "
                f"nextAction={latest_complete.get('nextAction')!r} "
                f"qCount={latest_complete.get('questionCount')} "
                f"missing={missing} "
                f"qualityTrue={list(qc.keys())} "
                f"q={next_question_text[:60]!r}"
            )

            if is_gakuchika_draft_ready(latest_complete):
                return latest_complete

            attempt += 1

        raise RuntimeError("gakuchika conversation did not reach draft_ready")

    return await asyncio.wait_for(_loop(), timeout=timeout)


async def run_motivation_conversation(
    client: Any,
    company_id: str,
    selected_industry: str,
    selected_role: str,
    answers: list[str],
    transcript: list[dict[str, str]] | None = None,
    timeout: float = CONVERSATION_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Run full motivation conversation loop.

    Steps:
    1. POST /api/motivation/{company_id}/conversation/start.
       If 409 (already started): DELETE the existing conversation and retry.
    2. Loop: send each answer via POST …/conversation/stream.
    3. Parse SSE events; check ``isDraftReady`` after each turn.
    4. On HTTP 429, retry with exponential back-off (max 12 retries).

    Returns
    -------
    dict
        The ``data`` payload of the last ``complete`` SSE event.

    Raises
    ------
    RuntimeError
        If the conversation does not reach draft-ready within the attempt budget.
    asyncio.TimeoutError
        If the conversation exceeds the overall timeout.
    """
    if transcript is None:
        transcript = []

    async def _loop() -> dict[str, Any]:
        start_response = await client.request(
            "POST",
            f"/api/motivation/{company_id}/conversation/start",
            json={"selectedIndustry": selected_industry, "selectedRole": selected_role},
        )

        if start_response.status_code == 409:
            reset_response = await client.request(
                "DELETE", f"/api/motivation/{company_id}/conversation", json={}
            )
            await _read_response_body(reset_response, f"motivation reset {company_id}")
            start_response = await client.request(
                "POST",
                f"/api/motivation/{company_id}/conversation/start",
                json={"selectedIndustry": selected_industry, "selectedRole": selected_role},
            )

        start_body_text = await _read_response_body(
            start_response, f"motivation start {company_id}"
        )
        start_body: dict[str, Any] = json.loads(start_body_text)

        session_id: str = start_body["conversation"]["id"]
        messages: list[dict[str, str]] = start_body.get("messages") or []
        first_question: str = (
            start_body.get("nextQuestion")
            or (messages[0].get("content") if messages else "")
            or ""
        )
        push_assistant_if_present(transcript, first_question)
        print(f"  [mot] started session={session_id} q0={first_question[:80]!r}")

        latest_complete: dict[str, Any] | None = None
        next_question_text: str = first_question

        total_attempts = max(len(answers) + len(MOTIVATION_FALLBACK_ANSWERS), 16)
        rate_limit_retries = 0
        max_rate_limit_retries = 12

        attempt = 0
        while attempt < total_attempts:
            if attempt < len(answers):
                answer = answers[attempt]
            else:
                answer = build_deterministic_motivation_followup(
                    next_question=next_question_text,
                    attempt_index=attempt - len(answers),
                    latest_complete=latest_complete,
                )

            transcript.append({"role": "user", "content": answer})

            stream_response = await client.request(
                "POST",
                f"/api/motivation/{company_id}/conversation/stream",
                json={"answer": answer, "sessionId": session_id},
            )

            if stream_response.status_code == 429 and rate_limit_retries < max_rate_limit_retries:
                rate_limit_retries += 1
                transcript.pop()
                await asyncio.sleep(2.0 * rate_limit_retries)
                continue

            stream_body = await _read_response_body(
                stream_response, f"motivation stream {company_id}"
            )
            events = parse_sse_events(stream_body)
            next_question_chunk = collect_chunks(events, "question")
            try:
                latest_complete = parse_complete_data(events)
            except ValueError:
                print(f"  [mot] attempt={attempt} no complete event; events={len(events)} body_len={len(stream_body)}")
                latest_complete = {}
            next_question_text = str(
                latest_complete.get("nextQuestion") or next_question_chunk or ""
            )
            push_assistant_if_present(transcript, next_question_text)

            print(
                f"  [mot] attempt={attempt} "
                f"isDraftReady={latest_complete.get('isDraftReady')} "
                f"nextAction={latest_complete.get('nextAction')!r} "
                f"q={next_question_text[:60]!r}"
            )

            if latest_complete.get("isDraftReady") is True:
                return latest_complete

            attempt += 1

        raise RuntimeError("motivation conversation did not reach draft_ready")

    return await asyncio.wait_for(_loop(), timeout=timeout)


async def run_interview_flow(
    client: Any,
    company_id: str,
    answers: list[str],
    transcript: list[dict[str, str]] | None = None,
    timeout: float = CONVERSATION_TIMEOUT_SECONDS,
) -> tuple[dict[str, Any] | None, str]:
    """Run full interview flow: start -> stream questions -> feedback.

    Steps:
    1. POST /api/companies/{company_id}/interview/start — parse SSE for the
       initial question.
    2. Loop over ``answers``: POST …/interview/stream with running ``messages``
       list; accumulate updated messages from each ``complete`` event.
    3. POST …/interview/feedback with the final ``messages`` list.

    Parameters
    ----------
    client:
        Any object with ``async request(method, path, json) -> httpx.Response``.
    company_id:
        DB id of the company resource.
    answers:
        Explicit user answers for the interview turns.
    transcript:
        Optional list mutated in-place with assistant/user turns.
    timeout:
        Overall timeout in seconds for the entire interview flow.

    Returns
    -------
    tuple[dict | None, str]
        ``(feedback_dict, feedback_summary_text)`` where ``feedback_dict`` is
        the ``feedback`` field from the final ``complete`` event data, and
        ``feedback_summary_text`` is all text fields concatenated for scoring.

    Raises
    ------
    asyncio.TimeoutError
        If the interview flow exceeds the overall timeout.
    """
    if transcript is None:
        transcript = []

    async def _loop() -> tuple[dict[str, Any] | None, str]:
        start_response = await client.request(
            "POST", f"/api/companies/{company_id}/interview/start", json={}
        )
        start_body_text = await _read_response_body(
            start_response, f"interview start {company_id}"
        )
        start_events = parse_sse_events(start_body_text)
        start_complete = parse_complete_data(start_events)

        initial_question: str = str(
            start_complete.get("question")
            or collect_chunks(start_events, "question")
            or ""
        )
        push_assistant_if_present(transcript, initial_question)

        # Seed messages list from backend or build a minimal one
        raw_messages = start_complete.get("messages")
        if isinstance(raw_messages, list):
            messages: list[dict[str, str]] = [
                {"role": str(m.get("role", "")), "content": str(m.get("content", ""))}
                for m in raw_messages
            ]
        else:
            messages = [{"role": "assistant", "content": initial_question}]

        for answer in answers:
            transcript.append({"role": "user", "content": answer})
            messages = [*messages, {"role": "user", "content": answer}]

            stream_response = await client.request(
                "POST",
                f"/api/companies/{company_id}/interview/stream",
                json={"messages": messages},
            )
            stream_body = await _read_response_body(
                stream_response, f"interview stream {company_id}"
            )
            events = parse_sse_events(stream_body)
            complete = parse_complete_data(events)
            next_question: str = str(
                complete.get("question")
                or collect_chunks(events, "question")
                or ""
            )
            push_assistant_if_present(transcript, next_question)
            raw_updated = complete.get("messages")
            if isinstance(raw_updated, list):
                messages = [
                    {"role": str(m.get("role", "")), "content": str(m.get("content", ""))}
                    for m in raw_updated
                ]

        feedback_response = await client.request(
            "POST",
            f"/api/companies/{company_id}/interview/feedback",
            json={"messages": messages},
        )
        feedback_body = await _read_response_body(
            feedback_response, f"interview feedback {company_id}"
        )
        feedback_events = parse_sse_events(feedback_body)
        feedback_complete = parse_complete_data(feedback_events)

        raw_feedback = feedback_complete.get("feedback")
        feedback_dict: dict[str, Any] | None = raw_feedback if isinstance(raw_feedback, dict) else None

        if feedback_dict is not None:
            feedback_summary = " ".join(
                filter(
                    None,
                    [
                        feedback_dict.get("overall_comment") or "",
                        feedback_dict.get("improved_answer") or "",
                        *[s for s in (feedback_dict.get("strengths") or []) if isinstance(s, str)],
                        *[s for s in (feedback_dict.get("improvements") or []) if isinstance(s, str)],
                    ],
                )
            )
        else:
            feedback_summary = ""

        return feedback_dict, feedback_summary

    return await asyncio.wait_for(_loop(), timeout=timeout)
