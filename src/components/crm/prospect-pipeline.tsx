"use client";

import * as React from "react";
import {
  CheckCircle2Icon,
  SearchIcon,
} from "lucide-react";

import type { StudentDTO } from "@/actions/students";
import {
  LEAD_STAGE_LABELS,
  LEAD_STAGE_ORDER,
  LEAD_SOURCE_LABELS,
} from "@/lib/crm-constants";
import type { CrmMutationResult } from "@/lib/actions/crm";
import type { LeadStage } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STAGE_COLORS: Record<LeadStage, string> = {
  NEW_LEAD: "bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/20",
  CONTACTED: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20",
  ASSESSMENT_TEST: "bg-violet-50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/20",
  ENROLLED: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20",
  LOST: "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20",
};

const STAGE_HEADER_COLORS: Record<LeadStage, string> = {
  NEW_LEAD: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  CONTACTED: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  ASSESSMENT_TEST: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300",
  ENROLLED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  LOST: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
};

type ProspectWithCRM = StudentDTO & {
  leadStage: LeadStage | null;
  leadSource: string | null;
};

export function ProspectPipeline({
  prospects,
  onStageChange,
  onConvert,
}: {
  prospects: ProspectWithCRM[];
  onStageChange: (studentId: string, stage: LeadStage) => Promise<CrmMutationResult>;
  onConvert: (studentId: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [draggedId, setDraggedId] = React.useState<string | null>(null);

  const filtered = prospects.filter((p) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(term) ||
      p.lastName.toLowerCase().includes(term) ||
      p.phone.includes(term)
    );
  });

  const getByStage = (stage: LeadStage) =>
    filtered.filter((p) => p.leadStage === stage);

  const handleDragStart = (studentId: string) => {
    setDraggedId(studentId);
  };

  const handleDrop = async (stage: LeadStage) => {
    if (draggedId) {
      await onStageChange(draggedId, stage);
      setDraggedId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un prospect…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {LEAD_STAGE_ORDER.map((stage) => {
          const stageProspects = getByStage(stage);
          return (
            <div
              key={stage}
              className={cn(
                "flex min-w-[280px] flex-col rounded-lg border",
                STAGE_COLORS[stage]
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage)}
            >
              <div
                className={cn(
                  "flex items-center justify-between rounded-t-lg px-3 py-2",
                  STAGE_HEADER_COLORS[stage]
                )}
              >
                <span className="text-sm font-semibold">
                  {LEAD_STAGE_LABELS[stage]}
                </span>
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium dark:bg-black/20">
                  {stageProspects.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {stageProspects.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                    Aucun prospect
                  </div>
                ) : (
                  stageProspects.map((prospect) => (
                    <ProspectCard
                      key={prospect.id}
                      prospect={prospect}
                      isDragging={draggedId === prospect.id}
                      onDragStart={() => handleDragStart(prospect.id)}
                      onConvert={() => onConvert(prospect.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProspectCard({
  prospect,
  isDragging,
  onDragStart,
  onConvert,
}: {
  prospect: ProspectWithCRM;
  isDragging: boolean;
  onDragStart: () => void;
  onConvert: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        "cursor-grab rounded-md border bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-slate-900",
        isDragging && "opacity-50 ring-2 ring-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {prospect.firstName} {prospect.lastName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {prospect.phone}
          </p>
        </div>
        {prospect.leadSource && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {LEAD_SOURCE_LABELS[prospect.leadSource as keyof typeof LEAD_SOURCE_LABELS] ?? prospect.leadSource}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        {prospect.leadStage !== "ENROLLED" && prospect.leadStage !== "LOST" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={onConvert}
          >
            <CheckCircle2Icon className="mr-1 size-3" />
            Inscrire
          </Button>
        )}
      </div>
    </div>
  );
}
