import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchFastApiWithPrincipalMock } = vi.hoisted(() => ({
  fetchFastApiWithPrincipalMock: vi.fn(),
}));

vi.mock("./client", () => ({
  fetchFastApiWithPrincipal: fetchFastApiWithPrincipalMock,
}));

import { combineAbortSignals, fetchUpstreamSSE } from "./stream-transport";

const basePrincipal = {
  scope: "ai-stream" as const,
  actor: { kind: "guest" as const, id: "guest-1" },
  plan: "guest" as const,
};

describe("combineAbortSignals", () => {
  it("returns the single signal unchanged when only one is provided", () => {
    const controller = new AbortController();
    expect(combineAbortSignals([controller.signal])).toBe(controller.signal);
  });

  it("aborts the combined signal when any source aborts (timeout source)", () => {
    const timeout = new AbortController();
    const client = new AbortController();
    const combined = combineAbortSignals([timeout.signal, client.signal]);

    expect(combined.aborted).toBe(false);
    timeout.abort();
    expect(combined.aborted).toBe(true);
  });

  it("aborts the combined signal when the client source aborts", () => {
    const timeout = new AbortController();
    const client = new AbortController();
    const combined = combineAbortSignals([timeout.signal, client.signal]);

    expect(combined.aborted).toBe(false);
    client.abort();
    expect(combined.aborted).toBe(true);
  });

  it("aborts the combined signal when an externally-provided clientSignal aborts", () => {
    const timeout = new AbortController();
    const external = new AbortController();
    const combined = combineAbortSignals([timeout.signal, external.signal]);

    external.abort();
    expect(combined.aborted).toBe(true);
  });

  it("starts aborted when a source is already aborted", () => {
    const already = AbortSignal.abort();
    const fresh = new AbortController();
    const combined = combineAbortSignals([already, fresh.signal]);
    expect(combined.aborted).toBe(true);
  });
});

describe("fetchUpstreamSSE", () => {
  beforeEach(() => {
    fetchFastApiWithPrincipalMock.mockReset();
    fetchFastApiWithPrincipalMock.mockResolvedValue(new Response("ok"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes a combined signal to the upstream fetch", async () => {
    await fetchUpstreamSSE({
      path: "/api/example",
      payload: {},
      principal: basePrincipal,
    });

    expect(fetchFastApiWithPrincipalMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchFastApiWithPrincipalMock.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect((init?.signal as AbortSignal).aborted).toBe(false);
  });

  it("abortUpstream() aborts the signal seen by the upstream fetch", async () => {
    const result = await fetchUpstreamSSE({
      path: "/api/example",
      payload: {},
      principal: basePrincipal,
    });

    const [, init] = fetchFastApiWithPrincipalMock.mock.calls[0];
    const signal = init?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    result.abortUpstream("client_disconnect");
    expect(signal.aborted).toBe(true);

    result.clearTimeout();
  });

  it("aborts the upstream fetch when an externally provided clientSignal aborts", async () => {
    const clientController = new AbortController();
    const result = await fetchUpstreamSSE({
      path: "/api/example",
      payload: {},
      principal: basePrincipal,
      clientSignal: clientController.signal,
    });

    const [, init] = fetchFastApiWithPrincipalMock.mock.calls[0];
    const signal = init?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    clientController.abort();
    expect(signal.aborted).toBe(true);

    result.clearTimeout();
  });

  it("aborts the upstream fetch when the timeout elapses", async () => {
    vi.useFakeTimers();
    const result = await fetchUpstreamSSE({
      path: "/api/example",
      payload: {},
      principal: basePrincipal,
      timeoutMs: 50,
    });

    const [, init] = fetchFastApiWithPrincipalMock.mock.calls[0];
    const signal = init?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(50);
    expect(signal.aborted).toBe(true);

    result.clearTimeout();
  });

  it("clearTimeout cancels the pending timeout so it cannot abort later", async () => {
    vi.useFakeTimers();
    const result = await fetchUpstreamSSE({
      path: "/api/example",
      payload: {},
      principal: basePrincipal,
      timeoutMs: 50,
    });

    const [, init] = fetchFastApiWithPrincipalMock.mock.calls[0];
    const signal = init?.signal as AbortSignal;

    result.clearTimeout();
    vi.advanceTimersByTime(100);
    expect(signal.aborted).toBe(false);
  });
});
