import "server-only";

import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import type { CreateCareerPrincipalInput } from "@/lib/fastapi/career-principal";
import { DEFAULT_STREAM_TIMEOUT_MS } from "@/lib/fastapi/stream-config";

export interface UpstreamSSERequest {
  path: string;
  payload: Record<string, unknown>;
  principal: CreateCareerPrincipalInput;
  requestId?: string;
  timeoutMs?: number;
  /**
   * Client-disconnect signal (typically `NextRequest.signal`). When this aborts
   * — or `abortUpstream()` is called — the upstream fetch is aborted so FastAPI
   * receives the disconnect and its SseLease can cancel the in-flight LLM. This
   * is the upstream half of the "client disconnect → stop LLM" contract; the
   * downstream half (`ReadableStream.cancel()` → `abortUpstream`) lives in
   * `sse-proxy.ts`.
   */
  clientSignal?: AbortSignal;
}

export interface UpstreamSSEResult {
  response: Response;
  clearTimeout: () => void;
  /**
   * Abort the upstream fetch (e.g. on client disconnect). `reader.cancel()` only
   * releases the local read lock and does NOT abort the upstream connection, so
   * the proxy must call this explicitly to propagate the disconnect to FastAPI.
   */
  abortUpstream: (reason?: string) => void;
}

/**
 * Combine multiple AbortSignals into one that aborts when ANY input aborts.
 *
 * Uses `AbortSignal.any()` which requires Node 20.3.0+. All runtime targets are
 * Node 20.x (`.vercel/project.json` nodeVersion "20.x"; CI and local are 20.x),
 * so the native path is always taken in practice. The manual OR-composition
 * fallback exists as defense-in-depth for any runtime that predates
 * `AbortSignal.any` and is not exercised on supported runtimes.
 */
export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0];

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }

  // Fallback for runtimes without AbortSignal.any (pre Node 20.3.0).
  const controller = new AbortController();
  const onAbort = (event: Event) => {
    const source = event.target;
    controller.abort(source instanceof AbortSignal ? source.reason : undefined);
  };
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

export async function fetchUpstreamSSE(
  request: UpstreamSSERequest,
): Promise<UpstreamSSEResult> {
  const timeoutController = new AbortController();
  const clientAbortController = new AbortController();
  const timeout = request.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
  const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

  const signal = combineAbortSignals([
    timeoutController.signal,
    clientAbortController.signal,
    ...(request.clientSignal ? [request.clientSignal] : []),
  ]);

  const response = await fetchFastApiWithPrincipal(request.path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.requestId ? { "X-Request-Id": request.requestId } : {}),
    },
    principal: request.principal,
    body: JSON.stringify(request.payload),
    signal,
  });

  return {
    response,
    clearTimeout: () => clearTimeout(timeoutId),
    abortUpstream: (reason?: string) => {
      if (!clientAbortController.signal.aborted) {
        clientAbortController.abort(reason ?? "client_disconnect");
      }
    },
  };
}
