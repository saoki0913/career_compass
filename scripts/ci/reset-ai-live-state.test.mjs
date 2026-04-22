import test from "node:test";
import assert from "node:assert/strict";
import { resetAiLiveState } from "./reset-ai-live-state.mjs";

test("resets the AI live state and returns counts plus the seeded balance", async () => {
  const result = await resetAiLiveState({
    baseUrl: "https://stg.shupass.jp",
    authSecret: "top-secret",
    fetchImpl: async (_url, options) => {
      assert.equal(options?.headers?.Authorization, "Bearer top-secret");
      return new Response(
        JSON.stringify({
          success: true,
          userId: "user-1",
          creditBalance: 1000,
          deletedCounts: {
            companies: 2,
            gakuchikaContents: 1,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json", "x-request-id": "req-ok" },
        },
      );
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.creditBalance, 1000);
  assert.equal(result.userId, "user-1");
  assert.deepEqual(result.deletedCounts, {
    companies: 2,
    gakuchikaContents: 1,
  });
});

test("preserves request id and response snippet on reset failures", async () => {
  const result = await resetAiLiveState({
    baseUrl: "https://stg.shupass.jp",
    authSecret: "top-secret",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { code: "CI_TEST_AUTH_DISABLED" }, requestId: "req-fail" }), {
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": "req-fail" },
      }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.errorCode, "CI_TEST_AUTH_DISABLED");
  assert.equal(result.requestId, "req-fail");
  assert.match(result.message, /requestId=req-fail/);
});
