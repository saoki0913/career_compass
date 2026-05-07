import "server-only";

/**
 * Detect errors thrown when CAREER_PRINCIPAL_HMAC_SECRET or
 * INTERNAL_API_JWT_SECRET environment variables are missing.
 *
 * API routes use this to convert the hard crash into a recoverable
 * 503 response with a user-friendly message.
 */
export function isSecretMissingError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/CAREER_PRINCIPAL_HMAC_SECRET is not configured/.test(error.message) ||
      /INTERNAL_API_JWT_SECRET is not configured/.test(error.message))
  );
}
