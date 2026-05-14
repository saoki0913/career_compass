import { Suspense } from "react";
import { headers } from "next/headers";
import { getHeadersIdentity } from "@/bff/identity/request-identity";
import type { RequestIdentity } from "@/bff/identity/request-identity";
import { getCompanyDetailPageData } from "@/lib/server/app-loaders";
import { safeLoad } from "@/lib/server/safe-loader";
import CompanyDetailPageClient from "@/components/companies/CompanyDetailPageClient";
import { CompanyDetailSkeleton } from "@/components/skeletons/CompanyDetailSkeleton";

type CompaniesDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompaniesDetailPage({ params }: CompaniesDetailPageProps) {
  const { id } = await params;
  const identity = await getHeadersIdentity(await headers());

  return (
    <Suspense fallback={<CompanyDetailSkeleton />}>
      <CompanyDetailContent companyId={id} identity={identity} />
    </Suspense>
  );
}

async function CompanyDetailContent({
  companyId,
  identity,
}: {
  companyId: string;
  identity: RequestIdentity | null;
}) {
  const result = identity
    ? await safeLoad("companyDetail", () => getCompanyDetailPageData(identity, companyId))
    : null;

  return <CompanyDetailPageClient companyId={companyId} initialData={result?.data ?? undefined} />;
}
