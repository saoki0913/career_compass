import { headers } from "next/headers";
import {
  RequestIdentitySessionError,
  resolveHeadersIdentity,
  type ActiveRequestIdentity,
} from "@/bff/identity/request-identity";
import { logError } from "@/lib/logger";

type PageSession = Awaited<ReturnType<typeof resolveHeadersIdentity>>["session"];

export type PageIdentityResult =
  | {
      status: "ready";
      identity: ActiveRequestIdentity | null;
      session: PageSession;
    }
  | {
      status: "session_unavailable";
      identity: null;
      session: null;
    };

export async function resolvePageIdentity(logContext: string): Promise<PageIdentityResult> {
  const requestHeaders = await headers();
  try {
    const result = await resolveHeadersIdentity(requestHeaders);
    return {
      status: "ready",
      identity: result.identity,
      session: result.session,
    };
  } catch (error) {
    if (error instanceof RequestIdentitySessionError) {
      logError(`${logContext}:session-unavailable`, error);
      return {
        status: "session_unavailable",
        identity: null,
        session: null,
      };
    }
    throw error;
  }
}
