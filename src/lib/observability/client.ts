import * as Sentry from "@sentry/nextjs";

type ClientErrorBoundaryName = "product" | "global";

interface CaptureClientBoundaryErrorOptions {
  boundary: ClientErrorBoundaryName;
  digest?: string;
}

export function captureClientBoundaryError(
  error: unknown,
  options: CaptureClientBoundaryErrorOptions,
): void {
  const exception = error instanceof Error
    ? error
    : new Error("Unknown client boundary error");
  const extra: Record<string, unknown> = {};

  if (options.digest) {
    extra.digest = options.digest;
  }

  Sentry.captureException(exception, {
    tags: {
      boundary: options.boundary,
    },
    extra,
  });
}
