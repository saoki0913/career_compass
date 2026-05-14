import { cache } from "react";
import { headers } from "next/headers";
import { getHeadersIdentity } from "@/bff/identity/request-identity";

export const getCurrentRequestIdentity = cache(async () => {
  return getHeadersIdentity(await headers());
});

