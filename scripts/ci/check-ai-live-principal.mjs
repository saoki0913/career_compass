#!/usr/bin/env node

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function buildEndpoint(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error("PLAYWRIGHT_BASE_URL or --base-url is required");
  }
  return `${normalized}/api/internal/local-ai-live/principal-preflight`;
}

async function parseJsonSafely(response) {
  const text = await response.text();
  if (!text) {
    return { body: null, rawText: "" };
  }

  try {
    return { body: JSON.parse(text), rawText: text };
  } catch {
    return { body: null, rawText: text };
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

function classify(status, errorCode) {
  if (status === 200) return "ready";
  if (status === 404 && errorCode === "LOCAL_AI_LIVE_ONLY") return "disabled";
  if (status === 404) return "route_missing";
  if (status === 401 || status === 403) return "unauthorized";
  if (status >= 500) return "upstream_error";
  return "unexpected";
}

function buildFailureMessage(classification, probe, endpoint) {
  const parts = [];
  if (classification === "disabled") {
    parts.push("Local principal preflight is disabled outside localhost.");
  } else if (classification === "route_missing") {
    parts.push("Local principal preflight route is missing.");
  } else if (classification === "unauthorized") {
    parts.push("Local principal preflight was rejected.");
  } else if (classification === "upstream_error") {
    parts.push("Local principal preflight hit an upstream/server error.");
  } else {
    parts.push("Unexpected local principal preflight response.");
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

export async function checkAiLivePrincipal({
  baseUrl,
  fetchImpl = fetch,
} = {}) {
  const endpoint = buildEndpoint(baseUrl || process.env.PLAYWRIGHT_BASE_URL);
  const response = await fetchImpl(endpoint, {
    method: "GET",
  });
  const { body, rawText } = await parseJsonSafely(response);
  const probe = {
    status: response.status,
    errorCode: getErrorCode(body),
    requestId: getRequestId(response, body),
    classification: classify(response.status, getErrorCode(body)),
    responseSnippet: snippetFromRawText(rawText),
  };

  if (probe.classification === "ready") {
    return {
      ok: true,
      endpoint,
      classification: "ready",
      status: probe.status,
      requestId: probe.requestId,
      message: "Local principal preflight passed.",
    };
  }

  return {
    ok: false,
    endpoint,
    classification: probe.classification,
    status: probe.status,
    errorCode: probe.errorCode,
    requestId: probe.requestId,
    message: buildFailureMessage(probe.classification, probe, endpoint),
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
    const result = await checkAiLivePrincipal(options);
    if (!result.ok) {
      process.stderr.write(`[ai-live] principal preflight failed: ${result.message}\n`);
      process.stderr.write(`[ai-live] endpoint: ${result.endpoint}\n`);
      process.stderr.write(`[ai-live] classification: ${result.classification}\n`);
      process.exit(1);
    }

    process.stderr.write(`[ai-live] principal preflight passed: ${result.endpoint}\n`);
  } catch (error) {
    process.stderr.write(`[ai-live] principal preflight errored: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
