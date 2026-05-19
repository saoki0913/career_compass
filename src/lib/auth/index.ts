import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { AuthConfigurationError, requireAuthEnv } from "@/env/capabilities";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getTrustedOrigins } from "@/lib/trusted-origins";

function createAuth() {
  const authEnv = requireAuthEnv();
  let trustedOrigins: string[];
  try {
    trustedOrigins = getTrustedOrigins(authEnv.BETTER_AUTH_TRUSTED_ORIGINS);
  } catch (error) {
    throw new AuthConfigurationError({
      invalidKeys: ["BETTER_AUTH_TRUSTED_ORIGINS"],
      message: error instanceof Error ? error.message : "BETTER_AUTH_TRUSTED_ORIGINS is invalid",
    });
  }

  return betterAuth({
    secret: authEnv.BETTER_AUTH_SECRET,
    baseURL: authEnv.baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins,
    socialProviders: {
      google: {
        clientId: authEnv.GOOGLE_CLIENT_ID,
        clientSecret: authEnv.GOOGLE_CLIENT_SECRET,
        scope: [
          "openid",
          "email",
          "profile",
        ],
      },
    },
    plugins: [
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        bannedUserMessage: "このアカウントは現在利用できません。サポートにお問い合わせください。",
      }),
    ],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      },
    },
  });
}

export const auth = createAuth();

export type Session = typeof auth.$Infer.Session;
