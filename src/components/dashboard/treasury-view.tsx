"use client";

import * as React from "react";
import Link from "next/link";
import {
  ActivityIcon,
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  CoinsIcon,
  LandmarkIcon,
  ListFilterIcon,
  PieChartIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  BreakdownSliceDTO,
  CashFlowDTO,
  CashFlowSeriesPointDTO,
  TreasuryTransactionDTO,
} from "@/actions/analytics";
import { KpiCard } from "@/components/dashboard/kpi-card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPaymentMethodLabel } from "@/lib/payment-status";
import { exportToCsv, type CsvColumn } from "@/lib/export";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("fr-FR");

function formatAmount(amount: number): string {
  return `${numberFormatter.format(amount)} FCFA`;
}

/** Abrège les montants : « 1,2 M » ou « 450 k » (axes et centres de donuts). */
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

/** Montant complet affiché dans les infobulles. */
function fullAmount(value: number): string {
  return `${numberFormatter.format(value)} FCFA`;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Style moderne des badges ponctuels. */
const TINTED_BADGE_CLASSES =
  "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400";

/** Style d'infobulle harmonisé avec le thème clair/sombre du tableau de bord. */
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
  fontSize: 12,
};

/** Palette stable des recettes — cohérente entre graphique et légende. */
const REVENUE_COLORS: Record<string, string> = {
  scolarite: "#6366f1",
  pos: "#10b981",
  voyages: "#f59e0b",
};

/** Palette des catégories de dépenses (cyclée si nécessaire). */
const EXPENSE_COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#0ea5e9",
  "#8b5cf6",
  "#14b8a6",
  "#84cc16",
  "#ef4444",
  "#eab308",
  "#3b82f6",
];

/** Fenêtres temporelles proposées pour les cartes KPI (toutes cohérentes). */
const SCOPE_OPTIONS = [
  { value: "month", label: "Ce mois" },
  { value: "all", label: "Tout" },
] as const;

type ScopeValue = (typeof SCOPE_OPTIONS)[number]["value"];

/** Filtres du journal unifié de caisse. */
const TYPE_FILTERS = [
  { value: "ALL", label: "Tous les mouvements" },
  { value: "INFLOW", label: "Entrées uniquement" },
  { value: "OUTFLOW", label: "Sorties uniquement" },
] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number]["value"];

/**
 * Graphique « Flux de trésorerie » : évolution mensuelle du solde de caisse
 * (aire) comparée aux entrées et sorties (lignes) sur les 12 derniers mois.
 */
function CashFlowChart({ data }: { data: CashFlowSeriesPointDTO[] }) {
  if (data.length === 0) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-14 text-center text-sm text-muted-foreground">
        Aucune donnée de flux disponible.
      </p>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 8, bottom: 8, left: 0 }}
        >
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            tickMargin={6}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            width={58}
            tickFormatter={(value) => compactAmount(Number(value))}
          />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            formatter={(value) => fullAmount(Number(value))}
          />
          <Legend
            iconType="circle"
            iconSize={9}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="cashBalance"
            name="Solde de caisse"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#balanceFill)"
          />
          <Line
            type="monotone"
            dataKey="inflows"
            name="Entrées"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="outflows"
            name="Sorties"
            stroke="#f43f5e"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Donut de répartition (recettes ou dépenses) avec montant total au centre
 * et légende détaillée (montant + part relative).
 */
