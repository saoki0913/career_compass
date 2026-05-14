import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getBetterAuthSessionCookieCandidates } from "@/lib/auth/ci-e2e";
import { getGuestUser } from "@/lib/auth/guest";
import { readGuestDeviceTokenFromCookieHeader } from "@/lib/auth/guest-cookie";
import { logError } from "@/lib/logger";

export type RequestUserRole = "user" | "admin";

export type ActiveUserIdentity = {
  kind: "user";
  type: "user";
  userId: string;
  guestId: null;
  role: RequestUserRole;
  banned: false;
};

export type ActiveGuestIdentity = {
  kind: "guest";
  type: "guest";
  userId: null;
  guestId: string;
};

export type ActiveRequestIdentity = ActiveUserIdentity | ActiveGuestIdentity;

export type OwnerIdentity = {
  userId: string | null;
  guestId: string | null;
};

export type RequestIdentity = OwnerIdentity;

type RequestIdentityOptions = {
  sessionErrorMode?: "fallback" | "throw";
};

export class RequestIdentitySessionError extends Error {
  constructor(cause: unknown) {
    super("Failed to resolve authenticated session");
    this.name = "RequestIdentitySessionError";
    this.cause = cause;
  }
}

function hasBetterAuthSessionCookie(requestHeaders: Headers): boolean {
  const cookieHeader = requestHeaders.get("cookie");
  if (!cookieHeader) {
    return false;
  }

  return getBetterAuthSessionCookieCandidates().some((cookieName) =>
    cookieHeader.split(";").some((part) => part.trim().startsWith(`${cookieName}=`)),
  );
}

function normalizeRole(role: unknown): RequestUserRole {
  return role === "admin" ? "admin" : "user";
}

function isCurrentlyBanned(user: { banned?: boolean | null; banExpires?: Date | string | null }) {
  if (!user.banned) {
    return false;
  }
  if (!user.banExpires) {
    return true;
  }
  return new Date(user.banExpires).getTime() > Date.now();
}

export function toOwnerIdentity(identity: ActiveRequestIdentity): OwnerIdentity {
  return {
    userId: identity.userId,
    guestId: identity.guestId,
  };
}

export async function getHeadersIdentity(
  requestHeaders: Headers,
  options: RequestIdentityOptions = {},
): Promise<ActiveRequestIdentity | null> {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  const hasSessionCookie = hasBetterAuthSessionCookie(requestHeaders);
  let deviceTokenFromCookie: string | null | undefined;
  const getDeviceTokenFromCookie = () => {
    if (deviceTokenFromCookie === undefined) {
      deviceTokenFromCookie = readGuestDeviceTokenFromCookieHeader(requestHeaders.get("cookie"));
    }
    return deviceTokenFromCookie;
  };

  try {
    session = await auth.api.getSession({
      headers: requestHeaders,
    });
  } catch (error) {
    logError("request-identity:get-session", error, {
      hasGuestDeviceCookie: Boolean(getDeviceTokenFromCookie()),
      hasSessionCookie,
    });
    if (options.sessionErrorMode === "throw" || hasSessionCookie) {
      throw new RequestIdentitySessionError(error);
    }
  }

  if (session?.user?.id) {
    if (isCurrentlyBanned(session.user)) {
      return null;
    }

    return {
      kind: "user",
      type: "user",
      userId: session.user.id,
      guestId: null,
      role: normalizeRole(session.user.role),
      banned: false,
    };
  }

  if (hasSessionCookie && options.sessionErrorMode !== "fallback") {
    return null;
  }

  const deviceToken = getDeviceTokenFromCookie();
  if (!deviceToken) {
    return null;
  }

  const guest = await getGuestUser(deviceToken);
  if (!guest) {
    return null;
  }

  return {
    kind: "guest",
    type: "guest",
    userId: null,
    guestId: guest.id,
  };
}

export async function getRequestIdentity(
  request: NextRequest,
  options?: RequestIdentityOptions,
): Promise<ActiveRequestIdentity | null> {
  return getHeadersIdentity(request.headers, options);
}
