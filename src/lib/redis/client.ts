import "server-only";
import { Redis } from "@upstash/redis";
import { serverEnv } from "@/env/server";

let _redis: Redis | null = null;
let _checked = false;

export function isRedisConfigured(): boolean {
  return !!(serverEnv.UPSTASH_REDIS_REST_URL && serverEnv.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedisNamespace(): string {
  const configured = serverEnv.UPSTASH_REDIS_NAMESPACE?.trim();
  if (configured) return configured;

  if (process.env.VERCEL_ENV === "production") return "prod";
  if (process.env.VERCEL_ENV === "preview") return "stg";
  if (process.env.NODE_ENV === "production") return "prod";
  return "local";
}

export function getRedis(): Redis | null {
  if (_checked) return _redis;
  _checked = true;
  if (!isRedisConfigured()) return null;
  _redis = new Redis({
    url: serverEnv.UPSTASH_REDIS_REST_URL!,
    token: serverEnv.UPSTASH_REDIS_REST_TOKEN!,
  });
  return _redis;
}

export function _resetForTests(): void {
  _redis = null;
  _checked = false;
}
