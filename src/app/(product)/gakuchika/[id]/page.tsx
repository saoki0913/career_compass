"use client";

import { useParams } from "next/navigation";
import { OperationLockProvider } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { GakuchikaConversationContent } from "@/features/gakuchika";

export default function GakuchikaConversationPage() {
  const params = useParams();
  const gakuchikaId = params.id as string;
  const { isReady, isAuthenticated } = useAuth();

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10 max-lg:max-w-full max-lg:px-3">
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10 max-lg:max-w-full max-lg:px-3">
          <LoginRequiredForAi
            title="AIがガクチカを深掘りします"
            description="会話形式の質問であなたの経験を整理し、ESに使えるガクチカを作成できます。"
            fallbackAction={{ label: "ガクチカ一覧へ", href: "/gakuchika" }}
          />
        </main>
      </div>
    );
  }

  return (
    <OperationLockProvider>
      <NavigationGuard />
      <GakuchikaConversationContent gakuchikaId={gakuchikaId} />
    </OperationLockProvider>
  );
}
