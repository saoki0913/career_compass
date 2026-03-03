import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buildGoogleCalendarConsentUrl } from "@/lib/calendar/oauth";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", "/calendar/settings");
    return NextResponse.redirect(loginUrl);
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo")?.startsWith("/") ? url.searchParams.get("returnTo")! : "/calendar/settings";
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
