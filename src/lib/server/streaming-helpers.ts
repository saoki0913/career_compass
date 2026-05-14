import { logError } from "@/lib/logger";

/** read-only Server Component page loader 専用。mutation / credit consumption には使用禁止。 */
export async function streamableLoad<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logError(`streamableLoad:${name}`, error);
    throw error;
  }
}

