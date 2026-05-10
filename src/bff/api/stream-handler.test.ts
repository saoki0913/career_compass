import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: vi.fn(),
}));
vi.mock("@/bff/identity/llm-cost-guard", () => ({
  guardDailyTokenLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/rate-limit-spike", () => ({
  CONVERSATION_RATE_LAYERS: [],
  enforceRateLimitLayers: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/ai/cost-summary-log", () => ({
  getRequestId: vi.fn().mockReturnValue("test-req-id"),
  logAiCreditCostSummary: vi.fn(),
  splitInternalTelemetry: vi.fn((raw: unknown) => ({
    payload: raw,
    telemetry: null,
  })),
}));
vi.mock("@/lib/server/fastapi-detail-message", () => ({
  buildFastApiErrorResponseOptions: vi.fn().mockReturnValue({
    status: 502,
    code: "TEST_FAILED",
    userMessage: "Failed",
    action: "Retry",
  }),
}));
vi.mock("@/lib/fastapi/secret-guard", () => ({
  isSecretMissingError: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/fastapi/stream-pipeline", () => ({
  fetchConfiguredUpstreamSSE: vi.fn(),
  createConfiguredSSEProxyResponse: vi.fn(),
}));
vi.mock("@/lib/fastapi/stream-config", () => ({
  STREAM_FEATURE_CONFIGS: {
    gakuchika: {
      feature: "gakuchika",
      fastApiEndpointPath: "/api/gakuchika/next-question/stream",
      timeoutMs: 120000,
      billingPolicy: { kind: "post_success", creditsPerSuccess: 1 },
      requiresCareerPrincipal: true,
    },
  },
}));
vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { createConversationStreamHandler } from "./stream-handler";
import type { StreamHandlerConfig } from "./stream-handler";
import {
  fetchConfiguredUpstreamSSE,
  createConfiguredSSEProxyResponse,
} from "@/lib/fastapi/stream-pipeline";

const mockGetRequestIdentity = vi.mocked(getRequestIdentity);
const mockFetchUpstream = vi.mocked(fetchConfiguredUpstreamSSE);
const mockCreateProxy = vi.mocked(createConfiguredSSEProxyResponse);

function makeRequest(body: Record<string, unknown> = { answer: "test answer" }) {
  return new NextRequest("http://localhost/api/test/123/stream", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeConfig(
  overrides: Partial<StreamHandlerConfig<{ ready: true }>> = {},
): StreamHandlerConfig<{ ready: true }> {
  return {
    feature: "gakuchika",
    errorMeta: {
      authCode: "TEST_AUTH",
      authMessage: "Auth required",
    },
    prepare: vi.fn().mockResolvedValue({ ready: true }),
    getUpstream: vi.fn().mockReturnValue({
      payload: { test: true },
      principal: {
        scope: "ai-stream" as const,
        actor: { kind: "user" as const, id: "u1" },
        plan: "free" as const,
        companyId: null,
      },
    }),
    onComplete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createConversationStreamHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when identity is null", async () => {
    mockGetRequestIdentity.mockResolvedValue(null);
    const handler = createConversationStreamHandler(makeConfig());
    const response = await handler(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("TEST_AUTH");
  });

  it("returns 401 when userId is null", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: null,
      guestId: "g1",
    });
    const handler = createConversationStreamHandler(makeConfig());
    const response = await handler(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 when answer is empty", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    const handler = createConversationStreamHandler(makeConfig());
    const response = await handler(makeRequest({ answer: "" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("GAKUCHIKA_ANSWER_REQUIRED");
  });

  it("returns 400 when answer is whitespace only", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    const handler = createConversationStreamHandler(makeConfig());
    const response = await handler(makeRequest({ answer: "   " }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns prepare response when prepare returns Response", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    const prepareResponse = new Response(
      JSON.stringify({ error: "not found" }),
      { status: 404 },
    );
    const handler = createConversationStreamHandler(
      makeConfig({
        prepare: vi.fn().mockResolvedValue(prepareResponse),
      }),
    );
    const response = await handler(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(404);
  });

  it("calls fetchConfiguredUpstreamSSE with correct config", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    mockFetchUpstream.mockResolvedValue({
      response: new Response("ok", { status: 200 }),
      clearTimeout: vi.fn(),
    });
    mockCreateProxy.mockReturnValue(
      new Response("stream", { status: 200 }),
    );

    const handler = createConversationStreamHandler(makeConfig());
    await handler(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(mockFetchUpstream).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { test: true },
        principal: expect.objectContaining({
          actor: { kind: "user", id: "u1" },
        }),
      }),
    );
  });

  it("passes paramId extracted from route params", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    mockFetchUpstream.mockResolvedValue({
      response: new Response("ok", { status: 200 }),
      clearTimeout: vi.fn(),
    });
    mockCreateProxy.mockReturnValue(
      new Response("stream", { status: 200 }),
    );

    const prepareSpy = vi.fn().mockResolvedValue({ ready: true });
    const handler = createConversationStreamHandler(
      makeConfig({ prepare: prepareSpy }),
    );
    await handler(makeRequest(), {
      params: Promise.resolve({ id: "my-id-123" }),
    });

    expect(prepareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ paramId: "my-id-123" }),
    );
  });

  it("extracts companyId param when id is absent", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    mockFetchUpstream.mockResolvedValue({
      response: new Response("ok", { status: 200 }),
      clearTimeout: vi.fn(),
    });
    mockCreateProxy.mockReturnValue(
      new Response("stream", { status: 200 }),
    );

    const prepareSpy = vi.fn().mockResolvedValue({ ready: true });
    const handler = createConversationStreamHandler(
      makeConfig({ prepare: prepareSpy }),
    );
    await handler(makeRequest(), {
      params: Promise.resolve({ companyId: "comp-456" }),
    });

    expect(prepareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ paramId: "comp-456" }),
    );
  });

  it("returns 500 on unexpected error in prepare", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    const handler = createConversationStreamHandler(
      makeConfig({
        prepare: vi.fn().mockRejectedValue(new Error("DB crash")),
      }),
    );
    const response = await handler(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("GAKUCHIKA_STREAM_INTERNAL_ERROR");
  });

  it("calls onStreamError on upstream fetch failure", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    const onStreamError = vi.fn();
    mockFetchUpstream.mockRejectedValue(new Error("Network error"));

    const handler = createConversationStreamHandler(
      makeConfig({ onStreamError }),
    );
    const response = await handler(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(502);
    expect(onStreamError).toHaveBeenCalled();
  });

  it("calls onStreamError on non-OK upstream response", async () => {
    mockGetRequestIdentity.mockResolvedValue({
      userId: "u1",
      guestId: null,
    });
    const onStreamError = vi.fn();
    mockFetchUpstream.mockResolvedValue({
      response: new Response(JSON.stringify({ detail: "bad" }), {
        status: 500,
      }),
      clearTimeout: vi.fn(),
    });

    const handler = createConversationStreamHandler(
      makeConfig({ onStreamError }),
    );
    await handler(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(onStreamError).toHaveBeenCalled();
  });
});
