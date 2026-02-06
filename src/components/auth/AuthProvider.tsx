"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useSession } from "@/lib/auth/client";
import { getDeviceToken, clearDeviceToken, hasDeviceToken } from "@/lib/auth/device-token";

interface GuestSession {
  id: string;
  deviceToken: string;
  expiresAt: string;
}

interface UserPlan {
  plan: "free" | "standard" | "pro" | null;
  planSelectedAt: string | null;
  needsPlanSelection: boolean;
  onboardingCompleted: boolean;
  needsOnboarding: boolean;
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
  isAuthenticated: boolean;

  // Guest session
  guest: GuestSession | null;
  isGuest: boolean;

  // Plan info
  userPlan: UserPlan | null;

  // Actions
  initGuest: () => Promise<void>;
  migrateGuestData: () => Promise<void>;
  refreshPlan: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const initGuest = useCallback(async () => {
    try {
      const deviceToken = getDeviceToken();
      const response = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceToken }),
      });

      if (response.ok) {
        const data = await response.json();
        setGuest(data);
      }
    } catch (error) {
      console.error("Error initializing guest:", error);
    }
  }, []);

  const migrateGuestData = useCallback(async () => {
    try {
      const deviceToken = getDeviceToken();
      const response = await fetch("/api/guest/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceToken }),
      });

      if (response.ok) {
        clearDeviceToken();
        setGuest(null);
      }
    } catch (error) {
      console.error("Error migrating guest data:", error);
    }
  }, []);

  const fetchUserPlan = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/plan");
      if (response.ok) {
        const data = await response.json();
        setUserPlan(data);
      }
    } catch (error) {
      console.error("Error fetching user plan:", error);
    }
  }, []);

  const refreshPlan = useCallback(async () => {
    await fetchUserPlan();
  }, [fetchUserPlan]);

  // Initialize guest session on mount (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const init = async () => {
      // If user is authenticated, fetch plan and migrate guest if needed
      if (session?.user) {
        await fetchUserPlan();

        // Check for existing device token to migrate
        if (hasDeviceToken()) {
          await migrateGuestData();
        }
      } else if (!isPending) {
        // No user session, initialize guest
        await initGuest();
      }
      setIsInitialized(true);
    };

    init();
  }, [session, isPending, fetchUserPlan, migrateGuestData, initGuest]);

  const value: AuthContextType = {
    user: session?.user
      ? {
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email,
          image: session.user.image ?? null,
        }
      : null,
    isLoading: isPending || !isInitialized,
    isAuthenticated: !!session?.user,
    guest,
    isGuest: !session?.user && !!guest,
    userPlan,
    initGuest,
    migrateGuestData,
    refreshPlan,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
