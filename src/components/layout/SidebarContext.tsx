"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface SidebarState {
  isOpen: boolean;
  isCollapsed: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  collapse: () => void;
  expand: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

const STORAGE_KEY = "sidebar-collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setIsCollapsed(true);
  }, []);

  const toggle = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsOpen((prev) => !prev);
    } else {
      setIsCollapsed((prev) => {
        const next = !prev;
        localStorage.setItem(STORAGE_KEY, String(next));
        return next;
      });
    }
  }, []);

  const collapse = useCallback(() => {
    setIsCollapsed(true);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const expand = useCallback(() => {
    setIsCollapsed(false);
    localStorage.setItem(STORAGE_KEY, "false");
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  return (
    <SidebarContext value={{ isOpen, isCollapsed, toggle, setOpen, collapse, expand }}>
      {children}
    </SidebarContext>
  );
}

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    return {
      isOpen: false,
      isCollapsed: false,
      toggle: () => {},
      setOpen: () => {},
      collapse: () => {},
      expand: () => {},
    };
  }
  return ctx;
}
