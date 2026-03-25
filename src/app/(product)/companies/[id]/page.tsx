import { headers } from "next/headers";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getCompanyDetailPageData } from "@/lib/server/app-loaders";
import CompanyDetailPageClient from "@/components/companies/CompanyDetailPageClient";

type CompaniesDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompaniesDetailPage({ params }: CompaniesDetailPageProps) {
  const { id } = await params;
  const identity = await getHeadersIdentity(await headers());
  const initialData = identity ? await getCompanyDetailPageData(identity, id) : undefined;

  return <CompanyDetailPageClient companyId={id} initialData={initialData ?? undefined} />;
}
