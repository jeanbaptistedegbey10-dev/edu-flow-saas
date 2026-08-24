"use server";

import type { TaskPriority, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type CalendarTaskDTO = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  assignee: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère les échéances de l'organisation active :
 * - les tâches datées (dueDate non nulle),
 * - classées du plus proche au plus lointain.
 *
 * Nourrit la vue calendrier/agenda du dashboard.
 */
export async function getCalendarEvents(): Promise<CalendarTaskDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  const tasks = await prisma.task.findMany({
    where: {
      organizationId,
      dueDate: { not: null },
    },
    orderBy: [{ dueDate: "asc" }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return tasks.map((task) => ({
    ...task,
    dueDate: task.dueDate,
  }));
}