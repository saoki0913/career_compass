import "server-only";

import type { CreateCareerPrincipalInput } from "@/lib/fastapi/career-principal";
import { createSSEProxyStream, type SSEProxyOptions } from "@/lib/fastapi/sse-proxy";
import {
  SSE_RESPONSE_HEADERS,
  type StreamFeatureConfig,
} from "@/lib/fastapi/stream-config";
import { fetchUpstreamSSE, type UpstreamSSEResult } from "@/lib/fastapi/stream-transport";

export interface ConfiguredUpstreamSSERequest {
  config: StreamFeatureConfig;
  payload: Record<string, unknown>;
  principal: CreateCareerPrincipalInput;
  requestId?: string;
  endpointPath?: string;
  /**
   * Client-disconnect signal (typically `NextRequest.signal`). Forwarded to the
   * upstream fetch so a browser disconnect aborts the FastAPI connection. See
   * `fetchUpstreamSSE` for the full contract.
   */
  clientSignal?: AbortSignal;
}

export function createSSEProxyOptionsFromConfig(
  config: StreamFeatureConfig,
  options: Omit<SSEProxyOptions, "feature">,
): SSEProxyOptions {
  return {
    ...options,
    feature: config.feature,
  };
}

export async function fetchConfiguredUpstreamSSE(
  request: ConfiguredUpstreamSSERequest,
): Promise<UpstreamSSEResult> {
  return fetchUpstreamSSE({
    path: request.endpointPath ?? request.config.fastApiEndpointPath,
    payload: request.payload,
    principal: request.principal,
    requestId: request.requestId,
    timeoutMs: request.config.timeoutMs,
    clientSignal: request.clientSignal,
  });
}

export interface ConfiguredSSEProxyResponseOptions
  extends Omit<SSEProxyOptions, "feature"> {
  config: StreamFeatureConfig;
  upstreamResponse: Response;
  clearUpstreamTimeout?: () => void;
}

export function createConfiguredSSEProxyResponse({
  config,
  upstreamResponse,
  clearUpstreamTimeout,
  onFinally,
  ...options
}: ConfiguredSSEProxyResponseOptions): Response {
  const stream = createSSEProxyStream(
    upstreamResponse,
    createSSEProxyOptionsFromConfig(config, {
      ...options,
      onFinally: async (summary) => {
        clearUpstreamTimeout?.();
        await onFinally?.(summary);
      },
    }),
  );

  return new Response(stream, {
    headers: {
      ...SSE_RESPONSE_HEADERS,
      "X-Request-Id": options.requestId,
    },
  });
}
