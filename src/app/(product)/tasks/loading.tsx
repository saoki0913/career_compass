import { DashboardHeader } from "@/components/dashboard";
import { TasksPageSkeleton } from "@/components/skeletons/TasksPageSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main>
        <TasksPageSkeleton />
      </main>
    </div>
  );
}
