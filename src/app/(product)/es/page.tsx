import { Suspense } from "react";
import type { RequestIdentity } from "@/bff/identity/request-identity";
import { getCurrentRequestIdentity } from "@/lib/server/request-identity-cache";
import { getCompaniesPageData, getDocumentsPageData } from "@/lib/server/app-loaders";
import { AnimatedSuspenseContent } from "@/components/ui/AnimatedSuspenseContent";
import { ESListPageClient } from "@/components/es/ESListPageClient";
import { ESListSkeleton } from "@/components/skeletons/ESListSkeleton";

export default async function ESListPage() {
  const identity = await getCurrentRequestIdentity();

  if (!identity) {
    return <ESListPageClient />;
  }

  return (
    <Suspense fallback={<ESListSkeleton />}>
      <AnimatedSuspenseContent>
        <ESContentSection identity={identity} />
      </AnimatedSuspenseContent>
    </Suspense>
  );
}

async function ESContentSection({
  identity,
}: {
  identity: RequestIdentity;
}) {
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
