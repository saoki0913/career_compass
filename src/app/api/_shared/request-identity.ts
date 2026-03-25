import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getGuestUser } from "@/lib/auth/guest";
import { logError } from "@/lib/logger";

export type RequestIdentity = {
  userId: string | null;
  guestId: string | null;
};

export async function getHeadersIdentity(requestHeaders: Headers): Promise<RequestIdentity | null> {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;

  try {
    session = await auth.api.getSession({
      headers: requestHeaders,
    });
  } catch (error) {
    logError("request-identity:get-session", error, {
      hasDeviceToken: requestHeaders.has("x-device-token"),
    });
  }

  if (session?.user?.id) {
    return {
      userId: session.user.id,
      guestId: null,
    };
  }

  const deviceToken = requestHeaders.get("x-device-token");
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

export async function getRequestIdentity(request: NextRequest): Promise<RequestIdentity | null> {
  return getHeadersIdentity(request.headers);
}
