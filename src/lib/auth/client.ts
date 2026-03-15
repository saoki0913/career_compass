import { createAuthClient } from "better-auth/react";
import { getClientAuthBaseUrl } from "@/lib/app-url";

export const authClient = createAuthClient({
  baseURL: getClientAuthBaseUrl(),
});

export const { signIn, signOut, signUp, useSession } = authClient;
