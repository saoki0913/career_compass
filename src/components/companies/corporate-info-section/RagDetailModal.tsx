"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XIcon } from "./icons";
import type { RagStatus } from "./workflow-config";

interface RagDetailModalProps {
  ragStatus: RagStatus;
  closeRagModal: () => void;
}

export function RagDetailModal({ ragStatus, closeRagModal }: RagDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="border-b pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">RAG詳細</CardTitle>
            <button
              type="button"
              onClick={closeRagModal}
              className="rounded-full p-1 transition-colors hover:bg-muted"
            >
              <XIcon />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 py-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">新卒採用HP</span>
              <span className="font-medium">{ragStatus.newGradRecruitmentChunks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">中途採用HP</span>
              <span className="font-medium">{ragStatus.midcareerRecruitmentChunks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">企業HP</span>
              <span className="font-medium">{ragStatus.corporateSiteChunks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">IR資料</span>
              <span className="font-medium">{ragStatus.irMaterialsChunks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">社長メッセージ</span>
              <span className="font-medium">{ragStatus.ceoMessageChunks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">社員インタビュー</span>
              <span className="font-medium">{ragStatus.employeeInterviewsChunks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">プレスリリース</span>
              <span className="font-medium">{ragStatus.pressReleaseChunks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">CSR/サステナ</span>
              <span className="font-medium">{ragStatus.csrSustainabilityChunks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">中期経営計画</span>
              <span className="font-medium">{ragStatus.midtermPlanChunks}</span>
            </div>
          </div>
          {ragStatus.lastUpdated && (
            <p className="text-right text-xs text-muted-foreground">
              更新:{" "}
              {new Date(ragStatus.lastUpdated).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={closeRagModal}>閉じる</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
