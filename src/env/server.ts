import "server-only";

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

function buildServerEnv() {
  return createEnv({
    server: {
      // -----------------------------------------------------------------------
      // Database
      // -----------------------------------------------------------------------
      DATABASE_URL: z.string().url(),
      DIRECT_URL: z.string().url().optional(),
      DATABASE_POOL_SIZE: z.coerce.number().int().positive().optional(),

      // -----------------------------------------------------------------------
      // Auth (Better Auth + Google OAuth)
      // -----------------------------------------------------------------------
      BETTER_AUTH_SECRET: z.string().min(32),
      BETTER_AUTH_URL: z.string().url().optional(),
      BETTER_AUTH_TRUSTED_ORIGINS: z.string().min(1).optional(),
      GOOGLE_CLIENT_ID: z.string().min(1),
      GOOGLE_CLIENT_SECRET: z.string().min(1),

      // -----------------------------------------------------------------------
      // Stripe
      // -----------------------------------------------------------------------
      STRIPE_SECRET_KEY: z.string().min(1),
      STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
      STRIPE_PRICE_STANDARD_MONTHLY: z.string().optional(),
      STRIPE_PRICE_STANDARD_ANNUAL: z.string().optional(),
      STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
      STRIPE_PRICE_PRO_ANNUAL: z.string().optional(),
      STRIPE_PORTAL_CONFIGURATION_ID: z.string().min(1).optional(),

      // -----------------------------------------------------------------------
      // Security / Encryption
      // -----------------------------------------------------------------------
      ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),
      CRON_SECRET: z.string().min(1),

      // -----------------------------------------------------------------------
      // Internal API (BFF <-> FastAPI)
      // -----------------------------------------------------------------------
      INTERNAL_API_JWT_SECRET: z.string().min(32),
      CAREER_PRINCIPAL_HMAC_SECRET: z.string().min(32),
      TENANT_KEY_SECRET: z.string().min(1).optional(),
      FASTAPI_URL: z.string().url().optional(),
      BACKEND_URL: z.string().url().optional(),

      // -----------------------------------------------------------------------
      // Redis (Upstash)
      // -----------------------------------------------------------------------
      UPSTASH_REDIS_REST_URL: z.string().url().optional(),
      UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
      UPSTASH_REDIS_NAMESPACE: z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/)
        .optional(),

      // -----------------------------------------------------------------------
      // Mail (Resend)
      // -----------------------------------------------------------------------
      RESEND_API_KEY: z.string().min(1).optional(),
      CONTACT_TO_EMAIL: z.string().email().optional(),
      CONTACT_FROM_EMAIL: z.string().email().optional(),

      // -----------------------------------------------------------------------
      // Logo providers
      // -----------------------------------------------------------------------
      LOGO_DEV_TOKEN: z.string().min(1).optional(),
      LOGO_DEV_SECRET_KEY: z.string().min(1).optional(),
      BRANDFETCH_CLIENT_ID: z.string().min(1).optional(),

      // -----------------------------------------------------------------------
      // Sentry
      // -----------------------------------------------------------------------
      SENTRY_ORG: z.string().min(1).optional(),
      SENTRY_PROJECT: z.string().min(1).optional(),
      SENTRY_AUTH_TOKEN: z.string().min(1).optional(),

      // -----------------------------------------------------------------------
      // CI / E2E
      // -----------------------------------------------------------------------
      CI_E2E_AUTH_ENABLED: z.string().optional(),
      CI_E2E_AUTH_SECRET: z.string().optional(),
      CI_E2E_AUTH_ALLOWED_HOSTS: z.string().optional(),

      // -----------------------------------------------------------------------
      // Feature flags
      // -----------------------------------------------------------------------
      DISABLE_TOKEN_LIMIT: z.string().optional(),
    },

    skipValidation:
      process.env.SKIP_ENV_VALIDATION === "1" &&
      (process.env.NODE_ENV !== "production" || !!process.env.VITEST),

    emptyStringAsUndefined: true,

    runtimeEnv: {
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PRICE_STANDARD_MONTHLY: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
      STRIPE_PRICE_STANDARD_ANNUAL: process.env.STRIPE_PRICE_STANDARD_ANNUAL,
      STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
      STRIPE_PRICE_PRO_ANNUAL: process.env.STRIPE_PRICE_PRO_ANNUAL,
      STRIPE_PORTAL_CONFIGURATION_ID: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
      INTERNAL_API_JWT_SECRET: process.env.INTERNAL_API_JWT_SECRET,
      CAREER_PRINCIPAL_HMAC_SECRET: process.env.CAREER_PRINCIPAL_HMAC_SECRET,
      TENANT_KEY_SECRET: process.env.TENANT_KEY_SECRET,
      FASTAPI_URL: process.env.FASTAPI_URL,
      BACKEND_URL: process.env.BACKEND_URL,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
      UPSTASH_REDIS_NAMESPACE: process.env.UPSTASH_REDIS_NAMESPACE,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL,
      CONTACT_FROM_EMAIL: process.env.CONTACT_FROM_EMAIL,
      LOGO_DEV_TOKEN: process.env.LOGO_DEV_TOKEN,
      LOGO_DEV_SECRET_KEY: process.env.LOGO_DEV_SECRET_KEY,
      BRANDFETCH_CLIENT_ID: process.env.BRANDFETCH_CLIENT_ID,
      SENTRY_ORG: process.env.SENTRY_ORG,
      SENTRY_PROJECT: process.env.SENTRY_PROJECT,
      SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
      CI_E2E_AUTH_ENABLED: process.env.CI_E2E_AUTH_ENABLED,
      CI_E2E_AUTH_SECRET: process.env.CI_E2E_AUTH_SECRET,
      CI_E2E_AUTH_ALLOWED_HOSTS: process.env.CI_E2E_AUTH_ALLOWED_HOSTS,
      DISABLE_TOKEN_LIMIT: process.env.DISABLE_TOKEN_LIMIT,
    },
  });
}

type ServerEnv = ReturnType<typeof buildServerEnv>;

let _cache: ServerEnv | undefined;

function resolve(): ServerEnv {
  _cache ??= buildServerEnv();
  return _cache;
}

export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_, prop, receiver) {
    return Reflect.get(resolve(), prop, receiver);
  },
  has(_, prop) {
    return Reflect.has(resolve(), prop);
  },
  ownKeys() {
    return Reflect.ownKeys(resolve());
  },
  getOwnPropertyDescriptor(_, prop) {
    return Object.getOwnPropertyDescriptor(resolve(), prop);
  },
});
