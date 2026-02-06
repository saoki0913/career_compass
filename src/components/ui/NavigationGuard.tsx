"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOperationLock } from "@/hooks/useOperationLock";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Intercepts internal link clicks while an operation is locked.
 * Shows a confirmation modal before allowing navigation away.
 */
export function NavigationGuard() {
  const router = useRouter();
  const { isLocked, activeOperationLabel } = useOperationLock();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Refs so the capture-phase handler always sees the latest values
  // without needing to re-register the listener.
  const isLockedRef = useRef(isLocked);
  const labelRef = useRef(activeOperationLabel);

  useEffect(() => {
    isLockedRef.current = isLocked;
    labelRef.current = activeOperationLabel;
  }, [isLocked, activeOperationLabel]);

  const handleStay = useCallback(() => {
    setPendingHref(null);
  }, []);

  const handleLeave = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) {
      router.push(href);
    }
  }, [pendingHref, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!isLockedRef.current) return;

      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      // Skip links that open in a new tab
      if (target.getAttribute("target") === "_blank") return;

      // Only intercept internal navigation (same origin or relative paths)
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
      } catch {
        // Relative path — internal
      }

      // Always prevent the click; show dialog instead
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    };

    // Capture phase to intercept before Next.js router handles the click
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  const isOpen = pendingHref !== null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleStay()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>ページを離れますか？</DialogTitle>
          <DialogDescription>
            現在「{activeOperationLabel || "処理"}」を実行中です。
            ページを離れると、進行中の処理が中断される可能性があります。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleStay}>
            このページにとどまる
          </Button>
          <Button variant="destructive" onClick={handleLeave}>
            ページを離れる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
