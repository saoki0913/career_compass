"use client";

import { useParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { InterviewPageContent } from "@/components/interview/InterviewPageContent";
import { InterviewConversationSkeleton } from "@/components/skeletons/InterviewConversationSkeleton";
import { OperationLockProvider } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";

export default function CompanyInterviewPage() {
  const params = useParams();
  const { isReady, isAuthenticated } = useAuth();

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background">
        <main>
          <InterviewConversationSkeleton accent="面接の準備を進めています" />
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
          <LoginRequiredForAi
            title="AI模擬面接で面接対策"
            description="企業別のAI面接官が質問し、回答への7軸フィードバックで本番に備えられます。"
            fallbackAction={{ label: "企業一覧を見る", href: "/companies" }}
          />
        </main>
      </div>
    );
  }

  return (
    <OperationLockProvider>
      <NavigationGuard />
      <InterviewPageContent companyId={params.id} />
    </OperationLockProvider>
  );
}
