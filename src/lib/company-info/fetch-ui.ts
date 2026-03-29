export type ScheduleFetchResultStatus = "success" | "duplicates_only" | "no_deadlines" | "error";

export function shouldCloseCorporateFetchModalOnSuccess(result: {
  success: boolean;
  chunksStored?: number;
}) {
  return result.success;
}

export function shouldCloseScheduleFetchModalOnResult(
  resultStatus: ScheduleFetchResultStatus
) {
  return resultStatus !== "error";
}
