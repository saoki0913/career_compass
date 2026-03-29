"use client";

import { useMemo } from "react";
import { ESCard } from "./ESCard";
import type { Document } from "@/hooks/useDocuments";

interface CompanyGroupProps {
  documents: Document[];
  pinnedIds: Set<string>;
  onTogglePin?: (documentId: string) => void;
  onDeleteStart?: (documentId: string) => void;
  onToggleStatus?: (documentId: string, currentStatus: string) => void;
  statusUpdatingId?: string | null;
}

export function CompanyGroup({
  documents,
  pinnedIds,
  onTogglePin,
  onDeleteStart,
  onToggleStatus,
  statusUpdatingId,
}: CompanyGroupProps) {
  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, Document[]>();

    for (const doc of documents) {
      const companyName = doc.company?.name || "企業未設定";
      if (!groups.has(companyName)) {
        groups.set(companyName, []);
      }
      groups.get(companyName)!.push(doc);
    }

    // Sort: Named companies first (alphabetically), then "企業未設定" at the end
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "企業未設定") return 1;
      if (b === "企業未設定") return -1;
      return a.localeCompare(b, "ja");
    });

    return sortedKeys.map((companyName) => ({
      companyName,
      documents: groups.get(companyName)!,
    }));
  }, [documents]);

  return (
    <div className="space-y-8">
      {groupedDocuments.map((group) => (
        <div key={group.companyName}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-semibold text-foreground">
              {group.companyName}
            </h2>
            <span className="text-sm text-muted-foreground">
              ({group.documents.length})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
            {group.documents.map((doc) => (
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
        </div>
      ))}
    </div>
  );
}
