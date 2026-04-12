import type { ReviewResult, SSECompleteEvent, SSEErrorEvent, SSEEvent } from "./types";

export function parseSSEEvent(text: string): SSEEvent | null {
  try {
    const dataMatch = text.match(/^data:\s*(.+)$/m);
    if (!dataMatch) {
      return null;
    }
    return JSON.parse(dataMatch[1]) as SSEEvent;
  } catch {
    console.warn("Failed to parse SSE event:", text);
    return null;
  }
}

export type ESReviewStreamResult =
  | {
      ok: true;
      result: ReviewResult;
      creditCost?: number;
    }
  | {
      ok: false;
      reason: "missing_reader" | "missing_complete" | "stream_error";
      message: string;
    };

export async function consumeESReviewStream(args: {
  response: Response;
  onEvent: (event: SSEEvent) => void;
}): Promise<ESReviewStreamResult> {
  const reader = args.response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      reason: "missing_reader",
      message: "ストリーミングがサポートされていません",
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let completed: SSECompleteEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      if (!eventText.trim()) continue;

      const event = parseSSEEvent(eventText);
      if (!event) continue;

      args.onEvent(event);

      if (event.type === "complete") {
        completed = event;
        return {
          ok: true,
          result: event.result,
          creditCost: event.creditCost,
        };
      }

      if (event.type === "error") {
        return {
          ok: false,
          reason: "stream_error",
          message: (event as SSEErrorEvent).message,
        };
      }
    }
  }

  if (completed) {
    return {
      ok: true,
      result: completed.result,
      creditCost: completed.creditCost,
    };
  }

  return {
    ok: false,
    reason: "missing_complete",
    message: "添削結果を受信できませんでした",
  };
}
