"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ProductError]", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold">読み込みに失敗しました</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          一時的な接続の問題が発生しました。しばらくしてから再度お試しください。
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset}>再試行する</Button>
        <Button variant="outline" asChild>
          <a href="/">ホームに戻る</a>
        </Button>
      </div>
    </div>
  );
}
