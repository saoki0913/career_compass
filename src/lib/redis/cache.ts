import { getRedis } from "./client";

export async function cacheGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlSeconds: number },
): Promise<T> {
  const redis = getRedis();
  if (!redis) return fetcher();

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

export async function cacheInvalidate(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // fail-open
  }
}
