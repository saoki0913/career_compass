"use client";

import { ESCard } from "./ESCard";
import { ES_LIST_GRID_CLASS } from "./es-list-layout";
import type { Document } from "@/hooks/useDocuments";

interface ESGridProps {
  documents: Document[];
  pinnedIds: Set<string>;
  onTogglePin?: (documentId: string) => void;
  onDeleteStart?: (documentId: string) => void;
  onToggleStatus?: (documentId: string, currentStatus: string) => void;
  statusUpdatingId?: string | null;
}

export function ESGrid({
  documents,
  pinnedIds,
  onTogglePin,
  onDeleteStart,
  onToggleStatus,
  statusUpdatingId,
}: ESGridProps) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <div className={ES_LIST_GRID_CLASS}>
      {documents.map((doc) => (
        <ESCard
          key={doc.id}
          document={doc}
          isPinned={pinnedIds.has(doc.id)}
          onTogglePin={onTogglePin}
          onDeleteStart={onDeleteStart}
          onToggleStatus={onToggleStatus}
          statusUpdatingId={statusUpdatingId}
        />
      ))}
    </div>
  );
}
