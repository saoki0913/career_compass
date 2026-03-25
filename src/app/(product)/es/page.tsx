import { headers } from "next/headers";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getCompaniesPageData, getDocumentsPageData } from "@/lib/server/app-loaders";
import { ESListPageClient } from "@/components/es/ESListPageClient";

export default async function ESListPage() {
  const identity = await getHeadersIdentity(await headers());

  if (!identity) {
    return <ESListPageClient />;
  }

  const [documentsData, companiesData] = await Promise.all([
    getDocumentsPageData(identity, {
      type: "es",
      includeDeleted: false,
      includeContent: false,
    }),
    getCompaniesPageData(identity),
  ]);

  return (
    <ESListPageClient
      initialDocuments={documentsData.documents}
      initialCompanies={companiesData}
    />
  );
}
