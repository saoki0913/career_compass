import "server-only";

import { resolveAppEnvironment, type AppEnvironment } from "@/env/deployment";
import { serverEnv } from "@/env/server";

export type RedisKeyDomain = "rl" | "llm" | "cache" | "rag" | "sse";
export type RedisKeyPart = string | number;

const MAX_KEY_PART_LENGTH = 200;

function safePart(value: RedisKeyPart): string {
  return encodeURIComponent(String(value)).slice(0, MAX_KEY_PART_LENGTH);
}

function assertConfiguredNamespaceMatchesAppEnv(
  configured: string | undefined,
  appEnv: AppEnvironment,
): void {
  if (!configured) return;
  if (configured !== appEnv) {
    throw new Error(
      `UPSTASH_REDIS_NAMESPACE must match APP_ENV (${appEnv}); got ${configured}`,
    );
  }
}

export function getRedisNamespace(): AppEnvironment {
  const appEnv = resolveAppEnvironment();
  const configured = serverEnv.UPSTASH_REDIS_NAMESPACE?.trim();
  assertConfiguredNamespaceMatchesAppEnv(configured, appEnv);
  return appEnv;
}

export function redisKey(
  domain: RedisKeyDomain,
  ...parts: readonly RedisKeyPart[]
): string {
  return ["cc", getRedisNamespace(), domain, ...parts.map(safePart)].join(":");
}
