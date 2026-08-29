"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StudentEvaluationDTO } from "@/actions/evaluations";
import { cn } from "@/lib/utils";

/** Seuil de validation d'une session / d'un module (note sur 100). */
const VALIDATION_THRESHOLD = 60;

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation entre le rendu serveur et le rendu client.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

/** Point du graphique : une session d'évaluation notée (ordre chronologique). */
export type StudentPerformancePoint = {
  /** Titre de la session d'évaluation (axe X). */
  label: string;
  /** Date de la session (infobulle). */
  date: Date;
  /** Moyenne de l'étudiant sur la session, normalisée sur 100. */
  moyenne: number;
  /** Modules notés et validés (note ≥ seuil) sur la session. */
  validatedModules: number;
  /** Modules notés sur la session. */
  gradedModules: number;
};

/**
 * Construit les points du graphique à partir des sessions d'évaluation.
 * Les sessions sans aucune note sont écartées ; les autres sont conservées
 * dans l'ordre chronologique (triées par date croissante côté serveur).
 */
export function buildStudentPerformancePoints(
  evaluations: StudentEvaluationDTO[]
): StudentPerformancePoint[] {
  return evaluations
    .filter((evaluation) => evaluation.averageOn100 !== null)
    .map((evaluation) => {
      const gradedModules = evaluation.modules.filter(
        (moduleItem) => moduleItem.score !== null
      );
      const validatedModules = gradedModules.filter(
        (moduleItem) =>
          moduleItem.score !== null &&
          moduleItem.score >= moduleItem.passingScore
      ).length;

      return {
        label: evaluation.title,
        date: evaluation.date,
        moyenne: evaluation.averageOn100 as number,
        validatedModules,
        gradedModules: gradedModules.length,
      };
    });
}

type PerformanceTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: StudentPerformancePoint }>;
};

/** Infobulle personnalisée : moyenne + badge « x/y modules validés ». */
function PerformanceTooltip({ active, payload }: PerformanceTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;

  if (!point) return null;

  const allValidated =
    point.gradedModules > 0 && point.validatedModules === point.gradedModules;

  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{point.label}</p>
      <p className="text-muted-foreground">{dateFormatter.format(point.date)}</p>
      <p className="mt-1 font-semibold tabular-nums">
        Moyenne : {numberFormatter.format(point.moyenne)} / 100
      </p>
      <span
        className={cn(
          "mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 font-medium",
          allValidated
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
            : point.validatedModules === 0
              ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
              : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
        )}
      >
        {point.validatedModules}/{point.gradedModules} modules validés
      </span>
    </div>
  );
}

/**
 * Graphique d'évolution des notes de l'étudiant, session par session
 * (LineChart Recharts) :
 * - une ligne « Moyenne /100 » chronologique (examens internes) ;
 * - une ligne de référence fixe au seuil de validation (60/100) ;
 * - une infobulle détaillant, pour chaque session, le nombre de modules
 *   validés (ex : « 3/4 modules validés »).
 */
export function StudentPerformanceChart({
  evaluations,
}: {
  evaluations: StudentEvaluationDTO[];
}) {
  const points = React.useMemo(
    () => buildStudentPerformancePoints(evaluations),
    [evaluations]
  );

  if (points.length === 0) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-6 text-center text-sm text-muted-foreground">
        Aucune note enregistrée pour cet étudiant. La courbe de progression
        apparaîtra après la saisie des premières notes.
      </p>
    );
  }

  if (points.length === 1) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-6 text-center text-sm text-muted-foreground">
        Une seule évaluation notée pour l&apos;instant (moyenne :{" "}
        {numberFormatter.format(points[0].moyenne)} / 100). La courbe
        apparaîtra dès la deuxième session notée.
      </p>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 12, right: 24, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-14}
            textAnchor="end"
            height={56}
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={36} />
          <Tooltip content={<PerformanceTooltip />} />
          {/* Ligne de référence fixe : seuil de validation (60/100). */}
          <ReferenceLine
            y={VALIDATION_THRESHOLD}
            stroke="#f59e0b"
            strokeDasharray="6 4"
            label={{
              value: `Seuil de validation (${VALIDATION_THRESHOLD}/100)`,
              position: "insideBottomLeft",
              fontSize: 11,
              fill: "#b45309",
            }}
          />
          <Line
            type="monotone"
            dataKey="moyenne"
            name="Moyenne /100"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={{ r: 4, fill: "#4f46e5" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
