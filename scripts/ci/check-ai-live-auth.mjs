#!/usr/bin/env node

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function buildEndpoint(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error("PLAYWRIGHT_BASE_URL or --base-url is required");
  }
  return `${normalized}/api/internal/test-auth/login`;
}

async function parseJsonSafely(response) {
  const text = await response.text();
  if (!text) return { body: null, rawText: "" };

  try {
    return { body: JSON.parse(text), rawText: text };
  } catch {
    return { body: { raw: text }, rawText: text };
  }
}

function getErrorCode(body) {
  return body?.error?.code || body?.code || "";
}

function getRequestId(response, body) {
  return response.headers.get("x-request-id") || body?.requestId || "";
}

function snippetFromRawText(rawText) {
  const normalized = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function classifyProbe(status, errorCode) {
  if (status === 200) return "ready";
  if (status === 401) return "unauthorized";
  if (status === 404 && errorCode === "CI_TEST_AUTH_DISABLED") return "disabled";
  if (status === 404) return "route_missing";
  if (status >= 500) return "upstream_error";
  return "unexpected";
}

function buildFailureMessage(classification, probe, endpoint) {
  const parts = [];
  if (classification === "disabled") {
    parts.push(
      "CI E2E auth is disabled on staging. Check CI_E2E_AUTH_SECRET, BETTER_AUTH_SECRET, CI_E2E_AUTH_ENABLED, NEXT_PUBLIC_APP_URL, and BETTER_AUTH_URL."
    );
  } else if (classification === "route_missing") {
    parts.push("CI E2E auth route is missing or the deployment is serving a node without the route enabled.");
  } else if (classification === "unauthorized") {
    parts.push("CI E2E auth secret was rejected by the staging route.");
  } else if (classification === "upstream_error") {
    parts.push("CI E2E auth route returned an upstream/server error.");
  } else if (classification === "invalid_probe_failed") {
    parts.push("The invalid-secret probe did not return 401, so the staging auth route is not healthy.");
  } else {
    parts.push("Unexpected auth preflight response.");
  }

  parts.push(`status=${probe?.status ?? "unknown"}`);
  if (probe?.errorCode) {
    parts.push(`code=${probe.errorCode}`);
  }
  parts.push(`endpoint=${endpoint}`);
  if (probe?.requestId) {
    parts.push(`requestId=${probe.requestId}`);
  }
  if (probe?.responseSnippet) {
    parts.push(`response=${probe.responseSnippet}`);
  }

  return parts.join(" | ");
}

async function runProbe({ endpoint, bearer, fetchImpl }) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
    },
  });
  const { body, rawText } = await parseJsonSafely(response);
  const errorCode = getErrorCode(body);
  return {
    status: response.status,
    errorCode,
    requestId: getRequestId(response, body),
    classification: classifyProbe(response.status, errorCode),
    responseSnippet: snippetFromRawText(rawText),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkAiLiveAuth({
  baseUrl,
  authSecret = process.env.CI_E2E_AUTH_SECRET,
  fetchImpl = fetch,
  maxAttempts = 3,
  retryDelayMs = 250,
} = {}) {
  const endpoint = buildEndpoint(baseUrl || process.env.PLAYWRIGHT_BASE_URL);
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const invalid = await runProbe({
      endpoint,
      bearer: "invalid-secret",
      fetchImpl,
    });
    const valid = authSecret
      ? await runProbe({
          endpoint,
          bearer: authSecret,
          fetchImpl,
        })
      : null;

    attempts.push({ attempt, invalid, valid });

    const invalidOk = invalid.status === 401;
    const validOk = valid ? valid.status === 200 : true;
    if (invalidOk && validOk) {
      return {
        ok: true,
        endpoint,
        status: valid?.status ?? invalid.status,
        errorCode: valid?.errorCode || invalid.errorCode,
        requestId: valid?.requestId || invalid.requestId,
        classification: "ready",
        attempts,
        message: "CI E2E auth route is enabled and accepted the configured secret.",
      };
    }

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  const lastAttempt = attempts[attempts.length - 1] || {};
  const invalidProbe = lastAttempt.invalid || null;
  const validProbe = lastAttempt.valid || null;
  const invalidHealthy = invalidProbe?.status === 401;
  const failureProbe = invalidHealthy ? validProbe || invalidProbe : invalidProbe;
  const classification = invalidHealthy
    ? validProbe?.classification || "unexpected"
    : "invalid_probe_failed";

  return {
    ok: false,
    endpoint,
    status: failureProbe?.status ?? 0,
    errorCode: failureProbe?.errorCode || "",
    requestId: failureProbe?.requestId || "",
    classification,
    attempts,
    message: buildFailureMessage(classification, failureProbe, endpoint),
  };
}

function parseArgs(argv) {
  const out = {
    baseUrl: process.env.PLAYWRIGHT_BASE_URL || "",
    maxAttempts: 3,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") {
      out.baseUrl = argv[i + 1] || out.baseUrl;
      i += 1;
      continue;
    }
    if (arg === "--max-attempts") {
      const parsed = Number.parseInt(argv[i + 1] || "", 10);
      out.maxAttempts = Number.isFinite(parsed) && parsed > 0 ? parsed : out.maxAttempts;
      i += 1;
    }
  }

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));

  try {
    const result = await checkAiLiveAuth(options);
    if (!result.ok) {
      process.stderr.write(`[ai-live] auth preflight failed: ${result.message}\n`);
      process.stderr.write(`[ai-live] endpoint: ${result.endpoint}\n`);
      process.stderr.write(`[ai-live] classification: ${result.classification}\n`);
      if (result.requestId) {
        process.stderr.write(`[ai-live] requestId: ${result.requestId}\n`);
      }
      process.exit(1);
    }

    process.stdout.write(
      `[ai-live] auth preflight passed: ${result.endpoint} (attempts=${result.attempts.length})\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ai-live] auth preflight error: ${message}\n`);
    process.exit(1);
  }
}
