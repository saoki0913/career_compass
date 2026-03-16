"use client";

import { ESCard } from "./ESCard";
import type { Document } from "@/hooks/useDocuments";

interface ESGridProps {
  documents: Document[];
  pinnedIds: Set<string>;
  onTogglePin?: (documentId: string) => void;
  onToggleStatus?: (documentId: string, currentStatus: string) => void;
  statusUpdatingId?: string | null;
}

export function ESGrid({
  documents,
  pinnedIds,
  onTogglePin,
  onToggleStatus,
  statusUpdatingId,
}: ESGridProps) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
      {documents.map((doc) => (
        <ESCard
          key={doc.id}
          document={doc}
          isPinned={pinnedIds.has(doc.id)}
          onTogglePin={onTogglePin}
          onToggleStatus={onToggleStatus}
          statusUpdatingId={statusUpdatingId}
        />
      ))}
    </div>
  );
}
