import { DashboardHeader } from "@/components/dashboard";
import { DeadlinesDashboardPageSkeleton } from "@/components/skeletons/DeadlinesDashboardSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main>
        <DeadlinesDashboardPageSkeleton />
      </main>
    </div>
  );
}
