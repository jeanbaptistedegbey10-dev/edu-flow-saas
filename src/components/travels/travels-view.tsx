"use client";

import * as React from "react";
import {
  BadgeCheckIcon,
  GraduationCapIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  MapPinIcon,
  PlaneTakeoffIcon,
  SearchIcon,
  SendIcon,
  StampIcon,
} from "lucide-react";

import type { TravelStatus } from "@prisma/client";

import {
  updateTravelStatusAction,
  type StudentOptionDTO,
  type TravelProcedureDTO,
  type UpdateTravelStatusResult,
} from "@/actions/travels";
import { deleteTravelProcedureAction } from "@/actions/travels";
import { AddTravelDialog } from "@/components/travels/add-travel-dialog";
import { EditTravelDialog } from "@/components/travels/edit-travel-dialog";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TRAVEL_STATUS_BADGE_CLASSES,
  TRAVEL_STATUS_LABELS,
  TRAVEL_STATUS_ORDER,
} from "@/lib/travel-status";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

type ViewMode = "kanban" | "list";
type StatusFilter = "ALL" | TravelStatus;

/** Onglets de filtrage par statut (avec entrée « Tous »). */
const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Tous" },
  ...TRAVEL_STATUS_ORDER.map((status) => ({
    value: status as StatusFilter,
    label: TRAVEL_STATUS_LABELS[status],
  })),
];

// --------------------------------------
// Sous-composants internes
// --------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}

/**
 * Select compact stylisé en badge coloré permettant de changer
 * le statut d'un dossier via `updateTravelStatusAction`.
 */
