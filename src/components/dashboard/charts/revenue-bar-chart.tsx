"use client";

// --------------------------------------
// Graphique : évolution mensuelle des recettes par source
// --------------------------------------

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { FinancialOverviewPointDTO } from "@/actions/analytics";

// Formatage déterministe (locale fixe) côté client uniquement.
const numberFormatter = new Intl.NumberFormat("fr-FR");

/** Abrège les montants de l'axe Y : « 1,2 M » ou « 450 k ». */
function compactAmount(value: number): string {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000) {
    return `${numberFormatter.format(Math.round(value / 100_000) / 10)} M`;
  }
  if (absolute >= 1_000) {
    return `${numberFormatter.format(Math.round(value / 1_000))} k`;
  }
  return numberFormatter.format(value);
}

/** Montant complet affiché dans l'infobulle. */
function fullAmount(value: number): string {
  return `${numberFormatter.format(value)} FCFA`;
}

/** Style d'infobulle harmonisé avec le thème clair/sombre du tableau de bord. */
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
  fontSize: 12,
};

type RevenueBarChartProps = {
  data: FinancialOverviewPointDTO[];
};

/**
 * BarChart empilé verticalement des recettes mensuelles ventilées par source :
 * Scolarité (indigo), Procédures voyage (ambre) et Ventes POS (émeraude).
 */
export function RevenueBarChart({ data }: RevenueBarChartProps) {
  if (data.length === 0) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-16 text-center text-sm text-muted-foreground">
        Aucune donnée financière disponible pour la période sélectionnée.
      </p>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={{ stroke: "var(--border)" }}
            interval={0}
            angle={-14}
            textAnchor="end"
            height={52}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={{ stroke: "var(--border)" }}
            width={56}
            tickFormatter={(value) => compactAmount(Number(value))}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.35 }}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            formatter={(value) => fullAmount(Number(value))}
          />
          <Legend
            iconType="circle"
            iconSize={9}
            wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
          />
          <Bar
            dataKey="scolarite"
            name="Scolarité"
            fill="#6366f1"
            radius={[4, 4, 0, 0]}
            maxBarSize={38}
          />
          <Bar
            dataKey="voyages"
            name="Procédures voyage"
            fill="#f59e0b"
            radius={[4, 4, 0, 0]}
            maxBarSize={38}
          />
          <Bar
            dataKey="pos"
            name="Ventes POS"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
            maxBarSize={38}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
