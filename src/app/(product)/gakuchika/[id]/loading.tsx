import { DashboardHeader } from "@/components/dashboard";
import { ConversationPageSkeleton } from "@/components/skeletons/ConversationPageSkeleton";

export default function Loading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <DashboardHeader />
      <main className="flex-1 overflow-hidden">
        <ConversationPageSkeleton accent="ガクチカ作成の文脈を整えています" />
      </main>
    </div>
  );
}
