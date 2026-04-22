import type {
  LiveAiConversationFeature,
  LiveAiConversationJudge,
  LiveAiConversationTranscriptTurn,
} from "./live-ai-conversation-report";

type LlmJudgeRaw = {
  question_fit?: number;
  depth?: number;
  company_context?: number;
  output_quality?: number;
  naturalness?: number;
  overall_pass?: boolean;
  warnings?: string[];
  fail_reasons?: string[];
};

function isLlmJudgeEnabled(): boolean {
  return process.env.LIVE_AI_CONVERSATION_LLM_JUDGE?.trim() === "1";
}

function judgeModel(): string {
  return process.env.LIVE_AI_CONVERSATION_LLM_JUDGE_MODEL?.trim() || "gpt-4o-mini";
}

/** Exported for unit tests (markdown fences / noisy model output). */
export function parseLiveAiConversationLlmJudgeResponse(text: string): LlmJudgeRaw | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as LlmJudgeRaw;
  } catch {
    return null;
  }
}

function rawToJudge(raw: LlmJudgeRaw, model: string): LiveAiConversationJudge {
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String) : [];
  const failReasons = Array.isArray(raw.fail_reasons) ? raw.fail_reasons.map(String) : [];
  const overallPass = raw.overall_pass === true && failReasons.length === 0;
  return {
    enabled: true,
    model,
    overallPass,
    blocking: process.env.LIVE_AI_CONVERSATION_LLM_JUDGE_BLOCKING?.trim() === "1",
    scores: {
      questionFit: Number(raw.question_fit) || 0,
      depth: Number(raw.depth) || 0,
      companyContext: Number(raw.company_context) || 0,
      outputQuality: Number(raw.output_quality) || 0,
      naturalness: Number(raw.naturalness) || 0,
    },
    warnings,
    reasons: failReasons.length ? failReasons : overallPass ? [] : ["llm_judge:overall_fail"],
  };
}

/**
 * Optional OpenAI JSON judge for live conversation reports.
 * Set LIVE_AI_CONVERSATION_LLM_JUDGE=1 and OPENAI_API_KEY.
 */
export async function maybeLiveAiConversationLlmJudge(input: {
  feature: LiveAiConversationFeature;
  caseId: string;
  title: string;
  transcript: LiveAiConversationTranscriptTurn[];
  finalText: string;
}): Promise<LiveAiConversationJudge | null> {
  if (!isLlmJudgeEnabled()) {
    return null;
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = judgeModel();
  const transcriptText = input.transcript
    .map((t) => `${t.role}: ${t.content}`)
    .join("\n")
    .slice(0, 24_000);

  const system = `You are a strict evaluator for Japanese job-hunting AI coaching transcripts.
Return ONLY valid JSON with keys:
question_fit, depth, company_context, output_quality, naturalness (integers 1-5),
overall_pass (boolean),
warnings (string array),
fail_reasons (string array, machine codes like depth:shallow, grounding:weak).
overall_pass true only if outputs are adequate for a real candidate; minor issues go to warnings.`;

  const user = `feature=${input.feature}
caseId=${input.caseId}
title=${input.title}

--- transcript ---
${transcriptText}

--- final primary output ---
${input.finalText.slice(0, 12_000)}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }
    const raw = parseLiveAiConversationLlmJudgeResponse(content);
    if (!raw) {
      return null;
    }
    return rawToJudge(raw, model);
  } catch {
    return null;
  }
}
