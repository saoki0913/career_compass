import { GakuchikaDeepDiveSkeleton } from "@/components/skeletons/GakuchikaDeepDiveSkeleton";

export default function Loading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <GakuchikaDeepDiveSkeleton accent="ガクチカ作成の文脈を整えています" />
    </div>
  );
}
