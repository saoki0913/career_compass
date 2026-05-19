"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useSession } from "@/lib/auth/client";
import { clearDeviceToken, hasDeviceToken } from "@/lib/auth/device-token";
import { shouldDeferOnboardingForPricingIntent } from "@/lib/billing/pricing-flow";
import { SnackbarHost } from "@/components/ui/snackbar-host";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";
import type { UserPlanResponse } from "@/lib/auth/plan-types";

interface GuestSession {
  id: string;
  expiresAt: string;
}

interface AuthContextType {
  // User session (Better Auth)
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
  isLoading: boolean;
  isReady: boolean;
  isAuthenticated: boolean;

  // Guest session
  guest: GuestSession | null;
  isGuest: boolean;

  // Plan info
  userPlan: UserPlanResponse | null;

  // Actions
  refreshPlan: () => Promise<UserPlanResponse | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCookie(CSRF_COOKIE_NAME);
  if (existing) return existing;

  await fetch("/api/csrf", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  }).catch(() => null);

  return readCookie(CSRF_COOKIE_NAME);
}

async function postJsonWithCsrf(url: string): Promise<Response> {
  const token = await ensureCsrfToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) {
    headers.set(CSRF_HEADER_NAME, token);
  }

  return fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlanResponse | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [rejectedUserId, setRejectedUserId] = useState<string | null>(null);
  const lastVisibilityRefreshRef = useRef(0);
  const migrationPendingRef = useRef(false);
  const userId = session?.user?.id ?? null;
  const isCurrentSessionRejected = Boolean(userId && rejectedUserId === userId);

  const initGuest = useCallback(async (options: { force?: boolean } = {}): Promise<GuestSession | null> => {
    if (userId && !options.force) return null;
    try {
      const response = await postJsonWithCsrf("/api/auth/guest");

      if (response.ok) {
        const data = await response.json();
        setGuest(data);
        return data;
      }
    } catch (error) {
      console.error("Error initializing guest:", error);
    }
    return null;
  }, [userId]);

  const migrateGuestData = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    try {
      const response = await postJsonWithCsrf("/api/guest/migrate");

      if (response.ok) {
        migrationPendingRef.current = false;
        clearDeviceToken();
        setGuest(null);
        return true;
      }
    } catch (error) {
      console.error("Error migrating guest data:", error);
    }
    return false;
  }, [userId]);

  const fetchUserPlan = useCallback(async (): Promise<UserPlanResponse | null> => {
    if (!userId || isCurrentSessionRejected) {
      setUserPlan(null);
      return null;
    }

    try {
      const response = await fetch("/api/auth/plan");
      if (response.ok) {
        const data = await response.json();
        setUserPlan(data);
        if (migrationPendingRef.current) {
          await migrateGuestData();
        }
        return data;
      }
      if (response.status === 401) {
        setRejectedUserId(userId);
        setUserPlan(null);
        await initGuest({ force: true });
      }
    } catch (error) {
      console.error("Error fetching user plan:", error);
    }
    return null;
  }, [initGuest, isCurrentSessionRejected, migrateGuestData, userId]);

  const refreshPlan = useCallback(async () => {
    return fetchUserPlan();
  }, [fetchUserPlan]);

  // Re-fetch plan when tab regains visibility (e.g. returning from Stripe Checkout)
  useEffect(() => {
    if (!userId || isCurrentSessionRejected) return;
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastVisibilityRefreshRef.current > 5000
      ) {
        lastVisibilityRefreshRef.current = Date.now();
        fetchUserPlan();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchUserPlan, isCurrentSessionRejected, userId]);

  // Initialize guest session on mount (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPending) return;

    let cancelled = false;

    const init = async () => {
      if (hasDeviceToken()) {
        clearDeviceToken();
      }

      // If user is authenticated, fetch plan and migrate guest if needed
      if (userId) {
        const plan = await fetchUserPlan();
        if (cancelled) return;

        if (plan) {
          await migrateGuestData();
        } else if (!isCurrentSessionRejected) {
          migrationPendingRef.current = true;
        }
        if (plan?.needsOnboarding && !plan?.onboardingCompleted) {
          const currentPath = window.location.pathname;
          const deferForPricingIntent = shouldDeferOnboardingForPricingIntent({
            pathname: currentPath,
            storage: window.sessionStorage,
          });
          if (currentPath !== "/onboarding" && !deferForPricingIntent) {
            window.location.href = "/onboarding";
          }
        }
      } else {
        // No user session, initialize guest
        setUserPlan(null);
        await initGuest();
      }
      if (!cancelled) {
        setIsInitialized(true);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [fetchUserPlan, initGuest, isCurrentSessionRejected, isPending, migrateGuestData, userId]);

  const isConfirmedAuthenticated = Boolean(session?.user && !isCurrentSessionRejected);

  const value: AuthContextType = {
    user: isConfirmedAuthenticated && session?.user
      ? {
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email,
          image: session.user.image ?? null,
        }
      : null,
    isLoading: isPending || !isInitialized,
    isReady: !isPending && isInitialized,
    isAuthenticated: isConfirmedAuthenticated,
    guest,
    isGuest: (!session?.user || isCurrentSessionRejected) && !!guest,
    userPlan,
    refreshPlan,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SnackbarHost />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
