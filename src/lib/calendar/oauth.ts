import { GOOGLE_CALENDAR_SCOPES } from "@/lib/calendar/connection";

const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function buildGoogleCalendarRedirectUri(origin: string) {
  return `${origin}/api/calendar/connect/callback`;
}

export function buildGoogleCalendarConsentUrl(params: {
  origin: string;
  state: string;
}) {
  const search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: buildGoogleCalendarRedirectUri(params.origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state: params.state,
  });

  return `${GOOGLE_AUTH_BASE_URL}?${search.toString()}`;
}

export async function exchangeCalendarCode(params: {
  code: string;
  origin: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code: params.code,
      grant_type: "authorization_code",
      redirect_uri: buildGoogleCalendarRedirectUri(params.origin),
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Google Calendar authorization code");
  }

  const data = await response.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string | undefined) ?? null,
    grantedScopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [],
    expiresAt: typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
  };
}

export async function fetchGoogleUserEmail(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return typeof data.email === "string" ? data.email : null;
}
