import Link from "next/link";
import {
  ArrowRightIcon,
  PlaneIcon,
  ReceiptTextIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  UsersRoundIcon,
  WalletCardsIcon,
} from "lucide-react";

import type {
  AttendanceTrendPointDTO,
  DashboardAnalyticsDTO,
  FinancialOverviewPointDTO,
  StudentDistributionDTO,
  UnpaidAlertDTO,
} from "@/actions/analytics";
import type { RecentPaymentDTO } from "@/actions/dashboard";
import { AttendanceLineChart } from "@/components/dashboard/charts/attendance-line-chart";
import { RevenueBarChart } from "@/components/dashboard/charts/revenue-bar-chart";
import { StudentDistributionDonut } from "@/components/dashboard/charts/student-distribution-donut";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import {
  getPaymentMethodLabel,
  getPaymentStatusBadgeClass,
  getPaymentStatusLabel,
} from "@/lib/payment-status";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation et garantir un rendu stable côté serveur.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("fr-FR");

function formatAmount(amount: number): string {
  return `${numberFormatter.format(amount)} FCFA`;
}

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Style moderne des badges ponctuels du tableau de bord. */
const TINTED_BADGE_CLASSES =
  "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400";

/** Initiales affichées dans l'avatar rond des listes rapides. */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export type DashboardOverviewProps = {
  stats: DashboardAnalyticsDTO;
  financialOverview: FinancialOverviewPointDTO[];
  distribution: StudentDistributionDTO;
  attendanceTrend: AttendanceTrendPointDTO[];
};

// --------------------------------------
// Liste rapide : les 5 derniers versements
// --------------------------------------

