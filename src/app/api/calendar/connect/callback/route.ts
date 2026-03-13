import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { GOOGLE_CALENDAR_SCOPES, storeGoogleCalendarTokens } from "@/lib/calendar/connection";
import { exchangeCalendarCode, fetchGoogleUserEmail } from "@/lib/calendar/oauth";

function redirectWithError(baseUrl: URL, message: string) {
  const target = new URL("/calendar/settings", baseUrl);
  target.searchParams.set("error", message);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return redirectWithError(new URL(request.url), "ログイン状態を確認できませんでした");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieValue = request.headers.get("cookie")
    ?.split("; ")
    .find((value) => value.startsWith("calendar_oauth_state="))
    ?.split("=")[1];

  if (!code || !state || !cookieValue) {
    return redirectWithError(url, "Google連携を完了できませんでした");
  }

  let storedState: { state: string; returnTo: string } | null = null;
  try {
    storedState = JSON.parse(decodeURIComponent(cookieValue)) as { state: string; returnTo: string };
  } catch {
    storedState = null;
  }

  if (!storedState || storedState.state !== state) {
    return redirectWithError(url, "Google連携の検証に失敗しました");
  }

  try {
    const exchanged = await exchangeCalendarCode({
      code,
      origin: url.origin,
    });
    const email = await fetchGoogleUserEmail(exchanged.accessToken);
    const missingScopes = GOOGLE_CALENDAR_SCOPES.filter((scope) => !exchanged.grantedScopes.includes(scope));

    await storeGoogleCalendarTokens({
      userId: session.user.id,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expiresAt: exchanged.expiresAt,
      grantedScopes: exchanged.grantedScopes,
      email,
    });

    const target = new URL(storedState.returnTo || "/calendar/settings", url);
    if (missingScopes.length > 0) {
      target.searchParams.set("error", "必要な権限が不足しています。再連携してください。");
    } else {
      target.searchParams.set("connected", "1");
    }

    const response = NextResponse.redirect(target);
    response.cookies.set("calendar_oauth_state", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return redirectWithError(url, "Google連携に失敗しました");
  }
}
