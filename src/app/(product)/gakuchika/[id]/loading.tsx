import { DashboardHeader } from "@/components/dashboard";
import { GakuchikaDeepDiveSkeleton } from "@/components/skeletons/GakuchikaDeepDiveSkeleton";

export default function Loading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <DashboardHeader />
      <GakuchikaDeepDiveSkeleton accent="深掘り会話の文脈を整えています" />
    </div>
  );
}