function RecentPaymentsFeed({ payments }: { payments: RecentPaymentDTO[] }) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <ReceiptTextIcon className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Aucun versement enregistré</p>
        <p className="text-sm text-muted-foreground">
          Les règlements scolaires et voyages apparaîtront ici en temps réel.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {payments.map((payment) => (
        <li key={payment.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {getInitials(payment.student.firstName, payment.student.lastName)}
          </div>

          <div className="min-w-0 flex-1">
            <Link
              href={`/dashboard/students/${payment.student.id}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {payment.student.firstName} {payment.student.lastName}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {getPaymentMethodLabel(payment.paymentMethod)} ·{" "}
              {dateFormatter.format(payment.paidAt)}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums">
              {formatAmount(payment.amount)}
            </p>
            <span
              className={cn(
                BADGE_BASE_CLASSES,
                getPaymentStatusBadgeClass(payment.status)
              )}
            >
              {getPaymentStatusLabel(payment.status)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// --------------------------------------
// Liste rapide : alertes d'impayés prioritaires
// --------------------------------------

function UnpaidAlertRow({ alert }: { alert: UnpaidAlertDTO }) {
  const isTravel = alert.sourceType === "VOYAGE";
  const href = isTravel
    ? `/dashboard/travels/${alert.id}`
    : `/dashboard/students/${alert.id}`;

  return (
    <li className="px-4 py-3 transition-colors hover:bg-muted/40">
      <Link href={href} className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
            isTravel
              ? "bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20 ring-inset dark:text-sky-400"
              : "bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 ring-inset dark:text-violet-400"
          )}
        >
          {isTravel ? <PlaneIcon /> : <ReceiptTextIcon />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{alert.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {isTravel ? "Voyage · " : ""}
            {alert.subtitle}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            Reste {formatAmount(alert.remainingAmount)}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            Payé {formatAmount(alert.paidAmount)} /{" "}
            {formatAmount(alert.netAmount)}
          </p>
        </div>
      </Link>
    </li>
  );
}

function UnpaidAlertsList({ alerts }: { alerts: UnpaidAlertDTO[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <UserCheckIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-sm font-medium">Aucun impayé en cours 🎉</p>
        <p className="text-sm text-muted-foreground">
          Tous les étudiants et dossiers de voyage sont à jour de paiement.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {alerts.map((alert) => (
        <UnpaidAlertRow key={`${alert.sourceType}-${alert.id}`} alert={alert} />
      ))}
    </ul>
  );
}

// --------------------------------------
// Vue analytique principale du tableau de bord
// --------------------------------------

/**
 * Tableau de bord analytique : 4 cartes KPI, graphiques Recharts (recettes
 * par source, répartition par niveau, assiduité mensuelle) et listes rapides.
 * Les données sont calculées serveur puis transmises aux composants clients.
 */
export function DashboardOverview({
  stats,
  financialOverview,
  distribution,
  attendanceTrend,
}: DashboardOverviewProps) {
  const { collectedThisMonth, outstanding } = stats;

  const attendanceRateValue =
    stats.monthlyAttendanceRate === null
      ? "—"
      : `${numberFormatter.format(stats.monthlyAttendanceRate)} %`;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Vue d&apos;ensemble
          </h2>
          <p className="text-sm text-muted-foreground">
            Analytique financière, pédagogique et opérationnelle de votre centre.
          </p>
        </div>

        <div
          role="group"
          aria-label="Actions rapides"
          className="flex flex-wrap items-center gap-2"
        >
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/payments">
              <WalletCardsIcon data-icon="inline-start" />
              Paiements
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/travels">
              <PlaneIcon data-icon="inline-start" />
              Voyages
            </Link>
          </Button>
        </div>
      </div>

      {/* Cartes KPI supérieures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Encaissé ce mois"
          value={formatAmount(collectedThisMonth.total)}
          icon={<WalletCardsIcon />}
          iconClasses="bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              Scolarité + Voyages + POS
            </span>
          }
          hint={`Scolarité ${formatAmount(collectedThisMonth.scolarite)} · Voyages ${formatAmount(collectedThisMonth.voyages)} · POS ${formatAmount(collectedThisMonth.pos)}`}
        />

        <KpiCard
          label="Impayés en cours"
          value={formatAmount(outstanding.total)}
          icon={<TriangleAlertIcon />}
          iconClasses="bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 ring-inset dark:text-amber-400"
          badge={
            <span
              className={cn(
                BADGE_BASE_CLASSES,
                outstanding.total > 0
                  ? "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                  : TINTED_BADGE_CLASSES
              )}
            >
              {outstanding.total > 0
                ? `${stats.unpaidAlerts.length} prioritaire${stats.unpaidAlerts.length > 1 ? "s" : ""}`
                : "À jour"}
            </span>
          }
          hint={`Scolarité ${formatAmount(outstanding.scolarite)} · Voyages ${formatAmount(outstanding.voyages)}`}
        />

        <KpiCard
          label="Étudiants actifs"
          value={numberFormatter.format(stats.activeStudentsCount)}
          icon={<UsersRoundIcon />}
          iconClasses="bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20 ring-inset dark:text-sky-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              Inscrits & en formation
            </span>
          }
          hint={`${numberFormatter.format(distribution.totalStudents)} étudiants au total`}
        />

        <KpiCard
          label="Assiduité du mois"
          value={attendanceRateValue}
          icon={<UserCheckIcon />}
          iconClasses="bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 ring-inset dark:text-violet-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              {stats.attendanceEntriesThisMonth > 0
                ? `${numberFormatter.format(stats.attendanceEntriesThisMonth)} émargement${stats.attendanceEntriesThisMonth > 1 ? "s" : ""}`
                : "Aucune donnée"}
            </span>
          }
          hint="Présences effectives (retards inclus)"
        />
      </div>

      {/* La trésorerie / caisse a été déplacée dans une page dédiée :
          /dashboard/tresorerie (solde initial + encaissements − dépenses). */}

      {/* Graphique recettes + donut répartition */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm lg:col-span-2 dark:border-slate-800">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">
              Évolution des recettes mensuelles
            </h3>
            <p className="text-xs text-muted-foreground">
              Ventilation par source sur les 6 derniers mois (FCFA).
            </p>
          </div>
          <div className="p-4">
            <RevenueBarChart data={financialOverview} />
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Répartition par niveau</h3>
            <p className="text-xs text-muted-foreground">
              Apprenants actifs classés A1 → C2.
            </p>
          </div>
          <div className="p-4">
            <StudentDistributionDonut
              slices={distribution.byLevel}
              total={distribution.activeStudents}
            />
          </div>
        </section>
      </div>

      {/* Graphique assiduité mensuelle */}
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Assiduité mensuelle globale</h3>
          <p className="text-xs text-muted-foreground">
            Taux de présence moyen de l&apos;établissement, mois par mois.
          </p>
        </div>
        <div className="p-4">
          <AttendanceLineChart data={attendanceTrend} />
        </div>
      </section>

      {/* Listes rapides : versements & impayés prioritaires */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Derniers versements</h3>
              <p className="text-xs text-muted-foreground">
                Les 5 derniers règlements enregistrés.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/payments">
                Tout voir
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          <RecentPaymentsFeed payments={stats.recentPayments} />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Impayés prioritaires</h3>
              <p className="text-xs text-muted-foreground">
                Les plus gros restes à payer à recouvrer.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/payments">
                Recouvrement
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          <UnpaidAlertsList alerts={stats.unpaidAlerts} />
        </div>
      </div>
    </div>
  );
}




