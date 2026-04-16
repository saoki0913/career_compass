import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getAppUrl } from "@/lib/app-url";
import { getTrustedOrigins } from "@/lib/trusted-origins";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL?.trim() || getAppUrl(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  trustedOrigins: getTrustedOrigins(),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scope: [
        "openid",
        "email",
        "profile",
      ],
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
});

export type Session = typeof auth.$Infer.Session;
