"use client";

import { useParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { DashboardHeader } from "@/components/dashboard";
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
        <DashboardHeader />
        <main>
          <InterviewConversationSkeleton accent="面接の準備を進めています" />
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginRequiredForAi title="面接対策はログイン後に利用できます" />;
  }

  return (
    <OperationLockProvider>
      <NavigationGuard />
      <InterviewPageContent companyId={params.id} />
    </OperationLockProvider>
  );
}
