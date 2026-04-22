"use client";

import { useParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { OperationLockProvider } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { MotivationConversationContent } from "@/components/motivation/MotivationConversationContent";

export default function MotivationConversationPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { isReady, isAuthenticated } = useAuth();

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10 max-lg:max-w-full max-lg:px-3">
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10 max-lg:max-w-full max-lg:px-3">
          <LoginRequiredForAi title="志望動機のAI支援はログイン後にご利用いただけます" />
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
