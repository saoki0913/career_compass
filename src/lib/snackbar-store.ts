/**
 * Headless snackbar queue for app-wide notifications (no Sonner).
 * SnackbarHost (client) subscribes and renders the active item.
 */

export type SnackbarTone = "success" | "error" | "info";

export type SnackbarPayload = {
  id: string;
  tone: SnackbarTone;
  title: string;
  description?: string;
  duration: number;
};

const listeners = new Set<() => void>();

/** SSR 用: useSyncExternalStore の getServerSnapshot は参照が安定している必要がある */
const SERVER_SNACKBAR_ACTIVE: SnackbarPayload | null = null;

const queue: SnackbarPayload[] = [];
let active: SnackbarPayload | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function pump() {
  if (active !== null) return;
  const next = queue.shift();
  if (!next) {
    emit();
    return;
  }
  active = next;
  emit();
  clearHideTimer();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    active = null;
    emit();
    pump();
  }, next.duration);
}

export function enqueueSnackbar(
  item: Omit<SnackbarPayload, "id"> & { id?: string },
): void {
  const id = item.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  queue.push({
    id,
    tone: item.tone,
    title: item.title,
    description: item.description,
    duration: item.duration,
  });
  pump();
}

export function dismissActiveSnackbar(): void {
  clearHideTimer();
  active = null;
  emit();
  pump();
}

export function subscribeSnackbar(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

/** クライアント用スナップショット: 同一ストア状態では同じ参照を返す（新オブジェクトを毎回作らない） */
export function getSnackbarActive(): SnackbarPayload | null {
  return active;
}

export function getServerSnackbarActive(): SnackbarPayload | null {
  return SERVER_SNACKBAR_ACTIVE;
}
