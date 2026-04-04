#!/usr/bin/env node

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function buildEndpoint(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error("PLAYWRIGHT_BASE_URL or --base-url is required");
  }
  return `${normalized}/api/internal/test-auth/reset-live-state`;
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

function buildFailureMessage(result) {
  const parts = [
    "AI Live state reset failed.",
    `status=${result.status}`,
    `endpoint=${result.endpoint}`,
  ];
  if (result.errorCode) {
    parts.push(`code=${result.errorCode}`);
  }
  if (result.requestId) {
    parts.push(`requestId=${result.requestId}`);
  }
  if (result.responseSnippet) {
    parts.push(`response=${result.responseSnippet}`);
  }
  return parts.join(" | ");
}

export async function resetAiLiveState({
  baseUrl,
  authSecret = process.env.CI_E2E_AUTH_SECRET,
  fetchImpl = fetch,
} = {}) {
  const endpoint = buildEndpoint(baseUrl || process.env.PLAYWRIGHT_BASE_URL);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authSecret || ""}`,
    },
  });
  const { body, rawText } = await parseJsonSafely(response);

  const result = {
    ok: response.status === 200,
    endpoint,
    status: response.status,
    errorCode: getErrorCode(body),
    requestId: getRequestId(response, body),
    responseSnippet: snippetFromRawText(rawText),
    userId: body?.userId || "",
    creditBalance: Number(body?.creditBalance ?? 0),
    deletedCounts: body?.deletedCounts || {},
  };

  return result.ok
    ? {
        ...result,
        message: "AI Live state reset completed.",
      }
    : {
        ...result,
        message: buildFailureMessage(result),
      };
}

function parseArgs(argv) {
  const out = {
    baseUrl: process.env.PLAYWRIGHT_BASE_URL || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") {
      out.baseUrl = argv[i + 1] || out.baseUrl;
      i += 1;
    }
  }

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));

  try {
    const result = await resetAiLiveState(options);
    if (!result.ok) {
      process.stderr.write(`[ai-live] state reset failed: ${result.message}\n`);
      process.exit(1);
    }

    process.stdout.write(
      `[ai-live] state reset passed: userId=${result.userId} creditBalance=${result.creditBalance} deletedCounts=${JSON.stringify(result.deletedCounts)}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ai-live] state reset error: ${message}\n`);
    process.exit(1);
  }
}
