import { NotificationsPageSkeleton } from "@/components/skeletons/NotificationsPageSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <NotificationsPageSkeleton />
    </div>
  );
}
