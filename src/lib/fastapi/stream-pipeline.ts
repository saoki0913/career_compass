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

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}
