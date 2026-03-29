import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buildGoogleCalendarConsentUrl } from "@/lib/calendar/oauth";
import { getSafeRelativeReturnPath } from "@/lib/security/safe-return-path";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    const loginUrl = new URL("/login", request.url);
    const returnTo = getSafeRelativeReturnPath(url.searchParams.get("returnTo"), "/calendar/settings");
    loginUrl.searchParams.set("callbackUrl", `/api/calendar/connect?returnTo=${encodeURIComponent(returnTo)}`);
    return NextResponse.redirect(loginUrl);
  }

  const returnTo = getSafeRelativeReturnPath(url.searchParams.get("returnTo"), "/calendar/settings");
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(buildGoogleCalendarConsentUrl({
    origin: url.origin,
    state,
  }));

  response.cookies.set("calendar_oauth_state", JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
