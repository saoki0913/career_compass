import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getGuestUser } from "@/lib/auth/guest";

export type RequestIdentity = {
  userId: string | null;
  guestId: string | null;
};

export async function getHeadersIdentity(requestHeaders: Headers): Promise<RequestIdentity | null> {
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

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
