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
}

export interface UpstreamSSEResult {
  response: Response;
  clearTimeout: () => void;
}

export async function fetchUpstreamSSE(
  request: UpstreamSSERequest,
): Promise<UpstreamSSEResult> {
  const abortController = new AbortController();
  const timeout = request.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
  const timeoutId = setTimeout(() => abortController.abort(), timeout);

  const response = await fetchFastApiWithPrincipal(request.path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.requestId ? { "X-Request-Id": request.requestId } : {}),
    },
    principal: request.principal,
    body: JSON.stringify(request.payload),
    signal: abortController.signal,
  });

  return {
    response,
    clearTimeout: () => clearTimeout(timeoutId),
  };
}
