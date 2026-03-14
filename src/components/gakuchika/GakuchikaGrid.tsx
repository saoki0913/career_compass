"use client";

import { GakuchikaCard, type Gakuchika } from "./GakuchikaCard";

interface GakuchikaGridProps {
  gakuchikas: Gakuchika[];
  pinnedIds: Set<string>;
  onTogglePin?: (id: string) => void;
  onEditStart?: (id: string, title: string) => void;
  onDeleteStart?: (id: string) => void;
}

export function GakuchikaGrid({
  gakuchikas,
  pinnedIds,
  onTogglePin,
  onEditStart,
  onDeleteStart,
}: GakuchikaGridProps) {
  if (gakuchikas.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
      {gakuchikas.map((gakuchika) => (
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
  );
}
