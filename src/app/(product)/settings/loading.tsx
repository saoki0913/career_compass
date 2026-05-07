import { SettingsPageSkeleton } from "@/components/skeletons/SettingsPageSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <main>
        <SettingsPageSkeleton />
      </main>
    </div>
  );
}
