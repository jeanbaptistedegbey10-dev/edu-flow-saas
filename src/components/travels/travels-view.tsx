"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlarmClockIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  CalendarClockIcon,
  CheckIcon,
  CircleDollarSignIcon,
  FileStackIcon,
  LayersIcon,
  Loader2Icon,
  MapPinIcon,
  PlaneTakeoffIcon,
  SearchIcon,
  UserRoundXIcon,
} from "lucide-react";

import {
  setTravelCurrentStageAction,
  type StudentOptionDTO,
  type TravelProcedureDTO,
  type WorkflowDTO,
} from "@/actions/travels";
import { AddTravelDialog } from "@/components/travels/add-travel-dialog";
import { EditTravelDialog } from "@/components/travels/edit-travel-dialog";
import { WorkflowsManager } from "@/components/travels/workflows-manager";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

type ViewTab = "dossiers" | "workflows";

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
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md">
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
 * Barre de progression animée : la largeur est pilotée par un style inline
 * avec transition CSS (animation fluide au montage et aux mises à jour).
 */
function ProgressBar({ percent }: { percent: number }) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // Double frame : garantit la transition depuis 0 % vers la valeur cible.
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progression de la procédure : ${percent} %`}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-700 ease-out"
        style={{ width: `${mounted ? percent : 0}%` }}
      />
    </div>
  );
}

/**
 * Stepper horizontal des jalons de la procédure :
 * Vert = Validé · Indigo = En cours · Slate = À venir.
 */
function StageStepper({
  validated,
  total,
}: {
  validated: number;
  total: number;
}) {
  if (total <= 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Aucun modèle associé — progression libre
      </p>
    );
  }

  return (
    <ol aria-label="Jalons de la procédure" className="flex items-center gap-1">
      {Array.from({ length: total }, (_, index) => {
        const isValidated = index < validated;
        const isCurrent = index === validated;

        return (
          <li key={index} className="flex min-w-0 flex-1 items-center gap-1">
            <span
              title={
                isValidated
                  ? `Étape ${index + 1} validée`
                  : isCurrent
                    ? `Étape ${index + 1} en cours`
                    : `Étape ${index + 1} à venir`
              }
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold transition-colors",
                isValidated &&
                  "border-emerald-500 bg-emerald-500 text-white",
                isCurrent &&
                  "border-indigo-500 bg-indigo-500 text-white ring-4 ring-indigo-500/20",
                !isValidated &&
                  !isCurrent &&
                  "border-border bg-muted text-transparent"
              )}
            >
              {isValidated ? <CheckIcon className="size-2.5" /> : null}
            </span>
            {index < total - 1 ? (
              <span
                className={cn(
                  "h-0.5 min-w-1.5 flex-1 rounded-full",
                  index < validated - 1 || (isValidated && total === 1)
                    ? "bg-emerald-400"
                    : "bg-muted-foreground/25"
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Pastille d'échéance : rouge si dépassée, ambre si proche (≤ 7 jours). */
function DeadlineBadge({ deadline }: { deadline: Date }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Normalise l'échéance à minuit UTC pour une comparaison en jours entiers.
  const deadlineDay = new Date(deadline);
  deadlineDay.setUTCHours(0, 0, 0, 0);
  const todayUtc = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );

  const daysLeft = Math.round(
    (deadlineDay.getTime() - todayUtc.getTime()) / 86_400_000
  );

  const isOverdue = daysLeft < 0;
  const isSoon = daysLeft >= 0 && daysLeft <= 7;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        isOverdue &&
          "border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
        isSoon &&
          !isOverdue &&
          "border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
        !isOverdue &&
          !isSoon &&
          "border-border bg-muted text-foreground"
      )}
    >
      <AlarmClockIcon className="size-3" />
      {isOverdue
        ? `En retard (${dateFormatter.format(deadline)})`
        : daysLeft === 0
          ? "Aujourd'hui"
          : `J-${daysLeft} · ${dateFormatter.format(deadline)}`}
    </span>
  );
}

/** Carte d'un dossier candidat : progression, jalons, finances et actions. */
function TravelCard({
  procedure,
  onEdit,
  onValidateResult,
}: {
  procedure: TravelProcedureDTO;
  onEdit: (procedure: TravelProcedureDTO) => void;
  onValidateResult: (message: string | null) => void;
}) {
  const [isValidating, setIsValidating] = React.useState(false);
  const canValidate =
    procedure.totalStages > 0 &&
    procedure.validatedStages < procedure.totalStages;

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const result = await setTravelCurrentStageAction(
        procedure.id,
        procedure.validatedStages + 1
      );
      onValidateResult(result.ok ? null : result.message);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/dashboard/travels/${procedure.id}`}
            className="block truncate font-semibold tracking-tight hover:text-primary hover:underline"
          >
            {procedure.candidateName}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="size-3 shrink-0" />
              {procedure.destination}
            </span>
            {procedure.isExternalCandidate ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:text-amber-400">
                <UserRoundXIcon className="size-2.5" />
                Externe
              </span>
            ) : procedure.candidateCode ? (
              <span>{procedure.candidateCode}</span>
            ) : null}
          </p>
        </div>

        <EntityActionsMenu
          entityName={`le dossier de ${procedure.candidateName} (${procedure.destination})`}
          onEdit={() => onEdit(procedure)}
          onDelete={() =>
            import("@/actions/travels").then((mod) =>
              mod.deleteTravelProcedureAction(procedure.id)
            )
          }
        />
      </header>

      {procedure.targetProgram ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {procedure.targetProgram}
        </p>
      ) : null}

      {/* Progression : pourcentage animé + jalons colorés */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">
            {procedure.currentStageTitle ?? "Progression"}
          </span>
          <span className="font-bold tabular-nums">
            {procedure.progressPercent}%
            <span className="ml-1 font-normal text-muted-foreground">
              ({procedure.validatedStages}/{procedure.totalStages || "—"})
            </span>
          </span>
        </div>

        <ProgressBar percent={procedure.progressPercent} />
        <StageStepper
          validated={procedure.validatedStages}
          total={procedure.totalStages}
        />
      </div>

      {/* Échéance de l'étape en cours */}
      {procedure.currentStageDeadline ? (
        <div className="mt-3">
          <DeadlineBadge deadline={procedure.currentStageDeadline} />
        </div>
      ) : null}

      {/* Synthèse financière */}
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
        <div>
          <dt className="text-muted-foreground">Net à payer</dt>
          <dd className="font-semibold tabular-nums">
            {amountFormatter.format(procedure.netAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Encaissé</dt>
          <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {amountFormatter.format(procedure.paidAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reste</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              procedure.remainingAmount > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {amountFormatter.format(procedure.remainingAmount)}
          </dd>
        </div>
      </dl>

      {/* Actions rapides */}
      <footer className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={!canValidate || isValidating}
          onClick={handleValidate}
          title={
            canValidate
              ? "Valider l'étape en cours"
              : "Toutes les étapes sont déjà validées"
          }
        >
          {isValidating ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <BadgeCheckIcon data-icon="inline-start" />
          )}
          Valider l’étape
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/dashboard/travels/${procedure.id}`}>
            Détail
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </footer>
    </article>
  );
}

// --------------------------------------
// Vue principale
// --------------------------------------

export function TravelsView({
  procedures,
  students,
  workflows,
}: {
  procedures: TravelProcedureDTO[];
  students: StudentOptionDTO[];
  workflows: WorkflowDTO[];
}) {
  const [tab, setTab] = React.useState<ViewTab>("dossiers");
  const [search, setSearch] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [editingProcedure, setEditingProcedure] =
    React.useState<TravelProcedureDTO | null>(null);

  /** Recherche instantanée par nom/code candidat ou destination. */
  const filteredProcedures = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return procedures;

    return procedures.filter((procedure) => {
      return (
        procedure.candidateName.toLowerCase().includes(query) ||
        (procedure.candidateCode?.toLowerCase().includes(query) ?? false) ||
        procedure.destination.toLowerCase().includes(query) ||
        (procedure.targetProgram?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [procedures, search]);

  // Indicateurs clés du module voyage.
  const inProgressCount = procedures.filter(
    (p) => p.totalStages > 0 && p.validatedStages < p.totalStages
  ).length;
  const completedCount = procedures.filter(
    (p) => p.totalStages > 0 && p.validatedStages >= p.totalStages
  ).length;
  const overdueCount = procedures.filter((p) => {
    if (!p.currentStageDeadline) return false;
    const today = new Date();
    const deadline = new Date(p.currentStageDeadline);
    deadline.setUTCHours(23, 59, 59, 999);
    return deadline.getTime() < today.getTime();
  }).length;

  const hasProcedures = procedures.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Module Voyage
          </h2>
          <p className="text-sm text-muted-foreground">
            Suivi visuel des procédures candidats, échelonnement financier et
            modèles de workflows par pays.
          </p>
        </div>
        {tab === "dossiers" ? (
          <AddTravelDialog students={students} workflows={workflows} />
        ) : null}
      </div>

      {/* Onglets principaux */}
      <div
        role="group"
        aria-label="Sections du module voyage"
        className="flex w-fit items-center gap-1 rounded-lg border p-1"
      >
        <Button
          type="button"
          variant="pill"
          size="sm"
          aria-pressed={tab === "dossiers"}
          onClick={() => setTab("dossiers")}
        >
          <PlaneTakeoffIcon data-icon="inline-start" />
          Dossiers candidats
          <span className="ml-1 text-xs text-muted-foreground tabular-nums">
            {procedures.length}
          </span>
        </Button>
        <Button
          type="button"
          variant="pill"
          size="sm"
          aria-pressed={tab === "workflows"}
          onClick={() => setTab("workflows")}
        >
          <FileStackIcon data-icon="inline-start" />
          Workflows & modèles
          <span className="ml-1 text-xs text-muted-foreground tabular-nums">
            {workflows.length}
          </span>
        </Button>
      </div>

      {tab === "workflows" ? (
        <WorkflowsManager workflows={workflows} />
      ) : (
        <>
          {/* Compteurs rapides */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={PlaneTakeoffIcon}
              label="Dossiers au total"
              value={procedures.length}
            />
            <StatCard
              icon={LayersIcon}
              label="Procédures en cours"
              value={inProgressCount}
            />
            <StatCard
              icon={BadgeCheckIcon}
              label="Procédures terminées"
              value={completedCount}
            />
            <StatCard
              icon={CalendarClockIcon}
              label="Échéances dépassées"
              value={overdueCount}
            />
          </div>

          {/* Recherche instantanée */}
          <div className="relative w-full max-w-md">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par candidat ou destination..."
              aria-label="Rechercher un dossier de voyage"
              className="pl-8"
            />
          </div>

          {actionError ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {actionError}
            </p>
          ) : null}

          {hasProcedures ? (
            filteredProcedures.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filteredProcedures.map((procedure) => (
                  <TravelCard
                    key={procedure.id}
                    procedure={procedure}
                    onEdit={setEditingProcedure}
                    onValidateResult={setActionError}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center">
                <SearchIcon className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">Aucun résultat trouvé</p>
                <p className="text-sm text-muted-foreground">
                  Essayez un autre terme de recherche.
                </p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <CircleDollarSignIcon className="size-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Aucun dossier de voyage pour le moment</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Ouvrez votre premier dossier avec le bouton « Nouveau dossier »
                pour accompagner un candidat dans sa procédure.
              </p>
            </div>
          )}
        </>
      )}

      {/* Modale d'édition pré-remplie */}
      <EditTravelDialog
        procedure={editingProcedure}
        students={students}
        workflows={workflows}
        open={editingProcedure !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProcedure(null);
        }}
      />
    </div>
  );
}