import { DashboardHeader } from "@/components/dashboard";
import { ProfilePageSkeleton } from "@/components/skeletons/ProfilePageSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main>
        <ProfilePageSkeleton />
      </main>
    </div>
  );
}
