"use client";

import { useMemo } from "react";
import { GakuchikaCard, type Gakuchika } from "./GakuchikaCard";

interface StatusGroupProps {
  gakuchikas: Gakuchika[];
  pinnedIds: Set<string>;
  onTogglePin?: (id: string) => void;
  onEditStart?: (id: string, title: string) => void;
  onDeleteStart?: (id: string) => void;
}

const STATUS_ORDER = ["completed", "in_progress", "not_started"] as const;

const STATUS_LABELS: Record<string, string> = {
  completed: "完了",
  in_progress: "深掘り中",
  not_started: "未開始",
};

function getStatusKey(status: "in_progress" | "completed" | null): string {
  if (status === null) return "not_started";
  return status;
}

export function StatusGroup({
  gakuchikas,
  pinnedIds,
  onTogglePin,
  onEditStart,
  onDeleteStart,
}: StatusGroupProps) {
  const groupedGakuchikas = useMemo(() => {
    const groups = new Map<string, Gakuchika[]>();

    for (const g of gakuchikas) {
      const key = getStatusKey(g.conversationStatus);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(g);
    }

    return STATUS_ORDER
      .filter((key) => groups.has(key))
      .map((key) => ({
        statusKey: key,
        label: STATUS_LABELS[key],
        gakuchikas: groups.get(key)!,
      }));
  }, [gakuchikas]);

  return (
    <div className="space-y-8">
      {groupedGakuchikas.map((group) => (
        <div key={group.statusKey}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-semibold text-foreground">
              {group.label}
            </h2>
            <span className="text-sm text-muted-foreground">
              ({group.gakuchikas.length})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
            {group.gakuchikas.map((gakuchika) => (
              <GakuchikaCard
                key={gakuchika.id}
                gakuchika={gakuchika}
                isPinned={pinnedIds.has(gakuchika.id)}
                onTogglePin={onTogglePin}
                onEditStart={onEditStart}
                onDeleteStart={onDeleteStart}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
