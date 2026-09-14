import { Suspense } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  SmartphoneIcon,
  TrendingUpIcon,
  UserXIcon,
} from "lucide-react";

import type { AttendanceOverviewStatsDTO } from "@/actions/attendance";
import type { TeacherClassDTO } from "@/actions/attendance";
import { ClassAttendanceView } from "@/components/attendance/class-attendance-view";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("fr-FR");

export function AttendanceOverview({
  classes,
  stats,
}: {
  classes: TeacherClassDTO[];
  stats: AttendanceOverviewStatsDTO;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Cartes KPI */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Taux du jour"
          value={stats.todayRate !== null ? `${stats.todayRate} %` : "—"}
          icon={<TrendingUpIcon />}
          iconClasses="bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400"
          badge={
            stats.todayTotal > 0 ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                {stats.todayTotal} émargement{stats.todayTotal > 1 ? "s" : ""}
              </span>
            ) : undefined
          }
          hint="PRESENT + LATE / total aujourd'hui"
        />

        <KpiCard
          label="Présents"
          value={numberFormatter.format(stats.todayPresent)}
          icon={<CheckCircle2Icon />}
          iconClasses="bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400"
          hint="Présents et retards confondus"
        />

        <KpiCard
          label="Absents"
          value={numberFormatter.format(stats.todayAbsent)}
          icon={<UserXIcon />}
          iconClasses="bg-red-500/10 text-red-700 ring-1 ring-red-500/20 ring-inset dark:text-red-400"
          badge={
            stats.todayLate > 0 ? (
              <span className="inline-flex items-center rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <ClockIcon className="mr-1 size-3" />
                {stats.todayLate} retard{stats.todayLate > 1 ? "s" : ""}
              </span>
            ) : undefined
          }
          hint="Absences non justifiées"
        />

        <KpiCard
          label="Taux du mois"
          value={stats.monthRate !== null ? `${stats.monthRate} %` : "—"}
          icon={<TrendingUpIcon />}
          iconClasses="bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 ring-inset dark:text-violet-400"
          badge={
            stats.monthTotal > 0 ? (
              <span className="inline-flex items-center rounded-full border border-violet-200/60 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400">
                {stats.monthTotal} émargement{stats.monthTotal > 1 ? "s" : ""}
              </span>
            ) : undefined
          }
          hint="Assiduité cumulée du mois"
        />
      </div>

      {/* Alerte absences élevées */}
      {stats.studentsWithHighAbsence.length > 0 && (
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangleIcon className="size-4" />
            <h3 className="text-sm font-semibold">
              Alerte absences élevées ({stats.studentsWithHighAbsence.length})
            </h3>
          </div>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400/80">
            Élèves avec plus de 3 absences non justifiées :
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.studentsWithHighAbsence.map((s) => (
              <span
                key={s.studentId}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-background px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:text-amber-400"
              >
                {s.studentName}
                <span className="rounded-full bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-bold dark:bg-amber-500/20">
                  {s.absenceCount}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lien vers la feuille d'appel mobile */}
      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">Feuille d&apos;appel rapide</h3>
          <p className="text-xs text-muted-foreground">
            Interface mobile-friendly pour saisir les présences en classe.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/attendance/sheet">
            <SmartphoneIcon data-icon="inline-start" />
            Ouvrir la feuille
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>

      {/* Vue détaillée existante */}
      {/* Suspense requis : `ClassAttendanceView` lit `useSearchParams` (classId). */}
      <Suspense
        fallback={
          <div className="py-8 text-center text-sm text-muted-foreground">
            Chargement des présences...
          </div>
        }
      >
        <ClassAttendanceView classes={classes} />
      </Suspense>
    </div>
  );
}
