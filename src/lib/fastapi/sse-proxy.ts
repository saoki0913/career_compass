/**
 * SSE consume-and-re-emit proxy for FastAPI streaming endpoints.
 *
 * Both the motivation conversation stream and the ES review stream need to:
 *   1. Read FastAPI's SSE body
 *   2. Line/block-buffer and parse each `data: ...` event
 *   3. Strip `internal_telemetry` before forwarding to the browser
 *   4. Intercept the `complete` event to run side effects (DB save, credit
 *      confirm/consume) — optionally replacing the payload
 *   5. Log final cost summary exactly once in a finally block
 *
 * This helper encapsulates steps 1–3 and orchestrates the hook callbacks for
 * step 4+. Callers own the hooks (which stay feature-specific).
 *
 * SSE parsing uses event-block splitting (`\n\n`) which correctly handles
 * both single-line `data:` events and multi-line blocks.
 */

import {
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";

/**
 * Result of an `onComplete` hook. Callers can:
 *   - return nothing → forward the original event unchanged
 *   - return `{ replaceEvent }` → forward the replacement instead of the original
 *   - return `{ cancel: true }` → stop reading upstream and close the stream
 *     (after emitting any replaceEvent)
 */
export interface SSEProxyCompleteResult {
  replaceEvent?: Record<string, unknown>;
  cancel?: boolean;
}

export interface SSEProxyProgressResult {
  suppress?: boolean;
  emitExtra?: Record<string, unknown>[];
}

export interface SSEProxyOptions {
  feature: string;
  requestId: string;
  onProgress?: (event: Record<string, unknown>) => SSEProxyProgressResult | void;
  onComplete?: (
    data: Record<string, unknown>,
  ) => Promise<SSEProxyCompleteResult | void>;
  onError?: (data: Record<string, unknown>) => Promise<void>;
  onCostTelemetry?: (telemetry: InternalCostTelemetry | null) => void;
  onFinally?: (summary: { success: boolean }) => void | Promise<void>;
}

export interface SSEDataEvent {
  event: Record<string, unknown>;
  telemetry: InternalCostTelemetry | null;
}

type SSEBlockParseResult =
  | { kind: "event"; event: Record<string, unknown>; telemetry: InternalCostTelemetry | null }
  | { kind: "raw"; text: string }
  | null;

function parseSSEDataBlock(block: string): SSEBlockParseResult {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const lines = block.split(/\r?\n/);
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) {
    return { kind: "raw", text: `${block}\n\n` };
  }

  const jsonStr = dataLines
    .map((line) => line.slice(5).trim())
    .join("\n")
    .trim();
  if (!jsonStr) return null;

  try {
    const rawEvent = JSON.parse(jsonStr) as Record<string, unknown>;
    const { payload, telemetry } = splitInternalTelemetry(rawEvent);
    return {
      kind: "event",
      event: payload as Record<string, unknown>,
      telemetry,
    };
  } catch {
    return { kind: "raw", text: `${dataLines[0]}\n\n` };
  }
}

export async function* readSSEDataEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEDataEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        const parsed = parseSSEDataBlock(block);
        if (parsed?.kind === "event") {
          yield { event: parsed.event, telemetry: parsed.telemetry };
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSSEDataBlock(buffer);
      if (parsed?.kind === "event") {
        yield { event: parsed.event, telemetry: parsed.telemetry };
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // releaseLock can throw if reader is already cancelled — ignore.
    }
  }
}

/**
 * Wrap a FastAPI SSE response and produce a ReadableStream that re-emits
 * sanitized events suitable for the browser.
 */
export function createSSEProxyStream(
  upstreamResponse: Response,
  options: SSEProxyOptions,
): ReadableStream<Uint8Array> {
  const {
    feature,
    onProgress,
    onComplete,
    onError,
    onCostTelemetry,
    onFinally,
  } = options;

  const upstreamBody = upstreamResponse.body;
  if (!upstreamBody) {
    // Degenerate case — produce a stream that emits a single error event and closes.
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const errorEvent = {
          type: "error",
          message: "AIレスポンスが空です",
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`),
        );
        if (onFinally) {
          try {
            await onFinally({ success: false });
          } catch (finallyErr) {
            console.error(`[sse-proxy:${feature}] onFinally failed:`, finallyErr);
          }
        }
        controller.close();
      },
    });
  }

  const reader = upstreamBody.getReader();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawSuccess = false;
      let finallyInvoked = false;
      let controllerClosed = false;

      const safeClose = () => {
        if (controllerClosed) return;
        controllerClosed = true;
        try {
          controller.close();
        } catch {
          // Already closed or errored — ignore.
        }
      };

      const runFinally = async (success: boolean) => {
        if (finallyInvoked) return;
        finallyInvoked = true;
        if (onFinally) {
          try {
            await onFinally({ success });
          } catch (finallyErr) {
            console.error(`[sse-proxy:${feature}] onFinally failed:`, finallyErr);
          }
        }
      };

      const forwardRaw = (text: string) => {
        controller.enqueue(encoder.encode(text));
      };

      const forwardEventObject = (event: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      const processEventBlock = async (block: string): Promise<boolean> => {
        const parsed = parseSSEDataBlock(block);
        if (!parsed) return false;
        if (parsed.kind === "raw") {
          forwardRaw(parsed.text);
          return false;
        }

        const { event: sanitized, telemetry } = parsed;
        if (onCostTelemetry && telemetry) {
          onCostTelemetry(telemetry);
        }

        const eventType = sanitized.type;

        if (eventType === "complete") {
          let completeResult: SSEProxyCompleteResult | void = undefined;
          if (onComplete) {
            try {
              completeResult = await onComplete(sanitized);
            } catch (hookErr) {
              console.error(`[sse-proxy:${feature}] onComplete failed:`, hookErr);
              const errorEvent = {
                type: "error",
                message: "ストリーミング処理中にエラーが発生しました",
              };
              forwardEventObject(errorEvent);
              return true;
            }
          }
          const toForward = completeResult?.replaceEvent ?? sanitized;
          forwardEventObject(toForward);
          if (!completeResult?.cancel) {
            sawSuccess = true;
          }
          return completeResult?.cancel === true;
        }

        if (eventType === "error") {
          if (onError) {
            try {
              await onError(sanitized);
            } catch (hookErr) {
              console.error(`[sse-proxy:${feature}] onError failed:`, hookErr);
            }
          }
          forwardEventObject(sanitized);
          return false;
        }

        // progress, string_chunk, field_complete, etc. — optionally intercept via onProgress
        if (onProgress) {
          const result = onProgress(sanitized);
          if (result?.emitExtra) {
            for (const extra of result.emitExtra) {
              forwardEventObject(extra);
            }
          }
          if (result?.suppress) return false;
        }
        forwardEventObject(sanitized);
        return false;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";

          for (const block of blocks) {
            const shouldCancel = await processEventBlock(block);
            if (shouldCancel) {
              await runFinally(sawSuccess);
              safeClose();
              await reader.cancel().catch(() => undefined);
              return;
            }
          }
        }

        // Flush any trailing block
        if (buffer.trim()) {
          await processEventBlock(buffer);
        }
      } catch (streamErr) {
        console.error(`[sse-proxy:${feature}] stream error:`, streamErr);
        const errorEvent = {
          type: "error",
          message: "AIストリーム接続が途中で切れました。しばらくしてから再試行してください。",
        };
        forwardEventObject(errorEvent);
      } finally {
        await runFinally(sawSuccess);
        try {
          reader.releaseLock();
        } catch {
          // releaseLock can throw if reader is already cancelled — ignore.
        }
        safeClose();
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
    },
  });
}
