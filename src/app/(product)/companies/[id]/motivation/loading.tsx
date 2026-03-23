import { DashboardHeader } from "@/components/dashboard";
import { ConversationPageSkeleton } from "@/components/skeletons/ConversationPageSkeleton";

export default function Loading() {
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <DashboardHeader />
      <main className="flex-1 overflow-hidden">
        <ConversationPageSkeleton accent="AIが企業理解の材料を整えています" />
      </main>
    </div>
  );
}
