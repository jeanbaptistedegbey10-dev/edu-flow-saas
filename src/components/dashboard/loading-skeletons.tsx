import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// --------------------------------------
// Blocs de skeleton réutilisables
// --------------------------------------
//
// Structures de chargement calquées sur les vues réelles du dashboard
// (en-tête de page, barre d'outils, cartes KPI, tableaux, grilles de
// cartes, graphiques, listes rapides, calendrier, formulaires).
// Composants 100 % serveur : aucun état, aucun accès données.

/** En-tête de page : titre + description + actions principales. */
export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-40" />
      </div>
    </div>
  );
}

/** Barre d'outils : recherche + filtres + boutons d'action. */
export function ToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-full sm:w-72" />
      <Skeleton className="hidden h-9 w-32 sm:block" />
      <Skeleton className="hidden h-9 w-32 sm:block" />
      <div className="ml-auto flex items-center gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-40" />
      </div>
    </div>
  );
}

/** Rangée de cartes KPI (indicateurs clés). */
export function KpiCardsSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200/80 shadow-sm dark:border-slate-800"
        >
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
            <Skeleton className="size-11 rounded-xl" />
          </div>
          <div className="border-t px-5 py-3">
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tableau de données (ligne d'avatar + colonnes + badge + actions). */
export function SkeletonTable({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800",
        className
      )}
    >
      {/* Barre d'outils intégrée (recherche / filtres) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-56" />
      </div>

      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="grid shrink-0 gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="hidden h-4 flex-1 md:block" />
            <Skeleton className="hidden h-4 w-24 md:block" />
            <Skeleton className="hidden h-4 w-28 lg:block" />
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            <Skeleton className="ml-auto h-8 w-8 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Grille de cartes (catalogue de cours, classes, voyages…). */
export function SkeletonCardsGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col rounded-xl border border-slate-200/80 shadow-sm dark:border-slate-800"
        >
          <div className="grid gap-3 p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="mt-auto grid gap-2 border-t px-4 py-3">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Carte graphique (Recharts) avec en-tête + légende + aire de tracé. */
export function SkeletonChart({
  className,
  chartHeight = "h-64",
}: {
  className?: string;
  chartHeight?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-card p-5 shadow-sm dark:border-slate-800",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-12 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
        </div>
      </div>

      <div className={cn("mt-5 flex items-end gap-2 sm:gap-3", chartHeight)}>
        {/* Barres du futur graphique, hauteurs variées pour un rendu crédible */}
        {[45, 68, 55, 82, 60, 74, 50, 90, 64, 78, 58, 70].map(
          (height, index) => (
            <Skeleton
              key={index}
              className="flex-1 rounded-t-md"
              style={{ height: `${height}%` }}
            />
          )
        )}
      </div>
    </div>
  );
}

/** Liste rapide (derniers versements, alertes impayés…). */
export function SkeletonList({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800",
        className
      )}
    >
      <div className="border-b p-4">
        <Skeleton className="h-5 w-40" />
      </div>

      <ul className="divide-y">
        {Array.from({ length: rows }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <div className="grid shrink-0 justify-items-end gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-14 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Grille calendaire (7 colonnes + cellules de jours). */
export function SkeletonCalendar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <div className="flex gap-2">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-md sm:h-20" />
        ))}
      </div>
    </div>
  );
}

/** Onglets (paramètres, organisation…). */
export function SkeletonTabs({
  tabs = 4,
  className,
}: {
  tabs?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg border bg-muted/40 p-1",
        className
      )}
    >
      {Array.from({ length: tabs }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-8 rounded-md", index === 0 ? "w-32" : "w-24")}
        />
      ))}
    </div>
  );
}

/** Formulaire : champs label + input, zone de texte et actions. */
export function SkeletonForm({
  fields = 4,
  className,
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-card p-6 shadow-sm dark:border-slate-800",
        className
      )}
    >
      <div className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: fields }).map((_, index) => (
            <div key={index} className="grid gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full" />
        </div>

        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
    </div>
  );
}

