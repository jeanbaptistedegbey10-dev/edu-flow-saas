"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarCheckIcon,
  ClockIcon,
  DoorOpenIcon,
  GraduationCapIcon,
  UsersRoundIcon,
} from "lucide-react";

import type { ClassDetailDTO } from "@/actions/classes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

const CLASS_STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  ACTIVE: {
    label: "Active",
    classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  COMPLETED: {
    label: "Clôturée",
    classes: "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300",
  },
  ARCHIVED: {
    label: "Archivée",
    classes: "bg-muted text-muted-foreground",
  },
};


// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function formatPrice(value: number | null): string {
  if (value === null) return "Prix du cours";
  return `${amountFormatter.format(value)} FCFA`;
}

/**
 * Vue détaillée d'une classe : informations, liste des étudiants inscrits
 * et accès aux présences & cahier de texte.
 */
export function ClassDetailView({ detail }: { detail: ClassDetailDTO }) {
  const studentCount = detail.students.length;
  const statusBadge =
    CLASS_STATUS_BADGES[detail.status] ?? CLASS_STATUS_BADGES.ACTIVE;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/classes"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background p-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {detail.name}
              <span className={cn(BADGE_BASE_CLASSES, statusBadge.classes)}>
                {statusBadge.label}
              </span>
            </h2>
            <p className="text-base text-muted-foreground">
              {detail.courseTitle} ({detail.courseCode})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {detail.status === "ACTIVE" && (
            <Link href={`/dashboard/classes/${detail.id}/close`}>
              <Button variant="outline">
                <DoorOpenIcon data-icon="inline-start" />
                Clôturer la classe
              </Button>
            </Link>
          )}
          <Link href="/dashboard/attendance">
            <Button>
              <CalendarCheckIcon data-icon="inline-start" />
              Présences & Cahier de texte
            </Button>
          </Link>
        </div>
      </div>

      {/* Informations de la classe */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClockIcon className="size-4" />
            <span className="text-sm">Créneau</span>
          </div>
          <p className="mt-1 font-semibold">{detail.schedule}</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GraduationCapIcon className="size-4" />
            <span className="text-sm">Enseignant</span>
          </div>
          <p className="mt-1 font-semibold">
            {detail.teacherName ?? "Non attribué"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UsersRoundIcon className="size-4" />
            <span className="text-sm">Étudiants</span>
          </div>
          <p className="mt-1 font-semibold">
            {studentCount} inscrit{studentCount > 1 ? "s" : ""}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm">Frais de scolarité</span>
          </div>
          <p className="mt-1 font-semibold">{formatPrice(detail.tuitionFee)}</p>
        </div>
      </div>

      {/* Liste des étudiants inscrits */}
      <div className="rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
        <div className="border-b p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <UsersRoundIcon className="size-4" />
            Étudiants inscrits
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {studentCount} étudiant{studentCount > 1 ? "s" : ""} dans cette classe
          </p>
        </div>

        {studentCount === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun étudiant n&apos;est encore inscrit à cette classe.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {detail.students.map((student) => (
              <li
                key={student.studentId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {student.firstName} {student.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {student.studentCode}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}