function TravelStatusSelect({
  procedureId,
  status,
  onResult,
}: {
  procedureId: string;
  status: TravelStatus;
  onResult: (result: UpdateTravelStatusResult) => void;
}) {
  const [isPending, startTransition] = React.useTransition();

  return (
    <Select
      value={status}
      onValueChange={(next) => {
        if (next === status) return;

        startTransition(async () => {
          const result = await updateTravelStatusAction(
            procedureId,
            next as TravelStatus
          );
          onResult(result);
        });
      }}
    >
      <SelectTrigger
        size="sm"
        disabled={isPending}
        aria-label="Changer le statut du dossier"
        className={cn(
          "w-full gap-1 rounded-full border-none px-2.5 text-xs font-medium shadow-none",
          TRAVEL_STATUS_BADGE_CLASSES[status]
        )}
      >
        {isPending ? <Loader2Icon className="size-3 animate-spin" /> : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {TRAVEL_STATUS_ORDER.map((option) => (
          <SelectItem key={option} value={option}>
            {TRAVEL_STATUS_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Carte d'un dossier dans le tableau Kanban. */
function TravelCard({
  procedure,
  onStatusResult,
  onEdit,
}: {
  procedure: TravelProcedureDTO;
  onStatusResult: (result: UpdateTravelStatusResult) => void;
  onEdit: (procedure: TravelProcedureDTO) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-3 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium leading-tight">
            {procedure.student.firstName} {procedure.student.lastName}
          </span>
          <span className="text-xs text-muted-foreground">
            {procedure.student.studentCode}
          </span>
        </div>

        <EntityActionsMenu
          entityName={`le dossier de ${procedure.student.firstName} ${
            procedure.student.lastName
          } (${procedure.destination})`}
          onEdit={() => onEdit(procedure)}
          onDelete={() => deleteTravelProcedureAction(procedure.id)}
        />
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <MapPinIcon className="size-3.5 shrink-0" />
          <span className="truncate">{procedure.destination}</span>
        </p>
        {procedure.targetProgram ? (
          <p className="flex items-center gap-1.5">
            <GraduationCapIcon className="size-3.5 shrink-0" />
            <span className="truncate">{procedure.targetProgram}</span>
          </p>
        ) : null}
        {procedure.advisor ? (
          <p className="truncate">
            Conseiller : {procedure.advisor.firstName}{" "}
            {procedure.advisor.lastName}
          </p>
        ) : null}
        <p>Ouvert le {dateFormatter.format(procedure.createdAt)}</p>
      </div>

      <div className="mt-3">
        <TravelStatusSelect
          procedureId={procedure.id}
          status={procedure.status}
          onResult={onStatusResult}
        />
      </div>
    </article>
  );
}

/** Colonne du tableau Kanban correspondant à une étape du pipeline. */
function KanbanColumn({
  status,
  procedures,
  onStatusResult,
  onEdit,
}: {
  status: TravelStatus;
  procedures: TravelProcedureDTO[];
  onStatusResult: (result: UpdateTravelStatusResult) => void;
  onEdit: (procedure: TravelProcedureDTO) => void;
}) {
  return (
    <section
      aria-label={TRAVEL_STATUS_LABELS[status]}
      className="flex w-[270px] shrink-0 flex-col rounded-lg border bg-muted/40"
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {TRAVEL_STATUS_LABELS[status]}
        </h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums">
          {procedures.length}
        </span>
      </header>
      <div className="flex flex-col gap-2 p-2 pt-0">
        {procedures.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Aucun dossier
          </p>
        ) : (
          procedures.map((procedure) => (
            <TravelCard
              key={procedure.id}
              procedure={procedure}
              onStatusResult={onStatusResult}
              onEdit={onEdit}
            />
          ))
        )}
      </div>
    </section>
  );
}

// --------------------------------------
// Vue principale
// --------------------------------------

export function TravelsView({
  procedures,
  students,
}: {
  procedures: TravelProcedureDTO[];
  students: StudentOptionDTO[];
}) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [viewMode, setViewMode] = React.useState<ViewMode>("kanban");
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [editingProcedure, setEditingProcedure] =
    React.useState<TravelProcedureDTO | null>(null);

  const handleStatusResult = React.useCallback(
    (result: UpdateTravelStatusResult) => {
      if (result.ok) {
        setStatusError(null);
      } else {
        setStatusError(result.message);
      }
    },
    []
  );

  /** Nombre de dossiers par statut (pour les onglets et les compteurs). */
  const countsByStatus = React.useMemo(() => {
    const counts = new Map<TravelStatus, number>();

    for (const procedure of procedures) {
      counts.set(procedure.status, (counts.get(procedure.status) ?? 0) + 1);
    }

    return counts;
  }, [procedures]);

  /** Recherche instantanée par nom/code étudiant ou destination + filtre par statut. */
  const filteredProcedures = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return procedures.filter((procedure) => {
      if (statusFilter !== "ALL" && procedure.status !== statusFilter) {
        return false;
      }

      if (!query) return true;

      const fullName =
        `${procedure.student.firstName} ${procedure.student.lastName}`.toLowerCase();

      return (
        fullName.includes(query) ||
        procedure.student.firstName.toLowerCase().includes(query) ||
        procedure.student.lastName.toLowerCase().includes(query) ||
        procedure.student.studentCode.toLowerCase().includes(query) ||
        procedure.destination.toLowerCase().includes(query)
      );
    });
  }, [procedures, search, statusFilter]);

  /** Dossiers groupés par statut pour les colonnes Kanban. */
  const groupedByStatus = React.useMemo(() => {
    const groups = new Map<TravelStatus, TravelProcedureDTO[]>();

    for (const status of TRAVEL_STATUS_ORDER) {
      groups.set(status, []);
    }

    for (const procedure of filteredProcedures) {
      groups.get(procedure.status)?.push(procedure);
    }

    return groups;
  }, [filteredProcedures]);

  // Compteurs clés demandés : admissions et visas en cours.
  const admissionInProgressCount = countsByStatus.get("ADMISSION_APPLIED") ?? 0;
  const visaAppliedCount = countsByStatus.get("VISA_APPLIED") ?? 0;
  const visaApprovedCount = countsByStatus.get("VISA_APPROVED") ?? 0;

  const hasProcedures = procedures.length > 0;
  const hasResults = filteredProcedures.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Procédures voyage
          </h2>
          <p className="text-sm text-muted-foreground">
            Suivez les dossiers de mobilité internationale, de la préparation
            du dossier jusqu’au départ.
          </p>
        </div>
        <AddTravelDialog students={students} />
      </div>

      {/* Compteurs rapides */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={PlaneTakeoffIcon}
          label="Dossiers au total"
          value={procedures.length}
        />
        <StatCard
          icon={SendIcon}
          label="Admissions en cours"
          value={admissionInProgressCount}
        />
        <StatCard
          icon={StampIcon}
          label="Demandes de visa"
          value={visaAppliedCount}
        />
        <StatCard
          icon={BadgeCheckIcon}
          label="Visas approuvés"
          value={visaApprovedCount}
        />
      </div>

      {/* Carte principale : barre d'outils + vue Kanban / Liste */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b p-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          {/* Recherche instantanée */}
          <div className="relative w-full 2xl:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par étudiant ou destination..."
              aria-label="Rechercher un dossier de voyage"
              className="pl-8"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Onglets par statut */}
            <div
              role="group"
              aria-label="Filtrer par statut"
              className="flex flex-wrap items-center gap-1"
            >
              {STATUS_FILTERS.map((filter) => {
                const isActive = statusFilter === filter.value;
                const count =
                  filter.value === "ALL"
                    ? procedures.length
                    : (countsByStatus.get(filter.value) ?? 0);

                return (
                  <Button
                    key={filter.value}
                    type="button"
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={isActive}
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    {filter.label}
                    <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  </Button>
                );
              })}
            </div>

            {/* Bascule Kanban / Liste */}
            <div
              role="group"
              aria-label="Mode d'affichage"
              className="flex items-center gap-1 rounded-lg border p-1"
            >
              <Button
                type="button"
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={viewMode === "kanban"}
                onClick={() => setViewMode("kanban")}
              >
                <LayoutGridIcon data-icon="inline-start" />
                Kanban
              </Button>
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                <ListIcon data-icon="inline-start" />
                Liste
              </Button>
            </div>
          </div>
        </div>

        {/* Erreur éventuelle lors d'un changement de statut */}
        {statusError ? (
          <p
            role="alert"
            className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            {statusError}
          </p>
        ) : null}

        {hasProcedures ? (
          viewMode === "kanban" ? (
            hasResults ? (
              /* Tableau Kanban : une colonne par étape du pipeline */
              <div className="overflow-x-auto p-4">
                <div className="flex min-w-max gap-3">
                  {TRAVEL_STATUS_ORDER.map((status) => (
                    <KanbanColumn
                      key={status}
                      status={status}
                      procedures={groupedByStatus.get(status) ?? []}
                      onStatusResult={handleStatusResult}
                      onEdit={setEditingProcedure}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                <SearchIcon className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">Aucun résultat trouvé</p>
                <p className="text-sm text-muted-foreground">
                  Essayez un autre terme de recherche ou changez de filtre de
                  statut.
                </p>
              </div>
            )
          ) : hasResults ? (
            /* Vue liste */
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Étudiant</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Programme visé</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Conseiller</TableHead>
                    <TableHead>Ouvert le</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProcedures.map((procedure) => (
                    <TableRow key={procedure.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            {procedure.student.firstName}{" "}
                            {procedure.student.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {procedure.student.studentCode}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {procedure.destination}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {procedure.targetProgram ?? "—"}
                      </TableCell>
                      <TableCell>
                        <TravelStatusSelect
                          procedureId={procedure.id}
                          status={procedure.status}
                          onResult={handleStatusResult}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {procedure.advisor
                          ? `${procedure.advisor.firstName} ${procedure.advisor.lastName}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dateFormatter.format(procedure.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <EntityActionsMenu
                          entityName={`le dossier de ${
                            procedure.student.firstName
                          } ${procedure.student.lastName} (${
                            procedure.destination
                          })`}
                          onEdit={() => setEditingProcedure(procedure)}
                          onDelete={() =>
                            deleteTravelProcedureAction(procedure.id)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                {filteredProcedures.length} dossier
                {filteredProcedures.length > 1 ? "s" : ""} sur{" "}
                {procedures.length}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
              <SearchIcon className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Aucun résultat trouvé</p>
              <p className="text-sm text-muted-foreground">
                Essayez un autre terme de recherche ou changez de filtre de
                statut.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <PlaneTakeoffIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Aucun dossier de voyage pour le moment</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Ouvrez votre premier dossier avec le bouton « Nouveau dossier »
              pour accompagner un étudiant dans sa procédure.
            </p>
          </div>
        )}
      </div>

      {/* Modale d'édition pré-remplie */}
      <EditTravelDialog
        procedure={editingProcedure}
        students={students}
        open={editingProcedure !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProcedure(null);
        }}
      />
    </div>
  );
}