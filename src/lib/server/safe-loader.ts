import { logError } from "@/lib/logger";

/** read-only page loader 専用。mutation / credit consumption には使用禁止。 */
export type SafeResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

export async function safeLoad<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<SafeResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    logError(`safeLoad:${name}`, err);
    return { data: null, error: name };
  }
}
