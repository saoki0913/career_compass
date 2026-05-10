import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getGuestUser } from "@/lib/auth/guest";
import { readGuestDeviceTokenFromCookieHeader } from "@/lib/auth/guest-cookie";
import { logError } from "@/lib/logger";

export type RequestIdentity = {
  userId: string | null;
  guestId: string | null;
};

type RequestIdentityOptions = {
  allowDeviceTokenHeader?: boolean;
  sessionErrorMode?: "fallback" | "throw";
};

export class RequestIdentitySessionError extends Error {
  constructor(cause: unknown) {
    super("Failed to resolve authenticated session");
    this.name = "RequestIdentitySessionError";
    this.cause = cause;
  }
}

export async function getHeadersIdentity(
  requestHeaders: Headers,
  options: RequestIdentityOptions = {},
): Promise<RequestIdentity | null> {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;

  try {
    session = await auth.api.getSession({
      headers: requestHeaders,
    });
  } catch (error) {
    logError("request-identity:get-session", error, {
      hasDeviceToken: requestHeaders.has("x-device-token"),
    });
    if (options.sessionErrorMode === "throw") {
      throw new RequestIdentitySessionError(error);
    }
  }

  if (session?.user?.id) {
    return {
      userId: session.user.id,
      guestId: null,
    };
  }

  const deviceTokenFromCookie = readGuestDeviceTokenFromCookieHeader(requestHeaders.get("cookie"));
  const deviceTokenFromHeader = options.allowDeviceTokenHeader
    ? requestHeaders.get("x-device-token")
    : null;
  const deviceToken = deviceTokenFromCookie ?? deviceTokenFromHeader;
  if (!deviceToken) {
    return null;
  }

  const guest = await getGuestUser(deviceToken);
  if (!guest) {
    return null;
  }

  return {
    userId: null,
    guestId: guest.id,
  };
}

export async function getRequestIdentity(
  request: NextRequest,
  options?: RequestIdentityOptions,
): Promise<RequestIdentity | null> {
  return getHeadersIdentity(request.headers, options);
}
