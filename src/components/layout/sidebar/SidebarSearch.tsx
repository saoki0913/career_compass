"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { SearchBar } from "@/components/search";

interface SidebarSearchProps {
  collapsed: boolean;
}

function SearchIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={11} cy={11} r={8} />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function SidebarSearch({ collapsed }: SidebarSearchProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleClick() {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  }

  if (collapsed) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={handleClick}
          className="group relative flex h-10 w-10 items-center justify-center mx-auto rounded-lg transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring text-muted-foreground"
          aria-label="検索 (⌘K)"
        >
          <SearchIcon />
          <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            検索 (⌘K)
          </span>
        </button>
        <div className="sr-only">
          <SearchBar />
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        "group flex h-10 w-full items-center gap-3 rounded-lg px-3 transition-colors hover:bg-sidebar-accent/60 cursor-pointer",
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      aria-label="検索 (⌘K)"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        <SearchIcon />
      </span>
      <span className="flex-1 truncate text-sm font-medium text-sidebar-foreground">
        検索
      </span>
      <span className="text-xs text-muted-foreground/70 font-mono">⌘K</span>
      <div className="sr-only">
        <SearchBar />
      </div>
    </div>
  );
}
