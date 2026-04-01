import { DashboardHeader } from "@/components/dashboard";
import { ConversationPageSkeleton } from "@/components/skeletons/ConversationPageSkeleton";

export default function Loading() {
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <DashboardHeader />
      <main className="flex-1 overflow-hidden">
        <ConversationPageSkeleton accent="面接の準備を進めています" />
      </main>
    </div>
  );
}
