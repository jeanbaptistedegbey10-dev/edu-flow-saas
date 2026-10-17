import type React from "react";

import { cn } from "@/lib/utils";

// --------------------------------------
// Carte KPI partagée des tableaux de bord
// --------------------------------------

type KpiCardProps = {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconClasses: string;
  badge?: React.ReactNode;
  hint: string;
};

/**
 * Carte d'indicateur réutilisable par l'ensemble des tableaux de bord
 * (vue analytique globale comme espace enseignant). Présentation pure :
 * aucune logique métier ni accès données.
 */
export function KpiCard({ label, value, icon, iconClasses, badge, hint }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight md:text-[1.75rem] md:leading-8">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm [&_svg]:size-5",
            iconClasses
          )}
        >
          {icon}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-5 py-3">
        {badge}
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}
