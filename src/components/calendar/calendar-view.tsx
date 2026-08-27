"use client";

import * as React from "react";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  CircleIcon,
  ClockIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";

import type { CalendarTaskDTO } from "@/actions/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getTaskPriorityBadgeClass,
  getTaskPriorityLabel,
} from "@/lib/task-priority";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation. Les échéances sont stockées à minuit UTC.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Initiales affichées dans les puces d'assignation. */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function isOverdue(task: CalendarTaskDTO): boolean {
  if (!task.dueDate || task.status === "DONE") return false;

  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  return task.dueDate.getTime() < todayUtc;
}

function isTodayKey(dayKey: string): boolean {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  return dayKey === todayKey;
}

/** Regroupe les échéances par jour (clé UTC `YYYY-MM-DD`). */
function groupEventsByDay(events: CalendarTaskDTO[]): Map<string, CalendarTaskDTO[]> {
  const grouped = new Map<string, CalendarTaskDTO[]>();

  for (const event of events) {
    if (!event.dueDate) continue;

    const key = event.dueDate.toISOString().slice(0, 10);

    const dayEvents = grouped.get(key) ?? [];
    dayEvents.push(event);
    grouped.set(key, dayEvents);
  }

  return grouped;
}

export function CalendarView({ events }: { events: CalendarTaskDTO[] }) {
  const grouped = React.useMemo(() => groupEventsByDay(events), [events]);

  // Tri les jours du plus proche au plus lointain.
  const days = React.useMemo(
    () => [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [grouped]
  );

  const totalCount = events.length;
  const overdueCount = events.filter(
    (event) => isOverdue(event) && event.status !== "DONE"
  ).length;
  const upcomingCount = events.filter(
    (event) => event.dueDate && !isOverdue(event)
  ).length;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Calendrier</h2>
          <p className="text-base text-muted-foreground">
            Regroupez les échéances des tâches et événements de votre équipe.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/tasks">
            Gérer les tâches
            <CalendarDaysIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>

      {/* Cartes de synthèse */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Échéances prévues
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight md:text-[1.75rem] md:leading-8">
                {totalCount}
              </p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 shadow-sm ring-1 ring-sky-500/20 ring-inset [&_svg]:size-5 dark:text-sky-400">
              <CalendarDaysIcon />
            </div>
          </div>
          <div className="flex items-center gap-x-2 border-t px-5 py-3">
            <span className="text-xs text-muted-foreground">
              Tâches datées du planning
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                À venir
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight md:text-[1.75rem] md:leading-8">
                {upcomingCount}
              </p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 shadow-sm ring-1 ring-emerald-500/20 ring-inset [&_svg]:size-5 dark:text-emerald-400">
              <ClockIcon />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t px-5 py-3">
            <span className="text-xs text-muted-foreground">
              Échéances aujourd’hui et après
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                En retard
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight md:text-[1.75rem] md:leading-8">
                {overdueCount}
              </p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 shadow-sm ring-1 ring-rose-500/20 ring-inset [&_svg]:size-5 dark:text-rose-400">
              <TriangleAlertIcon />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t px-5 py-3">
            <span className="text-xs text-muted-foreground">
              Échéances dépassées non terminées
            </span>
          </div>
        </div>
      </div>

      {/* Agenda par jour */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        {days.length > 0 ? (
          <div className="divide-y">
            {days.map(([dayKey, dayEvents]) => {
              const dayDate = new Date(`${dayKey}T00:00:00.000Z`);
              const isTodayDay = isTodayKey(dayKey);

              return (
                <section
                  key={dayKey}
                  aria-label={dateFormatter.format(dayDate)}
                  className="p-4 md:p-5"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold tracking-wide uppercase",
                        isTodayDay
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {dateFormatter.format(dayDate)}
                    </span>
                    {isTodayDay ? (
                      <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Aujourd’hui
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {dayEvents.length} échéance
                      {dayEvents.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  <ul className="grid gap-2">
                    {dayEvents.map((event) => {
                      const overdue = isOverdue(event);
                      const done = event.status === "DONE";

                      return (
                        <li
                          key={event.id}
                          className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 transition-colors hover:bg-muted/40 dark:border-slate-800 dark:bg-card"
                        >
                          {done ? (
                            <CheckCircle2Icon
                              className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                          ) : overdue ? (
                            <TriangleAlertIcon
                              className="size-4 shrink-0 text-red-600 dark:text-red-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <CircleIcon
                              className="size-4 shrink-0 text-muted-foreground/50"
                              aria-hidden="true"
                            />
                          )}

                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {event.title}
                          </span>

                          <span
                            className={cn(
                              BADGE_BASE_CLASSES,
                              getTaskPriorityBadgeClass(event.priority)
                            )}
                          >
                            {getTaskPriorityLabel(event.priority)}
                          </span>

                          {event.assignee ? (
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                {getInitials(
                                  event.assignee.firstName,
                                  event.assignee.lastName
                                )}
                              </span>
                              <span className="hidden sm:inline">
                                {event.assignee.firstName}{" "}
                                {event.assignee.lastName}
                              </span>
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <CalendarDaysIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Aucune échéance planifiée</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Créez des tâches avec une date d’échéance pour les retrouver
              ici dans votre agenda.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/dashboard/tasks">
                <CalendarDaysIcon data-icon="inline-start" />
                Aller aux tâches
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}