"use client";

import { useCallback } from "react";

import { useOperationLock } from "@/hooks/useOperationLock";
import { parseApiErrorResponse, type ApiErrorFallback } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";

export type LockedOperationErrorMeta = ApiErrorFallback & {
  logContext: string;
};

export type LockedOperation<TData> = {
  label: string;
  execute: () => Promise<Response>;
  errorMeta: LockedOperationErrorMeta;
  parse?: (response: Response) => Promise<TData>;
  onStart?: () => void;
  onSuccess?: (data: TData) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onFinally?: () => void;
};

export type LockedOperationResult = {
  run: <TData>(operation: LockedOperation<TData>) => Promise<TData | null>;
};

async function parseResponseJson<TData>(response: Response): Promise<TData> {
  return response.json() as Promise<TData>;
}

export function useLockedOperation(): LockedOperationResult {
  const { acquireLock, releaseLock } = useOperationLock();

  const run = useCallback(
    async <TData,>(operation: LockedOperation<TData>): Promise<TData | null> => {
      if (!acquireLock(operation.label)) return null;

      try {
        operation.onStart?.();
        const response = await operation.execute();

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            operation.errorMeta,
            operation.errorMeta.logContext,
          );
        }

        const data = await (operation.parse ?? parseResponseJson<TData>)(response);
        await operation.onSuccess?.(data);
        return data;
      } catch (error) {
        try {
          await operation.onError?.(error);
        } finally {
          reportUserFacingError(
            error,
            operation.errorMeta,
            operation.errorMeta.logContext,
          );
        }
        return null;
      } finally {
        operation.onFinally?.();
        releaseLock();
      }
    },
    [acquireLock, releaseLock],
  );

  return { run };
}
