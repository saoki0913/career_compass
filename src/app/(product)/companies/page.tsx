import { headers } from "next/headers";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getCompaniesPageData } from "@/lib/server/app-loaders";
import { CompaniesPageClient } from "@/components/companies/CompaniesPageClient";

export default async function CompaniesPage() {
  const identity = await getHeadersIdentity(await headers());
  const initialData = identity ? await getCompaniesPageData(identity) : undefined;

  return <CompaniesPageClient initialData={initialData} />;
}
