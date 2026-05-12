"use client";

import { useCallback, useState } from "react";
import { Download, Printer } from "lucide-react";

import { notifyError } from "@/lib/notifications";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InterviewSheetData } from "@/lib/interview/sheet-builder";

import { SheetViewer } from "./SheetViewer";

export function SheetViewerDialog({
  open,
  onOpenChange,
  data,
  markdownFallback,
  satisfactionScore,
  onSaveSatisfaction,
  isSavingSatisfaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: InterviewSheetData | null;
  markdownFallback?: string | null;
  satisfactionScore?: number | null;
  onSaveSatisfaction?: (score: number) => void;
  isSavingSatisfaction?: boolean;
}) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    setIsGeneratingPdf(true);
    try {
      const { generateSheetPDF } = await import("@/lib/interview/sheet-pdf");
      const blob = await generateSheetPDF("interview-sheet");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `interview-sheet-${data?.companyName ?? "unknown"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notifyError({ title: "PDF生成に失敗しました", description: "印刷機能をお試しください。" });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [data?.companyName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>まとめシート</DialogTitle>
              <DialogDescription>
                面接対策の結果を確認できます。
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={isGeneratingPdf || !data}
                onClick={handleDownloadPdf}
              >
                <Download className="h-4 w-4" />
                {isGeneratingPdf ? "生成中..." : "PDFをダウンロード"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                印刷
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <SheetViewer data={data} markdownFallback={markdownFallback} />

          {onSaveSatisfaction ? (
            <div className="mt-5 rounded-xl border border-border/60 bg-background px-4 py-3">
              <p className="text-sm font-medium">今回の面接の満足度</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">不満</span>
                {[1, 2, 3, 4, 5].map((score) => (
                  <Button
                    key={score}
                    type="button"
                    variant={satisfactionScore === score ? "default" : "outline"}
                    size="sm"
                    disabled={isSavingSatisfaction}
                    onClick={() => onSaveSatisfaction(score)}
                  >
                    {score}
                  </Button>
                ))}
                <span className="text-xs text-muted-foreground">満足</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {satisfactionScore
                  ? `保存済み: ${satisfactionScore} / 5`
                  : "1〜5 で回答すると改善指標に反映されます。"}
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
