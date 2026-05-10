"use client";

import { useEffect } from "react";
import { captureClientBoundaryError } from "@/lib/observability/client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureClientBoundaryError(error, {
      boundary: "global",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">読み込みに失敗しました</h2>
            <p className="text-muted-foreground max-w-md text-sm">
              一時的な接続の問題が発生しました。しばらくしてから再度お試しください。
            </p>
          </div>
          <button
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-4 py-2 text-sm font-medium"
            type="button"
            onClick={reset}
          >
            再試行する
          </button>
        </main>
      </body>
    </html>
  );
}
