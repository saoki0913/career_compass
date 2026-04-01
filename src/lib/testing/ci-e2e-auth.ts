export type CiE2EAuthClassification =
  | "disabled"
  | "route_missing"
  | "unauthorized"
  | "upstream_error"
  | "unexpected";

export function classifyCiE2EAuthResponse(input: {
  status: number;
  errorCode?: string | null;
}): CiE2EAuthClassification {
  const errorCode = String(input.errorCode || "").trim();
  if (input.status === 404 && errorCode === "CI_TEST_AUTH_DISABLED") {
    return "disabled";
  }
  if (input.status === 404) {
    return "route_missing";
  }
  if (input.status === 401) {
    return "unauthorized";
  }
  if (input.status >= 500) {
    return "upstream_error";
  }
  return "unexpected";
}

export function buildCiE2EAuthFailureMessage(input: {
  status: number;
  errorCode?: string | null;
  endpoint: string;
  requestId?: string | null;
  responseSnippet?: string | null;
}): string {
  const classification = classifyCiE2EAuthResponse(input);
  const parts: string[] = [];

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
  } else {
    parts.push("CI E2E auth route returned an unexpected response.");
  }

  parts.push(`status=${input.status}`);
  if (input.errorCode) {
    parts.push(`code=${input.errorCode}`);
  }
  parts.push(`endpoint=${input.endpoint}`);
  if (input.requestId) {
    parts.push(`requestId=${input.requestId}`);
  }
  if (input.responseSnippet) {
    parts.push(`response=${input.responseSnippet}`);
  }

  return parts.join(" | ");
}
