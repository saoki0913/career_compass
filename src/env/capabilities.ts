import "server-only";

import { z } from "zod";
import { parseTrustedOriginList } from "@/lib/trusted-origins";

export type RuntimeEnvProfile = "development" | "test" | "preview" | "production";

type RuntimeEnv = Record<string, string | undefined>;

export type CapabilityEnvStatus<T> =
  | { configured: true; env: T; missing: []; invalid: [] }
  | { configured: false; env: null; missing: string[]; invalid: string[] };

export class AuthConfigurationError extends Error {
  readonly code = "AUTH_ENV_INVALID";
  readonly missingKeys: string[];
  readonly invalidKeys: string[];

  constructor(input: { missingKeys?: string[]; invalidKeys?: string[]; message?: string }) {
    const missingKeys = input.missingKeys ?? [];
    const invalidKeys = input.invalidKeys ?? [];
    super(input.message ?? buildCapabilityErrorMessage("auth", missingKeys, invalidKeys));
    this.name = "AuthConfigurationError";
    this.missingKeys = missingKeys;
    this.invalidKeys = invalidKeys;
  }
}

const nonEmptyString = z.string().trim().min(1);
const optionalUrl = z.string().trim().url().optional();
const optionalNonEmpty = z.string().trim().min(1).optional();
const url = z.string().trim().url();
const secret32 = z.string().trim().min(32);
const hex32ByteKey = z.string().trim().length(64).regex(/^[0-9a-fA-F]+$/);

const databaseEnvSchema = z.object({
  DATABASE_URL: url,
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().optional(),
});

const authEnvSchema = z.object({
  DATABASE_URL: url,
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().optional(),
  BETTER_AUTH_SECRET: secret32,
  BETTER_AUTH_URL: optionalUrl,
  BETTER_AUTH_TRUSTED_ORIGINS: optionalNonEmpty,
  GOOGLE_CLIENT_ID: nonEmptyString,
  GOOGLE_CLIENT_SECRET: nonEmptyString,
  NEXT_PUBLIC_APP_URL: optionalUrl,
});

const baseDeployedEnvSchema = authEnvSchema.extend({
  STRIPE_SECRET_KEY: nonEmptyString,
  STRIPE_WEBHOOK_SECRET: z.string().trim().startsWith("whsec_"),
  ENCRYPTION_KEY: hex32ByteKey,
  CRON_SECRET: nonEmptyString,
  INTERNAL_API_JWT_SECRET: secret32,
  CAREER_PRINCIPAL_HMAC_SECRET: secret32,
  FASTAPI_URL: url,
});

const productionEnvSchema = baseDeployedEnvSchema.extend({
  STRIPE_PRICE_STANDARD_MONTHLY: nonEmptyString,
  STRIPE_PRICE_STANDARD_ANNUAL: nonEmptyString,
  STRIPE_PRICE_PRO_MONTHLY: nonEmptyString,
  STRIPE_PRICE_PRO_ANNUAL: nonEmptyString,
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema> & {
  baseURL: string;
  trustedOrigins: string[];
};

export type StartupEnvReport = {
  profile: RuntimeEnvProfile;
  fatal: string[];
  degraded: string[];
  disabled: string[];
};

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isMissingValue(value: string | undefined) {
  return clean(value) === undefined;
}

function keysForShape(schema: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.keys(schema.shape);
}

function statusFromSchema<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  env: RuntimeEnv = process.env,
): CapabilityEnvStatus<z.infer<T>> {
  const runtimeEnv = Object.fromEntries(
    keysForShape(schema).map((key) => [key, clean(env[key])]),
  );
  const parsed = schema.safeParse(runtimeEnv);
  if (parsed.success) {
    return { configured: true, env: parsed.data, missing: [], invalid: [] };
  }

  const missing = new Set<string>();
  const invalid = new Set<string>();
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (!key) continue;
    if (isMissingValue(env[key])) {
      missing.add(key);
    } else {
      invalid.add(key);
    }
  }

  return {
    configured: false,
    env: null,
    missing: [...missing].sort(),
    invalid: [...invalid].sort(),
  };
}

