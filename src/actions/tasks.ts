"use server";

import { type Role, type TaskPriority, type TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, isNextRedirectError } from "@/lib/session";
import { TASK_PRIORITY_RANK } from "@/lib/task-priority";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type StaffMemberDTO = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
};

export type TaskStudentOptionDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
};

export type TaskDTO = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  createdAt: Date;
  assignee: {
    id: string;
    firstName: string;
    lastName: string;
    role: Role;
  } | null;
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type TaskFormField =
  | "title"
  | "description"
  | "priority"
  | "status"
  | "dueDate"
  | "assigneeId"
  | "studentId";

export type TaskFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<TaskFormField, string>>;
};

export type UpdateTaskStatusState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type TaskMutationResult =
  | { ok: true }
  | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const TASK_PRIORITIES: readonly TaskPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
];

const TASK_STATUSES: readonly TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
];

/** Format attendu pour la date d'échéance saisie via `<input type="date">`. */
const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type ParsedTaskInput =
  | {
      ok: true;
      data: {
        title: string;
        description: string | null;
        priority: TaskPriority;
        status: TaskStatus;
        dueDate: Date | null;
        assigneeId: string | null;
        studentId: string | null;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<TaskFormField, string>> };

function parseTaskForm(formData: FormData): ParsedTaskInput {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() || "TODO";
  const rawDueDate = String(formData.get("dueDate") ?? "").trim();
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const studentId = String(formData.get("studentId") ?? "").trim();

  const fieldErrors: Partial<Record<TaskFormField, string>> = {};

  if (!title) {
    fieldErrors.title = "L'intitulé est requis.";
  } else if (title.length > 150) {
    fieldErrors.title = "L'intitulé ne doit pas dépasser 150 caractères.";
  }

  if (description.length > 500) {
    fieldErrors.description =
      "La description ne doit pas dépasser 500 caractères.";
  }

  if (!TASK_PRIORITIES.includes(priority as TaskPriority)) {
    fieldErrors.priority = "La priorité sélectionnée est invalide.";
  }

  if (!TASK_STATUSES.includes(status as TaskStatus)) {
    fieldErrors.status = "Le statut sélectionné est invalide.";
  }

  // `<input type="date">` renvoie « YYYY-MM-DD » ; interprété à minuit UTC
  // pour éviter tout décalage de jour lié au fuseau horaire.
  let dueDate: Date | null = null;
  if (rawDueDate) {
    if (!DATE_INPUT_REGEX.test(rawDueDate)) {
      fieldErrors.dueDate = "La date d'échéance est invalide.";
    } else {
      dueDate = new Date(`${rawDueDate}T00:00:00.000Z`);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      title,
      description: description || null,
      priority: priority as TaskPriority,
      status: status as TaskStatus,
      dueDate,
      assigneeId: assigneeId || null,
      studentId: studentId || null,
    },
  };
}

/**
 * Trie les tâches par priorité décroissante (URGENT → LOW), puis par date
 * d'échéance croissante (les tâches sans échéance en dernier), puis par
 * date de création décroissante.
 */
function sortTasks(tasks: TaskDTO[]): TaskDTO[] {
  return [...tasks].sort((a, b) => {
    const rankDiff =
      TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority];
    if (rankDiff !== 0) return rankDiff;

    if (a.dueDate && b.dueDate) {
      return a.dueDate.getTime() - b.dueDate.getTime();
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;

    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère les tâches de l'organisation active avec les relations
 * `assignee` (membre de l'équipe) et `student` (étudiant concerné),
 * triées par priorité puis date d'échéance.
 */
export async function getTasks(): Promise<TaskDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const tasks = await prisma.task.findMany({
      where: { organizationId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        student: {
          select: {
            id: true,
            studentCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return sortTasks(tasks);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getTasks] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Récupère les membres actifs de l'organisation (tous rôles internes)
 * pour alimenter le Select d'assignation de la modale de création.
 */
export async function getStaffMembers(): Promise<StaffMemberDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    return await prisma.user.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getStaffMembers] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Crée une nouvelle tâche dans l'organisation active.
 * Conçue pour être utilisée avec `useActionState` : reçoit l'état précédent
 * et un `FormData`, retourne un état sérialisable (succès, erreurs, message).
 */
export async function createTaskAction(
  _prevState: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const parsed = parseTaskForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // L'auteur de la tâche est l'utilisateur connecté.
    const session = await auth();
    const createdById = session?.user?.id;

    if (!organizationId || !createdById) {
      return {
        status: "error",
        message: "Session invalide : impossible d'identifier l'auteur.",
      };
    }

    // Vérifie que l'assigné appartient bien à l'organisation active
    // (isolation multi-tenant).
    if (parsed.data.assigneeId) {
      const assignee = await prisma.user.findFirst({
        where: { id: parsed.data.assigneeId, organizationId },
        select: { id: true },
      });

      if (!assignee) {
        return {
          status: "error",
          message: "Membre introuvable dans votre organisation.",
          fieldErrors: { assigneeId: "Membre introuvable." },
        };
      }
    }

    // Vérifie que l'étudiant associé appartient bien à l'organisation active.
    if (parsed.data.studentId) {
      const student = await prisma.student.findFirst({
        where: { id: parsed.data.studentId, organizationId },
        select: { id: true },
      });

      if (!student) {
        return {
          status: "error",
          message: "Étudiant introuvable dans votre organisation.",
          fieldErrors: { studentId: "Étudiant introuvable." },
        };
      }
    }

    await prisma.task.create({
      data: {
        organizationId,
        createdById,
        assigneeId: parsed.data.assigneeId,
        studentId: parsed.data.studentId,
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate,
      },
    });

    revalidatePath("/dashboard/tasks");

    return {
      status: "success",
      message: "Tâche créée avec succès.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createTaskAction] Échec de création :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la création de la tâche.",
    };
  }
}

/**
 * Met à jour le statut d'une tâche existante (changement rapide depuis le
 * Kanban ou la vue liste). Vérifie l'appartenance à l'organisation active.
 */
export async function updateTaskStatusAction(
  taskId: string,
  status: string
): Promise<UpdateTaskStatusState> {
  if (!TASK_STATUSES.includes(status as TaskStatus)) {
    return {
      status: "error",
      message: "Le statut sélectionné est invalide.",
    };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : la tâche doit appartenir à l'organisation active.
    const task = await prisma.task.findFirst({
      where: { id: taskId, organizationId },
      select: { id: true },
    });

    if (!task) {
      return {
        status: "error",
        message: "Tâche introuvable dans votre organisation.",
      };
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: status as TaskStatus },
    });

    revalidatePath("/dashboard/tasks");

    return {
      status: "success",
      message: "Statut mis à jour.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[updateTaskStatusAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la mise à jour du statut.",
    };
  }
}

/**
 * Met à jour une tâche existante de l'organisation active.
 * Conçue pour être utilisée avec `useActionState` : reçoit l'état précédent
 * et un `FormData` (incluant le champ caché `id`), retourne un état sérialisable.
 */
export async function updateTaskAction(
  _prevState: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const taskId = String(formData.get("id") ?? "").trim();

  if (!taskId) {
    return {
      status: "error",
      message: "Identifiant de la tâche manquant.",
    };
  }

  const parsed = parseTaskForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : la tâche doit appartenir à l'organisation active.
    const existing = await prisma.task.findFirst({
      where: { id: taskId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Tâche introuvable dans votre organisation.",
      };
    }

    // Vérifie que l'assigné appartient bien à l'organisation active.
    if (parsed.data.assigneeId) {
      const assignee = await prisma.user.findFirst({
        where: { id: parsed.data.assigneeId, organizationId },
        select: { id: true },
      });

      if (!assignee) {
        return {
          status: "error",
          message: "Membre introuvable dans votre organisation.",
          fieldErrors: { assigneeId: "Membre introuvable." },
        };
      }
    }

    // Vérifie que l'étudiant associé appartient bien à l'organisation active.
    if (parsed.data.studentId) {
      const student = await prisma.student.findFirst({
        where: { id: parsed.data.studentId, organizationId },
        select: { id: true },
      });

      if (!student) {
        return {
          status: "error",
          message: "Étudiant introuvable dans votre organisation.",
          fieldErrors: { studentId: "Étudiant introuvable." },
        };
      }
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        priority: parsed.data.priority,
        status: parsed.data.status,
        dueDate: parsed.data.dueDate,
        assigneeId: parsed.data.assigneeId,
        studentId: parsed.data.studentId,
      },
    });

    revalidatePath("/dashboard/tasks");

    return {
      status: "success",
      message: "Tâche mise à jour avec succès.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[updateTaskAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la mise à jour de la tâche.",
    };
  }
}

/**
 * Supprime une tâche de l'organisation active.
 */
export async function deleteTaskAction(
  taskId: string
): Promise<TaskMutationResult> {
  if (!taskId) {
    return { ok: false, message: "Identifiant de la tâche manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : la tâche doit appartenir à l'organisation active.
    const existing = await prisma.task.findFirst({
      where: { id: taskId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Tâche introuvable dans votre organisation.",
      };
    }

    await prisma.task.delete({ where: { id: taskId } });

    revalidatePath("/dashboard/tasks");

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteTaskAction] Échec de suppression :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression de la tâche.",
    };
  }
}
