"use client";

import { useCallback, useSyncExternalStore } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dismissActiveSnackbar,
  getServerSnackbarActive,
  getSnackbarActive,
  subscribeSnackbar,
  type SnackbarPayload,
} from "@/lib/snackbar-store";

function SnackbarCard({ item, onDismiss }: { item: SnackbarPayload; onDismiss: () => void }) {
  const reduceMotion = useReducedMotion();
  const isError = item.tone === "error";
  const isSuccess = item.tone === "success";

  const Icon = isError ? XCircle : isSuccess ? CheckCircle2 : Info;

  return (
    <motion.div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      data-app-snackbar
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -14, scale: 0.98 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
      transition={
        reduceMotion
          ? { duration: 0.12 }
          : { type: "spring", stiffness: 420, damping: 32, mass: 0.85 }
      }
      className={cn(
        "pointer-events-auto flex w-[min(92vw,28rem)] gap-3 rounded-2xl border px-4 py-3.5 shadow-lg backdrop-blur-xl",
        isSuccess &&
          "border-emerald-300/90 bg-[linear-gradient(145deg,rgba(236,253,245,0.98),rgba(209,250,229,0.96))] text-emerald-950 shadow-emerald-900/12 ring-1 ring-emerald-500/10",
        isError &&
          "border-rose-300/90 bg-[linear-gradient(145deg,rgba(255,241,242,0.98),rgba(255,228,230,0.96))] text-rose-950 shadow-rose-900/12 ring-1 ring-rose-500/10",
        item.tone === "info" &&
          "border-slate-200/95 bg-[linear-gradient(145deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] text-slate-900 shadow-slate-900/10 ring-1 ring-slate-400/10",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isSuccess && "bg-emerald-500/15 text-emerald-700",
          isError && "bg-rose-500/15 text-rose-700",
          item.tone === "info" && "bg-slate-500/10 text-slate-600",
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[13px] font-semibold leading-5 tracking-[0.01em]">{item.title}</p>
        {item.description ? (
          <p
            className={cn(
              "mt-1 text-[12px] leading-5",
              isSuccess && "text-emerald-900/85",
              isError && "text-rose-900/85",
              item.tone === "info" && "text-slate-600",
            )}
          >
            {item.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className={cn(
          "shrink-0 rounded-lg p-1.5 opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          isSuccess && "text-emerald-800 focus-visible:ring-emerald-500",
          isError && "text-rose-800 focus-visible:ring-rose-500",
          item.tone === "info" && "text-slate-600 focus-visible:ring-slate-400",
        )}
        aria-label="通知を閉じる"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </motion.div>
  );
}

export function SnackbarHost() {
  const active = useSyncExternalStore(
    subscribeSnackbar,
    getSnackbarActive,
    getServerSnackbarActive,
  );

  const onDismiss = useCallback(() => {
    dismissActiveSnackbar();
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-center pt-[max(1rem,env(safe-area-inset-top))] print:hidden"
      data-app-snackbar-root
    >
      <AnimatePresence mode="wait">
        {active ? <SnackbarCard key={active.id} item={active} onDismiss={onDismiss} /> : null}
      </AnimatePresence>
    </div>
  );
}