function BreakdownDonut({
  title,
  description,
  slices,
  colorFor,
  emptyMessage,
}: {
  title: string;
  description: string;
  slices: BreakdownSliceDTO[];
  colorFor: (slice: BreakdownSliceDTO, index: number) => string;
  emptyMessage: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <PieChartIcon className="size-4 text-muted-foreground" />
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>

      {slices.length === 0 ? (
        <p className="mt-4 rounded-md bg-muted/60 px-3 py-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4 lg:flex-row">
          <div className="relative size-[170px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.key} fill={colorFor(slice, index)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  formatter={(value) => fullAmount(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums tracking-tight">
                {compactAmount(total)}
              </span>
              <span className="text-xs text-muted-foreground">FCFA</span>
            </div>
          </div>

          <ul className="w-full space-y-1.5">
            {slices.map((slice, index) => {
              const share = Math.round((slice.value / total) * 100);

              return (
                <li key={slice.key} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(slice, index) }}
                  />
                  <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {numberFormatter.format(slice.value)} ·{" "}
                    {numberFormatter.format(share)} %
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Vue dédiée « Trésorerie & caisse » (/dashboard/tresorerie) — tableau de
 * bord financier professionnel :
 * - 4 cartes KPI cohérentes avec la fenêtre temporelle sélectionnée
 *   (Ce mois / Tout) : Solde initial, Total recettes, Total dépenses et
 *   Solde net = Solde initial + Recettes − Dépenses ;
 * - graphique Recharts « Flux de trésorerie » (solde vs entrées/sorties) ;
 * - donuts de répartition des recettes (Scolarité / POS / Voyages) et des
 *   dépenses par catégorie ;
 * - journal de caisse unifié : les 20 derniers mouvements (entrées et
 *   sorties) avec filtres texte + type.
 */
export function TreasuryView({ cashFlow }: { cashFlow: CashFlowDTO }) {
  const [scope, setScope] = React.useState<ScopeValue>("all");
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("ALL");

  // Cartes KPI toujours cohérentes entre elles : chaque valeur reflète la
  // période sélectionnée (mois courant ou tous temps).
  const totalRecettes =
    scope === "month" ? cashFlow.collectedThisMonth : cashFlow.collectedTotal;
  const totalDepenses =
    scope === "month" ? cashFlow.expensesThisMonth : cashFlow.expensesTotal;
  const soldeNet = cashFlow.initialCashBalance + totalRecettes - totalDepenses;
  const scopeLabel = scope === "month" ? "Ce mois" : "Tous temps";

  // Journal unifié : filtres live (texte + type de mouvement).
  const filteredTransactions = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return cashFlow.recentTransactions.filter((tx) => {
      if (typeFilter !== "ALL" && tx.kind !== typeFilter) return false;
      if (!query) return true;

      return (
        tx.label.toLowerCase().includes(query) ||
        tx.category.toLowerCase().includes(query)
      );
    });
  }, [search, typeFilter, cashFlow.recentTransactions]);

  const revenueColorFor = (slice: BreakdownSliceDTO) =>
    REVENUE_COLORS[slice.key] ?? "#94a3b8";
  const expenseColorFor = (_slice: BreakdownSliceDTO, index: number) =>
    EXPENSE_COLORS[index % EXPENSE_COLORS.length];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <LandmarkIcon className="size-5 text-muted-foreground" />
            Trésorerie &amp; caisse
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tableau de bord financier du centre : solde initial, recettes,
            dépenses, flux de trésorerie et journal unifié des mouvements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={scope}
            onValueChange={(value) => setScope(value as ScopeValue)}
          >
            <TabsList>
              {SCOPE_OPTIONS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/organization">
              <SettingsIcon data-icon="inline-start" />
              Solde initial
            </Link>
          </Button>
        </div>
      </div>

      {/* Cartes KPI — toutes calibrées sur la période sélectionnée */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Solde initial de départ"
          value={formatAmount(cashFlow.initialCashBalance)}
          icon={<CoinsIcon />}
          iconClasses="bg-indigo-500/10 text-indigo-700 ring-1 ring-indigo-500/20 ring-inset dark:text-indigo-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              Configurable
            </span>
          }
          hint="Montant d'ouverture saisi dans les paramètres"
        />

        <KpiCard
          label="Total recettes"
          value={formatAmount(totalRecettes)}
          icon={<ArrowUpFromLineIcon />}
          iconClasses="bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              {scopeLabel}
            </span>
          }
          hint="Paiements (Scolarité, Voyages) + ventes POS"
        />

        <KpiCard
          label="Total dépenses"
          value={formatAmount(totalDepenses)}
          icon={<ArrowDownToLineIcon />}
          iconClasses="bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 ring-inset dark:text-amber-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              {scopeLabel}
            </span>
          }
          hint="Toutes catégories de dépenses du centre"
        />

        <KpiCard
          label="Solde net de caisse"
          value={formatAmount(soldeNet)}
          icon={<LandmarkIcon />}
          iconClasses="bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 ring-inset dark:text-violet-400"
          badge={
            <span
              className={cn(
                BADGE_BASE_CLASSES,
                soldeNet >= 0
                  ? TINTED_BADGE_CLASSES
                  : "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
              )}
            >
              {soldeNet >= 0 ? "Caisse positive" : "Déficit"}
            </span>
          }
          hint={`Solde initial + recettes − dépenses · ${scopeLabel.toLowerCase()}`}
        />
      </div>

{/* Graphique des flux + répartitions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm lg:col-span-2 dark:border-slate-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ActivityIcon className="size-4 text-muted-foreground" />
            Flux de trésorerie
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Évolution mensuelle du solde de caisse comparée aux entrées
            (recettes) et sorties (dépenses) — 12 derniers mois.
          </p>
          <div className="mt-4">
            <CashFlowChart data={cashFlow.monthlyCashFlow} />
          </div>
        </section>

        <BreakdownDonut
          title="Recettes par source"
          description="Répartition des encaissements : Scolarité, POS Caisse, Procédures voyage."
          slices={cashFlow.revenueBreakdown}
          colorFor={revenueColorFor}
          emptyMessage="Aucune recette enregistrée."
        />

        <BreakdownDonut
          title="Dépenses par catégorie"
          description="Répartition des sorties de caisse par catégorie de dépense."
          slices={cashFlow.expenseBreakdown}
          colorFor={expenseColorFor}
          emptyMessage="Aucune dépense enregistrée."
        />
      </div>

      {/* Journal unifié de caisse */}
      <section className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ListFilterIcon className="size-4 text-muted-foreground" />
              Journal de caisse unifié
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Les 20 derniers mouvements : entrées (paiements &amp; ventes POS)
              et sorties (dépenses).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filtrer libellé / catégorie…"
                className="h-9 w-52 pl-8"
                aria-label="Filtrer les mouvements de caisse"
              />
            </div>

            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as TypeFilter)}
            >
              <SelectTrigger className="h-9 w-48">
                <SelectValue placeholder="Type de mouvement" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

<div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Libellé / Description</TableHead>
                <TableHead>Catégorie / Source</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Montant (FCFA)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aucun mouvement ne correspond aux filtres.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {dateFormatter.format(tx.date)}
                    </TableCell>
                    <TableCell className="max-w-56 truncate" title={tx.label}>
                      {tx.label}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {tx.category}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {tx.method ? getPaymentMethodLabel(tx.method) : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          BADGE_BASE_CLASSES,
                          tx.kind === "INFLOW"
                            ? "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "border border-rose-200/60 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400"
                        )}
                      >
                        {tx.kind === "INFLOW" ? "Entrée" : "Sortie"}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        tx.kind === "INFLOW"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {tx.kind === "INFLOW" ? "+" : "−"}{" "}
                      {numberFormatter.format(tx.amount)} FCFA
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}