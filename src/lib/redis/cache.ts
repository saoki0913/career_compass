import { getRedis } from "./client";
import { redisKey, type RedisKeyPart } from "./keys";

export async function cacheGet<T>(
  keyParts: readonly RedisKeyPart[],
  fetcher: () => Promise<T>,
  opts: { ttlSeconds: number },
): Promise<T> {
  const redis = getRedis();
  if (!redis) return fetcher();
  const key = redisKey("cache", ...keyParts);

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;
  } catch {
    // fail-open: cache read error -> fall through to fetcher
  }

  const value = await fetcher();
  if (value !== null && value !== undefined) {
    try {
      await redis.setex(key, opts.ttlSeconds, value);
    } catch {
      // fail-open: cache write error -> return value anyway
    }
  }
  return value;
}

export async function cacheInvalidate(keyParts: readonly RedisKeyPart[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = redisKey("cache", ...keyParts);
  try {
    await redis.del(key);
  } catch {
    // fail-open
  }
}
