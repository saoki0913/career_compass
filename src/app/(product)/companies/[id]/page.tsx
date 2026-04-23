import { headers } from "next/headers";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getCompanyDetailPageData } from "@/lib/server/app-loaders";
import { safeLoad } from "@/lib/server/safe-loader";
import CompanyDetailPageClient from "@/components/companies/CompanyDetailPageClient";

type CompaniesDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompaniesDetailPage({ params }: CompaniesDetailPageProps) {
  const { id } = await params;
  const identity = await getHeadersIdentity(await headers());
  const result = identity
    ? await safeLoad("companyDetail", () => getCompanyDetailPageData(identity, id))
    : null;

  return <CompanyDetailPageClient companyId={id} initialData={result?.data ?? undefined} />;
}
