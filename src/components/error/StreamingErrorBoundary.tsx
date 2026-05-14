"use client";

import { Component, type ErrorInfo, type ReactNode, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureClientBoundaryError } from "@/lib/observability/client";

type BoundaryName = "product" | "global";

type StreamingErrorBoundaryProps = {
  children: ReactNode;
  boundary?: BoundaryName;
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
};

type StreamingErrorBoundaryInnerProps = StreamingErrorBoundaryProps & {
  onRetry: () => void;
};

type StreamingErrorBoundaryInnerState = {
  error: Error | null;
};

function getDigest(error: Error): string | undefined {
  return typeof (error as Error & { digest?: unknown }).digest === "string"
    ? (error as Error & { digest: string }).digest
    : undefined;
}

class StreamingErrorBoundaryInner extends Component<
  StreamingErrorBoundaryInnerProps,
  StreamingErrorBoundaryInnerState
> {
  state: StreamingErrorBoundaryInnerState = { error: null };

  static getDerivedStateFromError(error: Error): StreamingErrorBoundaryInnerState {
    return { error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    captureClientBoundaryError(error, {
      boundary: this.props.boundary ?? "product",
      digest: getDigest(error),
    });
  }

  render() {
    const { children, fallback, onRetry } = this.props;
    const { error } = this.state;

    if (!error) {
      return children;
    }

    if (typeof fallback === "function") {
      return fallback(error, onRetry);
    }

    if (fallback) {
      return fallback;
    }

    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-center">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-foreground">この領域を読み込めませんでした</p>
        <p className="mt-1 text-xs text-muted-foreground">再読み込みして、もう一度取得します。</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span className="ml-1.5">再試行</span>
        </Button>
      </div>
    );
  }
}

export function StreamingErrorBoundary({
  children,
  boundary = "product",
  fallback,
}: StreamingErrorBoundaryProps) {
  const router = useRouter();
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setRetryCount((current) => current + 1);
    router.refresh();
  }, [router]);

  return (
    <StreamingErrorBoundaryInner
      key={retryCount}
      boundary={boundary}
      fallback={fallback}
      onRetry={handleRetry}
    >
      {children}
    </StreamingErrorBoundaryInner>
  );
}

