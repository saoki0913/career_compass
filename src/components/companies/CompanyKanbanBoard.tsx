"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { CompanyKanbanCard } from "@/components/companies/CompanyKanbanCard";
import { CompanyKanbanColumn } from "@/components/companies/CompanyKanbanColumn";
import {
  COMPANY_SELECTION_PHASE_COLUMNS,
  getSelectionPhaseForStatus,
  type SelectionPhaseKey,
} from "@/lib/constants/status";
import type { Company } from "@/hooks/useCompanies";

interface CompanyKanbanBoardProps {
  companies: Company[];
  onMoveToPhase: (companyId: string, phaseKey: SelectionPhaseKey) => void;
  onTogglePin?: (companyId: string, isPinned: boolean) => void;
  onDeleteStart?: (companyId: string) => void;
}

export function CompanyKanbanBoard({
  companies,
  onMoveToPhase,
  onTogglePin,
  onDeleteStart,
}: CompanyKanbanBoardProps) {
  const [announcement, setAnnouncement] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const companiesByPhase = useMemo(
    () =>
      COMPANY_SELECTION_PHASE_COLUMNS.map((phase) => ({
        phase,
        companies: companies.filter((company) => getSelectionPhaseForStatus(company.status).key === phase.key),
      })),
    [companies]
  );

  const activeCompany = useMemo(
    () => (activeId ? companies.find((c) => c.id === activeId) ?? null : null),
    [activeId, companies]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const companyId = String(event.active.id);
      const targetPhase = COMPANY_SELECTION_PHASE_COLUMNS.find((phase) => phase.key === event.over?.id);
      const company = companies.find((item) => item.id === companyId);
      if (!company || !targetPhase) return;

      const currentPhase = getSelectionPhaseForStatus(company.status);
      if (currentPhase.key === targetPhase.key) return;

      onMoveToPhase(company.id, targetPhase.key);
      setAnnouncement(`${company.name}を${targetPhase.label}へ移動しました`);
    },
    [companies, onMoveToPhase]
  );

  return (
    <div className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="pb-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
            {companiesByPhase.map(({ phase, companies: phaseCompanies }) => (
              <CompanyKanbanColumn
                key={phase.key}
                phase={phase}
                companies={phaseCompanies}
                onMoveToPhase={onMoveToPhase}
                onTogglePin={onTogglePin}
                onDeleteStart={onDeleteStart}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCompany ? (
            <CompanyKanbanCard company={activeCompany} onMoveToPhase={onMoveToPhase} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
