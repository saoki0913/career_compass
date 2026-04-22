import test from "node:test";
import assert from "node:assert/strict";
import { checkAiLivePrincipal } from "./check-ai-live-principal.mjs";

test("passes when local principal preflight returns 200", async () => {
  const result = await checkAiLivePrincipal({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req-ready" },
      }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.classification, "ready");
  assert.equal(result.requestId, "req-ready");
});

test("fails clearly when route is local-only", async () => {
  const result = await checkAiLivePrincipal({
    baseUrl: "https://stg.shupass.jp",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { code: "LOCAL_AI_LIVE_ONLY" }, requestId: "req-local-only" }), {
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": "req-local-only" },
      }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.classification, "disabled");
  assert.equal(result.requestId, "req-local-only");
  assert.match(result.message, /disabled outside localhost/i);
});

test("surfaces upstream principal failures", async () => {
  const result = await checkAiLivePrincipal({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { code: "LOCAL_AI_LIVE_PRINCIPAL_PREFLIGHT_FAILED" } }), {
        status: 503,
        headers: { "content-type": "application/json", "x-request-id": "req-upstream" },
      }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.classification, "upstream_error");
  assert.equal(result.requestId, "req-upstream");
  assert.match(result.message, /upstream\/server error/i);
});
