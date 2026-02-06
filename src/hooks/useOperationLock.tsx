"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";

interface OperationLockContextType {
  /** Whether any long-running operation is in progress on this page */
  isLocked: boolean;
  /** Human-readable label of the active operation */
  activeOperationLabel: string | null;
  /** Acquire the lock. Returns true if acquired, false if already locked. */
  acquireLock: (label: string) => boolean;
  /** Release the lock. */
  releaseLock: () => void;
}

const OperationLockContext = createContext<OperationLockContextType | null>(null);

const FALLBACK: OperationLockContextType = {
  isLocked: false,
  activeOperationLabel: null,
  acquireLock: () => true,
  releaseLock: () => {},
};

export function OperationLockProvider({ children }: { children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [activeOperationLabel, setActiveOperationLabel] = useState<string | null>(null);

  const acquireLock = useCallback((label: string): boolean => {
    let acquired = false;
    setIsLocked((prev) => {
      if (prev) return prev;
      acquired = true;
      return true;
    });
    // React 19 batches setState, but functional updates execute sequentially.
    // `acquired` is set synchronously inside the updater.
    if (acquired) {
      setActiveOperationLabel(label);
    }
    return acquired;
  }, []);

  const releaseLock = useCallback(() => {
    setIsLocked(false);
    setActiveOperationLabel(null);
  }, []);

  // Safety net: auto-release lock after 120 seconds to prevent stuck state
  useEffect(() => {
    if (!isLocked) return;
    const timeout = setTimeout(() => {
      setIsLocked(false);
      setActiveOperationLabel(null);
    }, 120_000);
    return () => clearTimeout(timeout);
  }, [isLocked]);

  // Warn on tab close / reload while locked
  useEffect(() => {
    if (!isLocked) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isLocked]);

  const value = useMemo(
    () => ({ isLocked, activeOperationLabel, acquireLock, releaseLock }),
    [isLocked, activeOperationLabel, acquireLock, releaseLock],
  );

  return (
    <OperationLockContext.Provider value={value}>
      {children}
    </OperationLockContext.Provider>
  );
}

/**
 * Page-level operation lock hook.
 * Returns a no-op fallback when used outside an OperationLockProvider,
 * allowing components to be reused on pages without the provider.
 */
export function useOperationLock(): OperationLockContextType {
  const context = useContext(OperationLockContext);
  return context ?? FALLBACK;
}
