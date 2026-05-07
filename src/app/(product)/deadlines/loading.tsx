import { DeadlinesDashboardPageSkeleton } from "@/components/skeletons/DeadlinesDashboardSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <main>
        <DeadlinesDashboardPageSkeleton />
      </main>
    </div>
  );
}
