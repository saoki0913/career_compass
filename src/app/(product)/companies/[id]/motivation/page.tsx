"use client";

import { useParams } from "next/navigation";
import { OperationLockProvider } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { MotivationConversationContent } from "@/features/motivation";

export default function MotivationConversationPage() {
  const params = useParams();
  const companyId = params.id as string;
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
            title="AIが志望動機の下書きを作成します"
            description="登録した企業の情報を元に、説得力のある志望動機を会話形式で作成できます。"
            fallbackAction={{ label: "企業一覧を見る", href: "/companies" }}
          />
        </main>
      </div>
    );
  }

  return (
    <OperationLockProvider>
      <NavigationGuard />
      <MotivationConversationContent companyId={companyId} />
    </OperationLockProvider>
  );
}
