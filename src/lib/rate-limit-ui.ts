import { toast } from "sonner";

export function handleRateLimitError(response: Response): boolean {
  if (response.status !== 429) return false;

  const retryAfter = response.headers.get("Retry-After");
  const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;

  toast.error("利用回数の上限に達しました", {
    description: `${seconds}秒後に再試行できます`,
    duration: Math.min(seconds * 1000, 10000),
  });

  return true;
}
