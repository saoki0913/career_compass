import { Suspense } from "react";
import type { RequestIdentity } from "@/bff/identity/request-identity";
import { getCurrentRequestIdentity } from "@/lib/server/request-identity-cache";
import { getCompaniesPageData } from "@/lib/server/app-loaders";
import { AnimatedSuspenseContent } from "@/components/ui/AnimatedSuspenseContent";
import { CompaniesPageClient } from "@/components/companies/CompaniesPageClient";
import { CompaniesListContentSkeleton } from "@/components/skeletons/CompaniesListContentSkeleton";

export default async function CompaniesPage() {
  const identity = await getCurrentRequestIdentity();

  if (!identity) {
    return <CompaniesPageClient />;
  }

  return (
    <Suspense fallback={<CompaniesListContentSkeleton />}>
      <AnimatedSuspenseContent>
        <CompaniesContentSection identity={identity} />
      </AnimatedSuspenseContent>
    </Suspense>
  );
}

async function CompaniesContentSection({
  identity,
}: {
  identity: RequestIdentity;
}) {
  const initialData = await getCompaniesPageData(identity);
  return <CompaniesPageClient initialData={initialData} />;
}
