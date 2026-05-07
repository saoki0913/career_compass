import { TasksPageSkeleton } from "@/components/skeletons/TasksPageSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <main>
        <TasksPageSkeleton />
      </main>
    </div>
  );
}