function buildCapabilityErrorMessage(capability: string, missing: string[], invalid: string[]) {
  const parts = [
    ...missing.map((key) => `${key} is missing`),
    ...invalid.map((key) => `${key} is invalid`),
  ];
  return `${capability} environment is not configured: ${parts.join(", ")}`;
}

export function getRuntimeEnvProfile(env: RuntimeEnv = process.env): RuntimeEnvProfile {
  if (env.VITEST) return "test";
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.NODE_ENV === "production") return "production";
  return "development";
}

export function getDatabaseEnvStatus(env: RuntimeEnv = process.env): CapabilityEnvStatus<DatabaseEnv> {
  return statusFromSchema(databaseEnvSchema, env);
}

export function requireAuthEnv(env: RuntimeEnv = process.env): AuthEnv {
  const status = statusFromSchema(authEnvSchema, env);
  if (!status.configured) {
    throw new AuthConfigurationError({
      missingKeys: status.missing,
      invalidKeys: status.invalid,
    });
  }

  const baseURL =
    status.env.BETTER_AUTH_URL?.trim() ||
    status.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (getRuntimeEnvProfile(env) === "development" ? "http://localhost:3000" : undefined);
  if (!baseURL) {
    throw new AuthConfigurationError({
      missingKeys: ["BETTER_AUTH_URL"],
      message: "auth environment is not configured: BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL is missing",
    });
  }

  let trustedOrigins: string[];
  try {
    trustedOrigins = parseTrustedOriginList(status.env.BETTER_AUTH_TRUSTED_ORIGINS, {
      strict: getRuntimeEnvProfile(env) !== "development" && getRuntimeEnvProfile(env) !== "test",
    });
  } catch (error) {
    throw new AuthConfigurationError({
      invalidKeys: ["BETTER_AUTH_TRUSTED_ORIGINS"],
      message: error instanceof Error ? error.message : "BETTER_AUTH_TRUSTED_ORIGINS is invalid",
    });
  }

  return {
    ...status.env,
    baseURL,
    trustedOrigins,
  };
}

export function validateStartupCapabilities(
  profile: RuntimeEnvProfile = getRuntimeEnvProfile(),
  env: RuntimeEnv = process.env,
): StartupEnvReport {
  const fatal: string[] = [];
  const degraded: string[] = [];
  const disabled: string[] = [];

  if (profile === "development" || profile === "test") {
    if (env.DATABASE_URL) {
      const databaseStatus = getDatabaseEnvStatus(env);
      if (!databaseStatus.configured) {
        fatal.push(buildCapabilityErrorMessage("database", databaseStatus.missing, databaseStatus.invalid));
      }
    } else {
      disabled.push("database");
    }
    return { profile, fatal, degraded, disabled };
  }

  const deployedSchema = profile === "production" ? productionEnvSchema : baseDeployedEnvSchema;
  const deployedStatus = statusFromSchema(deployedSchema, env);
  if (!deployedStatus.configured) {
    fatal.push(buildCapabilityErrorMessage("startup", deployedStatus.missing, deployedStatus.invalid));
  }

  try {
    const authEnv = requireAuthEnv(env);
    const origins = new Set(authEnv.trustedOrigins);
    if (origins.size === 0) {
      fatal.push("BETTER_AUTH_TRUSTED_ORIGINS must be configured in deployed environments.");
    }
    for (const origin of origins) {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:") {
        fatal.push("BETTER_AUTH_TRUSTED_ORIGINS must use HTTPS in deployed environments.");
        break;
      }
    }
    if (profile === "production") {
      for (const origin of ["https://www.shupass.jp", "https://shupass.jp"]) {
        if (!origins.has(origin)) {
          fatal.push(`BETTER_AUTH_TRUSTED_ORIGINS must include ${origin} in production.`);
        }
      }
    }
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      fatal.push(buildCapabilityErrorMessage("auth", error.missingKeys, error.invalidKeys));
    } else {
      fatal.push(error instanceof Error ? error.message : "auth environment is invalid");
    }
  }

  return { profile, fatal: [...new Set(fatal)], degraded, disabled };
}
