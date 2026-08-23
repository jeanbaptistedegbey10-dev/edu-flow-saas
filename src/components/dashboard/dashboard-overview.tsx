import Link from "next/link";
import {
  ArrowRightIcon,
  BanknoteIcon,
  BookOpenIcon,
  PlaneIcon,
  ReceiptTextIcon,
  UserPlusIcon,
  UserRoundIcon,
  UsersRoundIcon,
  WalletCardsIcon,
} from "lucide-react";

import type {
  DashboardStatsDTO,
  RecentPaymentDTO,
  RecentStudentDTO,
} from "@/actions/dashboard";
import { Button } from "@/components/ui/button";
import {
  getPaymentMethodLabel,
  getPaymentStatusBadgeClass,
  getPaymentStatusLabel,
} from "@/lib/payment-status";
import {
  getStudentStatusBadgeClass,
  getStudentStatusLabel,
} from "@/lib/student-status";
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

/** Initiales affichées dans l'avatar rond des listes « Récents ». */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

// --------------------------------------
// Carte KPI
// --------------------------------------

type KpiCardProps = {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconClasses: string;
  badge?: React.ReactNode;
  hint: string;
};

function KpiCard({ label, value, icon, iconClasses, badge, hint }: KpiCardProps) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5",
            iconClasses
          )}
        >
          {icon}
        </div>
      </div>
      <div className="px-5">
        <p className="text-2xl font-bold tracking-tight md:text-3xl">{value}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-5 py-3">
        {badge}
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}

// --------------------------------------
// Listes « Récents »
// --------------------------------------

function RecentStudentsList({ students }: { students: RecentStudentDTO[] }) {
  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <UsersRoundIcon className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Aucun étudiant pour le moment</p>
        <p className="text-sm text-muted-foreground">
          Utilisez le raccourci « Ajouter un étudiant » pour commencer.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {students.map((student) => (
        <li key={student.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {getInitials(student.firstName, student.lastName)}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {student.firstName} {student.lastName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {student.studentCode} · ajouté le{" "}
              {dateFormatter.format(student.createdAt)}
            </p>
          </div>

          <span
            className={cn(
              BADGE_BASE_CLASSES,
              getStudentStatusBadgeClass(student.status)
            )}
          >
            {getStudentStatusLabel(student.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecentPaymentsFeed({ payments }: { payments: RecentPaymentDTO[] }) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <WalletCardsIcon className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Aucun règlement enregistré</p>
        <p className="text-sm text-muted-foreground">
          Utilisez le raccourci « Enregistrer un paiement » pour commencer.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {payments.map((payment) => (
        <li key={payment.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <ReceiptTextIcon className="size-4" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {formatAmount(payment.amount)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                · {getPaymentMethodLabel(payment.paymentMethod)}
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {payment.student.firstName} {payment.student.lastName} (
              {payment.student.studentCode}) ·{" "}
              {dateFormatter.format(payment.paidAt)}
            </p>
          </div>

          <span
            className={cn(
              BADGE_BASE_CLASSES,
              getPaymentStatusBadgeClass(payment.status)
            )}
          >
            {getPaymentStatusLabel(payment.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// --------------------------------------
// Vue d'ensemble du tableau de bord
// --------------------------------------

export function DashboardOverview({ stats }: { stats: DashboardStatsDTO }) {
  const { totalStudents, enrolledStudents, prospects } = stats;

  // Taux de conversion des prospects en inscrits (protection division par zéro).
  const conversionRate =
    totalStudents > 0 ? Math.round((enrolledStudents / totalStudents) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête : bienvenue + raccourcis rapides */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Vue d’ensemble</h2>
          <p className="text-sm text-muted-foreground">
            Bienvenue sur EduFlow 👋 Suivez l’activité de votre centre en un
            coup d’œil.
          </p>
        </div>

        <div
          role="group"
          aria-label="Raccourcis rapides"
          className="flex flex-wrap items-center gap-2"
        >
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/students">
              <UserPlusIcon data-icon="inline-start" />
              Ajouter un étudiant
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/payments">
              <BanknoteIcon data-icon="inline-start" />
              Enregistrer un paiement
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/travels">
              <PlaneIcon data-icon="inline-start" />
              Nouveau dossier de voyage
            </Link>
          </Button>
        </div>
      </div>

      {/* Cartes KPI */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Étudiants"
          value={numberFormatter.format(totalStudents)}
          icon={<UsersRoundIcon />}
          iconClasses="bg-sky-500/15 text-sky-700 dark:text-sky-400"
          badge={
            <span
              className={cn(BADGE_BASE_CLASSES, "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400")}
            >
              {conversionRate}% inscrits
            </span>
          }
          hint={`dont ${numberFormatter.format(prospects)} prospect${prospects > 1 ? "s" : ""}`}
        />

        <KpiCard
          label="Chiffre d'Affaires"
          value={formatAmount(stats.totalRevenue)}
          icon={<BanknoteIcon />}
          iconClasses="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          badge={
            <span
              className={cn(BADGE_BASE_CLASSES, "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400")}
            >
              Encaissé
            </span>
          }
          hint="Règlements au statut « Payé »"
        />

        <KpiCard
          label="Dossiers Visa en cours"
          value={numberFormatter.format(stats.activeTravelFiles)}
          icon={<PlaneIcon />}
          iconClasses="bg-amber-500/15 text-amber-700 dark:text-amber-400"
          badge={
            <span
              className={cn(
                BADGE_BASE_CLASSES,
                stats.activeTravelFiles > 0
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : "bg-slate-500/15 text-slate-700 dark:text-slate-400"
              )}
            >
              {stats.activeTravelFiles > 0 ? "En traitement" : "Aucun actif"}
            </span>
          }
          hint="Candidatures envoyées & demandes de visa"
        />

        <KpiCard
          label="Formations actives"
          value={numberFormatter.format(stats.activeCourses)}
          icon={<BookOpenIcon />}
          iconClasses="bg-violet-500/15 text-violet-700 dark:text-violet-400"
          badge={
            <span
              className={cn(BADGE_BASE_CLASSES, "bg-violet-500/15 text-violet-700 dark:text-violet-400")}
            >
              Au catalogue
            </span>
          }
          hint="Cours proposés aux étudiants"
        />
      </div>

      {/* Section Récents : derniers étudiants & fil des règlements */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Derniers étudiants</h3>
              <p className="text-xs text-muted-foreground">
                Les 5 dernières inscriptions enregistrées.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/students">
                Tout voir
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          <RecentStudentsList students={stats.recentStudents} />
        </div>

        <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Derniers règlements</h3>
              <p className="text-xs text-muted-foreground">
                Le fil des 5 derniers paiements enregistrés.
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
      </div>

      {/* Rappel discret du module voyage */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserRoundIcon className="size-3.5" aria-hidden="true" />
        Astuce : chaque dossier de voyage peut être suivi étape par étape depuis
        la section « Voyages ».
      </p>
    </div>
  );
}