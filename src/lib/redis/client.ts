import "server-only";
import { Redis } from "@upstash/redis";
import { serverEnv } from "@/env/server";

export { getRedisNamespace } from "./keys";

let _redis: Redis | null = null;
let _checked = false;

export function isRedisConfigured(): boolean {
  return !!(serverEnv.UPSTASH_REDIS_REST_URL && serverEnv.UPSTASH_REDIS_REST_TOKEN);
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
