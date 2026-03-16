import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getGuestUser } from "@/lib/auth/guest";

export type RequestIdentity = {
  userId: string | null;
  guestId: string | null;
};

export async function getRequestIdentity(request: NextRequest): Promise<RequestIdentity | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (session?.user?.id) {
    return {
      userId: session.user.id,
      guestId: null,
    };
  }

  const deviceToken = request.headers.get("x-device-token");
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
