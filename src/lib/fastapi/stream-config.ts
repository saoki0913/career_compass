export const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export const DEFAULT_STREAM_TIMEOUT_MS = 60_000;

export type StreamFeature = "motivation" | "gakuchika" | "interview" | "es_review";

export type StreamBillingPolicy =
  | { kind: "post_success"; creditsPerSuccess: number }
  | { kind: "three_phase"; reserveBeforeStream: true }
  | { kind: "free" };

export interface StreamFeatureConfig {
  feature: StreamFeature;
  fastApiEndpointPath: string;
  timeoutMs: number;
  billingPolicy: StreamBillingPolicy;
  requiresCareerPrincipal: boolean;
}

export const STREAM_FEATURE_CONFIGS = {
  motivation: {
    feature: "motivation",
    fastApiEndpointPath: "/api/motivation/next-question/stream",
    timeoutMs: 120_000,
    billingPolicy: { kind: "post_success", creditsPerSuccess: 1 },
    requiresCareerPrincipal: true,
  },
  gakuchika: {
    feature: "gakuchika",
    fastApiEndpointPath: "/api/gakuchika/next-question/stream",
    timeoutMs: 120_000,
    billingPolicy: { kind: "post_success", creditsPerSuccess: 1 },
    requiresCareerPrincipal: true,
  },
  interview: {
    feature: "interview",
    fastApiEndpointPath: "/api/interview/turn",
    timeoutMs: DEFAULT_STREAM_TIMEOUT_MS,
    billingPolicy: { kind: "free" },
    requiresCareerPrincipal: true,
  },
  es_review: {
    feature: "es_review",
    fastApiEndpointPath: "/api/review/stream",
    timeoutMs: 120_000,
    billingPolicy: { kind: "three_phase", reserveBeforeStream: true },
    requiresCareerPrincipal: true,
  },
} as const satisfies Record<StreamFeature, StreamFeatureConfig>;

export function getStreamFeatureConfig(feature: StreamFeature): StreamFeatureConfig {
  return STREAM_FEATURE_CONFIGS[feature];
}
