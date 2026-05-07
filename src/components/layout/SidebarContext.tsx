"use client";

import {
  createContext,
  useContext,
  useState,
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

function persistCollapsed(value: boolean): void {
  const v = String(value);
  document.cookie = `sidebar-collapsed=${v}; path=/; max-age=31536000; SameSite=Lax`;
  localStorage.setItem(STORAGE_KEY, v);
}

interface SidebarProviderProps {
  children: ReactNode;
  initialCollapsed?: boolean;
}

export function SidebarProvider({ children, initialCollapsed }: SidebarProviderProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed ?? false);
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsOpen((prev) => !prev);
    } else {
      setIsCollapsed((prev) => {
        const next = !prev;
        persistCollapsed(next);
        return next;
      });
    }
  }, []);

  const collapse = useCallback(() => {
    setIsCollapsed(true);
    persistCollapsed(true);
  }, []);

  const expand = useCallback(() => {
    setIsCollapsed(false);
    persistCollapsed(false);
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
