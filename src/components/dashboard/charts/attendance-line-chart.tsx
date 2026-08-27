"use client";

// --------------------------------------
// Graphique : tendance mensuelle de l'assiduité globale
// --------------------------------------

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AttendanceTrendPointDTO } from "@/actions/analytics";

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

/** Style d'infobulle harmonisé avec le thème clair/sombre du tableau de bord. */
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
  fontSize: 12,
};

type AttendanceLineChartProps = {
  data: AttendanceTrendPointDTO[];
};

/**
 * LineChart Recharts du taux de présence mensuel global (0–100 %).
 * Les mois sans émargement sont représentés par des trous (`null`),
 * reliés entre eux pour préserver la lisibilité de la tendance.
 */
export function AttendanceLineChart({ data }: AttendanceLineChartProps) {
  const hasData =
    data.length > 0 && data.some((point) => point.rate !== null);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm font-medium">Aucun émargement enregistré</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Prenez les présences depuis « Présences & Cahier de texte » pour
                    alimenter la courbe d&apos;assiduité.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 24, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-14}
            textAnchor="end"
            height={52}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            width={38}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            // Le libellé de série reste géré par Recharts ; on n'habille que
            // la valeur (« 92,5 % »), avec un rappel d'émargements fiable.
            formatter={(value, _name, item) => {
              const entries =
                typeof item === "object" &&
                item !== null &&
                "payload" in item &&
                typeof (item as { payload?: { entries?: number } }).payload
                  ?.entries === "number"
                  ? (item as { payload: { entries: number } }).payload.entries
                  : null;

              return entries !== null
                ? `${numberFormatter.format(Number(value))} % (${entries} émargement${
                    entries > 1 ? "s" : ""
                  })`
                : `${numberFormatter.format(Number(value))} %`;
            }}
          />
          <Line
            type="monotone"
            connectNulls
            dataKey="rate"
            name="Taux de présence"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 4, fill: "#10b981" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
