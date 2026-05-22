import { Suspense } from "react";
import type { RequestIdentity } from "@/bff/identity/request-identity";
import { getCurrentRequestIdentity } from "@/lib/server/request-identity-cache";
import { getCompaniesPageData } from "@/lib/server/app-loaders";
import { AnimatedSuspenseContent } from "@/components/ui/AnimatedSuspenseContent";
import { CompaniesPageClient } from "@/components/companies/CompaniesPageClient";
import { CompaniesPageHeader } from "@/components/companies/CompaniesPageHeader";
import { CompaniesKanbanSkeleton } from "@/components/skeletons/CompaniesListContentSkeleton";

export default async function CompaniesPage() {
  const identity = await getCurrentRequestIdentity();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-[96rem] px-4 pb-7 pt-24 sm:px-6 sm:pb-9 sm:pt-24 lg:px-8 lg:py-9 xl:px-10">
        <CompaniesPageHeader />
        <Suspense fallback={<CompaniesKanbanSkeleton />}>
          <AnimatedSuspenseContent>
            <CompaniesContentSection identity={identity} />
          </AnimatedSuspenseContent>
        </Suspense>
      </main>
    </div>
  );
}

async function CompaniesContentSection({
  identity,
}: {
  identity: RequestIdentity | null;
}) {
  const initialData = identity ? await getCompaniesPageData(identity) : undefined;
  return <CompaniesPageClient initialData={initialData} showHeader={false} />;
}
