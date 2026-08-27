"use client";

// --------------------------------------
// Graphique : répartition des apprenants par niveau (donut)
// --------------------------------------

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { StudentDistributionSliceDTO } from "@/actions/analytics";

const numberFormatter = new Intl.NumberFormat("fr-FR");

/** Palette stable par niveau — cohérente entre secteurs et légende. */
const SLICE_COLORS: Record<string, string> = {
  A1: "#6366f1",
  A2: "#0ea5e9",
  B1: "#22c55e",
  B2: "#f59e0b",
  C1: "#8b5cf6",
  C2: "#ef4444",
  AUTRES: "#94a3b8",
};

function getSliceColor(key: string): string {
  return SLICE_COLORS[key] ?? SLICE_COLORS.AUTRES;
}

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
  fontSize: 12,
};

type StudentDistributionDonutProps = {
  /** Tranches par niveau (A1 → C2 + « Non catégorisés » si nécessaire). */
  slices: StudentDistributionSliceDTO[];
  /** Effectif total affiché au centre du donut. */
  total: number;
};

/**
 * Donut Recharts de la répartition des apprenants par niveau CECRL, avec
 * effectif au centre et légende détaillée (compte + pourcentage).
 */
export function StudentDistributionDonut({
  slices,
  total,
}: StudentDistributionDonutProps) {
  // Les tranches vides polluent l'infobulle : on ne trace que ce qui existe.
  const visibleSlices = slices.filter((slice) => slice.count > 0);

  if (visibleSlices.length === 0 || total <= 0) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 py-10 text-center">
        <p className="text-sm font-medium">Aucun apprenant catégorisé</p>
        <p className="max-w-xs text-sm text-muted-foreground">
                    Inscrivez vos étudiants à des formations dont l&apos;intitulé mentionne un
          niveau (A1 à C2) pour visualiser la répartition.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      {/* Donut avec valeur centrale */}
      <div className="relative size-[200px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visibleSlices}
              dataKey="count"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {visibleSlices.map((slice) => (
                <Cell key={slice.key} fill={getSliceColor(slice.key)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              formatter={(value, name) => [
                `${numberFormatter.format(Number(value))} étudiant${
                  Number(value) > 1 ? "s" : ""
                }`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Effectif central (superposé au trou du donut) */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums tracking-tight">
            {numberFormatter.format(total)}
          </span>
          <span className="text-xs text-muted-foreground">apprenants</span>
        </div>
      </div>

      {/* Légende : couleur · niveau · effectif · part relative */}
      <ul className="w-full space-y-1.5">
        {visibleSlices.map((slice) => {
          const share = Math.round((slice.count / total) * 100);

          return (
            <li key={slice.key} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: getSliceColor(slice.key) }}
              />
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {numberFormatter.format(slice.count)} ·{" "}
                {numberFormatter.format(share)} %
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
