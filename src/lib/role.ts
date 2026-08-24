import type { Role } from "@prisma/client";

/** Libellés français des rôles applicatifs. */
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrateur",
  STAFF: "Personnel",
  TEACHER: "Enseignant",
  STUDENT: "Étudiant",
};

/**
 * Classes Tailwind des badges de rôle — style moderne : fond clair
 * translucide, texte assorti et fine bordure (variante sombre incluse).
 */
export const ROLE_BADGE_CLASSES: Record<Role, string> = {
  SUPER_ADMIN:
    "border border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400",
  ADMIN:
    "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  TEACHER:
    "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  STAFF:
    "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  STUDENT:
    "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
};

export function getRoleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

export function getRoleBadgeClass(role: Role): string {
  return ROLE_BADGE_CLASSES[role];
}