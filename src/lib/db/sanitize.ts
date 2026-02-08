/**
 * Sanitize database records before sending in API responses.
 * Strips sensitive fields that should never be exposed to the client.
 */

/**
 * Strip sensitive credential fields from a company object.
 * Returns the company with `mypagePassword` and `mypageLoginId` removed,
 * and a `hasCredentials` boolean indicating if credentials exist.
 */
export function stripCompanyCredentials<
  T extends { mypagePassword?: string | null; mypageLoginId?: string | null },
>(company: T): Omit<T, "mypagePassword" | "mypageLoginId"> & { hasCredentials: boolean } {
  const { mypagePassword, mypageLoginId, ...safe } = company;
  return {
    ...safe,
    hasCredentials: !!(mypagePassword || mypageLoginId),
  };
}

/**
 * Strip sensitive credential fields from an array of company objects.
 */
export function stripCompanyCredentialsList<
  T extends { mypagePassword?: string | null; mypageLoginId?: string | null },
>(companies: T[]): (Omit<T, "mypagePassword" | "mypageLoginId"> & { hasCredentials: boolean })[] {
  return companies.map(stripCompanyCredentials);
}
