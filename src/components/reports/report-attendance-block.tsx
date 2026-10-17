"use client";

import * as React from "react";

import {
  formatAttendanceRate,
  type AttendanceMetrics,
} from "@/lib/report-attendance";

/**
 * Bloc « Assiduité / Présences » d'un bulletin — RENDU ÉCRAN ET IMPRESSION.
 *
 * Positionné juste AU-DESSUS de la zone d'appréciation : le professeur lit
 * d'abord le bilan de présence, puis son commentaire. Les classes utilitaires
 * `avoid-break` / `print-section` garantissent que le bloc ne soit jamais
 * coupé en deux par un saut de page.
 *
 * @param metrics  Métriques calculées côté serveur (`lib/report-attendance`).
 * @param caption  Précision affichée sous les compteurs (période analysée).
 */
export function ReportAttendanceBlock({
  metrics,
  caption,
}: {
  metrics: AttendanceMetrics;
  /** Légende de la période analysée (ex : « classe Allemand A1 »). */
  caption?: string;
}): React.ReactElement {
  const rate = metrics.attendanceRate;
  const rateTone =
    rate === null
      ? "border-border bg-card text-muted-foreground"
      : rate >= 90
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : rate >= 75
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-red-200 bg-red-50 text-red-800";

  return (
    <section className="avoid-break print-section mt-3">
      <h3 className="mb-1.5 text-xs font-extrabold tracking-widest text-indigo-800 uppercase">
        Assiduité / Présences
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          label="Séances présentes"
          value={`${metrics.presentSessions} / ${metrics.totalSessions}`}
          tone="border-emerald-200 bg-emerald-50 text-emerald-800"
        />
        <MetricCard
          label="Taux de présence"
          value={formatAttendanceRate(rate)}
          tone={rateTone}
        />
        <MetricCard
          label="Absences"
          value={String(metrics.absentSessions)}
          tone={
            metrics.absentSessions > 0
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-border bg-card text-muted-foreground"
          }
        />
        <MetricCard
          label="Excusées"
          value={String(metrics.excusedSessions)}
          tone="border-sky-200 bg-sky-50 text-sky-800"
        />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {caption ?? "Suivi des émargements de la période."}
      </p>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  /** Classes Tailwind de bordure / fond / texte. */
  tone: string;
}): React.ReactElement {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-center ${tone}`}>
      <span className="block text-sm font-extrabold tabular-nums">{value}</span>
      <span className="block text-[9.5px] font-semibold tracking-wide uppercase opacity-80">
        {label}
      </span>
    </div>
  );
}