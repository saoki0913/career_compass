import { DashboardHeader } from "@/components/dashboard";
import { SettingsPageSkeleton } from "@/components/skeletons/SettingsPageSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main>
        <SettingsPageSkeleton />
      </main>
    </div>
  );
}
