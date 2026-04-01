import test from "node:test";
import assert from "node:assert/strict";
import { checkAiLiveAuth } from "./check-ai-live-auth.mjs";

test("passes when auth route returns 401 for an invalid bearer and 200 for the configured secret", async () => {
  const calls = [];
  const result = await checkAiLiveAuth({
    baseUrl: "https://stg.shupass.jp",
    authSecret: "top-secret",
    fetchImpl: async (_url, options) => {
      calls.push(options?.headers?.Authorization);
      const auth = options?.headers?.Authorization;
      if (auth === "Bearer invalid-secret") {
        return new Response(JSON.stringify({ error: { code: "CI_TEST_AUTH_UNAUTHORIZED" } }), {
          status: 401,
          headers: { "content-type": "application/json", "x-request-id": "req-invalid" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req-valid" },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.classification, "ready");
  assert.equal(result.attempts.length, 1);
  assert.deepEqual(calls, ["Bearer invalid-secret", "Bearer top-secret"]);
  assert.equal(result.attempts[0].invalid.status, 401);
  assert.equal(result.attempts[0].valid.status, 200);
});

test("fails clearly when auth route is disabled", async () => {
  const result = await checkAiLiveAuth({
    baseUrl: "https://stg.shupass.jp",
    authSecret: "top-secret",
    maxAttempts: 1,
    fetchImpl: async (_url, options) => {
      const auth = options?.headers?.Authorization;
      if (auth === "Bearer invalid-secret") {
        return new Response(JSON.stringify({ error: { code: "CI_TEST_AUTH_UNAUTHORIZED" } }), {
          status: 401,
          headers: { "content-type": "application/json", "x-request-id": "req-invalid" },
        });
      }

      return new Response(JSON.stringify({ error: { code: "CI_TEST_AUTH_DISABLED" }, requestId: "req-disabled" }), {
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": "req-disabled" },
      });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.classification, "disabled");
  assert.equal(result.errorCode, "CI_TEST_AUTH_DISABLED");
  assert.equal(result.requestId, "req-disabled");
  assert.match(result.message, /BETTER_AUTH_SECRET/);
});

test("retries transient route drift until both probes hit a healthy node", async () => {
  let callCount = 0;
  const result = await checkAiLiveAuth({
    baseUrl: "https://stg.shupass.jp",
    authSecret: "top-secret",
    maxAttempts: 2,
    fetchImpl: async (_url, options) => {
      callCount += 1;
      const auth = options?.headers?.Authorization;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { code: "CI_TEST_UNAUTHORIZED" } }), {
          status: 401,
          headers: { "content-type": "application/json", "x-request-id": "req-a" },
        });
      }
      if (callCount === 2) {
        return new Response("Not Found", {
          status: 404,
          headers: { "content-type": "text/plain", "x-request-id": "req-b" },
        });
      }
      if (auth === "Bearer invalid-secret") {
        return new Response(JSON.stringify({ error: { code: "CI_TEST_AUTH_UNAUTHORIZED" } }), {
          status: 401,
          headers: { "content-type": "application/json", "x-request-id": "req-c" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req-d" },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].valid.status, 404);
  assert.equal(result.attempts[1].valid.status, 200);
});

test("fails on unexpected raw 404 responses and preserves the request id", async () => {
  const result = await checkAiLiveAuth({
    baseUrl: "https://stg.shupass.jp",
    authSecret: "top-secret",
    maxAttempts: 1,
    fetchImpl: async (_url, options) => {
      const auth = options?.headers?.Authorization;
      if (auth === "Bearer invalid-secret") {
        return new Response(JSON.stringify({ error: { code: "CI_TEST_AUTH_UNAUTHORIZED" } }), {
          status: 401,
          headers: { "content-type": "application/json", "x-request-id": "req-invalid" },
        });
      }

      return new Response("<html>missing</html>", {
        status: 404,
        headers: { "content-type": "text/html", "x-request-id": "req-missing" },
      });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.classification, "route_missing");
  assert.equal(result.requestId, "req-missing");
  assert.match(result.message, /route is missing/i);
});
