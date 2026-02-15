/**
 * Sanitize database records before sending in API responses.
 * Strips sensitive fields that should never be exposed to the client.
 */

/**
 * Strip sensitive credential fields from a company object.
 * Returns the company with `mypagePassword` removed (mypageLoginId is kept),
 * and a `hasCredentials` boolean indicating if an encrypted password exists.
 */
export function stripCompanyCredentials<
  T extends { mypagePassword?: string | null; mypageLoginId?: string | null },
>(company: T): Omit<T, "mypagePassword"> & { hasCredentials: boolean } {
  const { mypagePassword, ...safe } = company;
  return {
    ...safe,
    hasCredentials: !!mypagePassword,
  };
}

/**
 * Strip sensitive credential fields from an array of company objects.
 */
export function stripCompanyCredentialsList<
  T extends { mypagePassword?: string | null; mypageLoginId?: string | null },
>(companies: T[]): (Omit<T, "mypagePassword"> & { hasCredentials: boolean })[] {
  return companies.map(stripCompanyCredentials);
}
