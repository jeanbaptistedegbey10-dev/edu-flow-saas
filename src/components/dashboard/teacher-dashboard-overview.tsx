import Link from "next/link";
import {
  ArrowRightIcon,
  AwardIcon,
  BookOpenIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  UserCheckIcon,
  UsersRoundIcon,
} from "lucide-react";

import { TeacherGradeTrendChart } from "@/components/dashboard/charts/teacher-grade-trend-chart";
import type { TeacherDashboardStatsDTO } from "@/actions/dashboard";
import type { AttendanceStatus } from "@prisma/client";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import {
  getAttendanceStatusBadgeClass,
  getAttendanceStatusLabel,
} from "@/lib/attendance-status";
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

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Style moderne des badges ponctuels du tableau de bord. */
const TINTED_BADGE_CLASSES =
  "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400";

/**
 * Tableau de bord pédagogique de l'enseignant : ses cours, ses étudiants,
 * son cahier de texte, l'assiduité et les évaluations. AUCUNE donnée
 * financière n'est affichée ici.
 */
export function TeacherDashboardOverview({
  stats,
}: {
  stats: TeacherDashboardStatsDTO;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête : bienvenue + raccourcis pédagogiques */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Espace enseignant
          </h2>
          <p className="text-sm text-muted-foreground">
            Bienvenue sur EduFlow 👋 Retrouvez vos cours, vos émargements et
            votre cahier de texte.
          </p>
        </div>

        <div
          role="group"
          aria-label="Raccourcis rapides"
          className="flex flex-wrap items-center gap-2"
        >
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/courses">
              <BookOpenIcon data-icon="inline-start" className="text-indigo-600 dark:text-indigo-400" />
              Mes cours
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/attendance">
              <UserCheckIcon data-icon="inline-start" className="text-emerald-600 dark:text-emerald-400" />
              Prendre les présences
            </Link>
          </Button>
        </div>
      </div>

      {/* Cartes KPI pédagogiques (aucune donnée financière) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Mes cours"
          value={numberFormatter.format(stats.myCoursesCount)}
          icon={<BookOpenIcon />}
          iconClasses="bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 ring-inset dark:text-violet-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              Assignés
            </span>
          }
          hint="Cours qui vous sont confiés"
        />

        <KpiCard
          label="Mes étudiants"
          value={numberFormatter.format(stats.myStudentsCount)}
          icon={<UsersRoundIcon />}
          iconClasses="bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20 ring-inset dark:text-sky-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              Inscrits
            </span>
          }
          hint="Inscriptions cumulées à vos cours"
        />

        <KpiCard
          label="Assiduité du mois"
          value={
            stats.monthlyAttendanceRate === null
              ? "—"
              : `${numberFormatter.format(stats.monthlyAttendanceRate)} %`
          }
          icon={<UserCheckIcon />}
          iconClasses="bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              {stats.attendanceEntriesThisMonth > 0
                ? `${numberFormatter.format(stats.attendanceEntriesThisMonth)} émargement${
                    stats.attendanceEntriesThisMonth > 1 ? "s" : ""
                  }`
                : "Aucune donnée"}
            </span>
          }
          hint="Présences effectives de vos cours ce mois-ci"
        />

        <KpiCard
          label="Évaluations"
          value={numberFormatter.format(stats.evaluationsCount)}
          icon={<AwardIcon />}
          iconClasses="bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 ring-inset dark:text-amber-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              {stats.averageScore === null
                ? "Moyenne —"
                : `Moyenne ${numberFormatter.format(stats.averageScore)} /100`}
            </span>
          }
          hint="Sessions internes rattachées à vos classes"
        />
      </div>

      {/* Section Mes cours + dernières entrées du cahier de texte */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Mes cours</h3>
              <p className="text-xs text-muted-foreground">
                Les formations qui vous sont assignées.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/courses">
                Tout voir
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>

          {stats.courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <BookOpenIcon className="size-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="text-sm font-medium">Aucun cours assigné</p>
              <p className="text-sm text-muted-foreground">
                Contactez l’administration pour qu’un cours vous soit attribué.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {stats.courses.map((course) => (
                <li key={course.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <GraduationCapIcon className="size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/courses/${course.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {course.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {course.code} · {course.enrollmentCount} étudiant
                      {course.enrollmentCount > 1 ? "s" : ""}
                    </p>
                  </div>

                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/courses/${course.id}`}>
                      Ouvrir
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">
                Dernières séances consignées
              </h3>
              <p className="text-xs text-muted-foreground">
                Les 5 dernières entrées du cahier de texte.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/attendance">
                Tout voir
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>

          {stats.recentLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <ClipboardListIcon className="size-5 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="text-sm font-medium">Cahier de texte vide</p>
              <p className="text-sm text-muted-foreground">
                Consignez votre première séance depuis la fiche d’un cours.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {stats.recentLogs.map((log) => (
                <li key={log.id} className="px-4 py-3">
                  <p className="truncate text-sm font-medium">
                    {log.chapterTitle}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {log.courseTitle} · {dateFormatter.format(log.date)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Courbe d'évolution des notes par élève / classe */}
      <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">
              Évolution des notes par élève / classe
            </h3>
            <p className="text-xs text-muted-foreground">
              Moyenne /100 de chaque étudiant au fil des évaluations.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/evaluations">
              Évaluations
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
        <div className="p-4">
          <TeacherGradeTrendChart students={stats.gradeTrend} />
        </div>
      </section>

      {/* Feuille de présence récente */}
      <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Feuille de présence</h3>
            <p className="text-xs text-muted-foreground">
              Les 8 derniers émargements de vos cours.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/attendance">
              Tout voir
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>

        {stats.attendanceSheet.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <UserCheckIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-medium">Aucun émargement</p>
            <p className="text-sm text-muted-foreground">
              Prenez les présences depuis « Présences &amp; Cahier de texte ».
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {stats.attendanceSheet.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.studentName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.className ?? "—"} · {dateFormatter.format(row.date)}
                  </p>
                </div>
                <span
                  className={cn(
                    BADGE_BASE_CLASSES,
                    getAttendanceStatusBadgeClass(row.status as AttendanceStatus)
                  )}
                >
                  {getAttendanceStatusLabel(row.status as AttendanceStatus)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Rappel discret du module pédagogique */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserCheckIcon className="size-3.5" aria-hidden="true" />
        Astuce : émargez vos étudiants depuis « Présences & Cahier de texte »,
        puis consignez chaque séance dans le cahier de texte du cours.
      </p>
    </div>
  );
}