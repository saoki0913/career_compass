import { CompaniesListContentSkeleton } from "@/components/skeletons/CompaniesListContentSkeleton";

export function CompaniesListSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <CompaniesListContentSkeleton />
      </div>
    </div>
  );
}
