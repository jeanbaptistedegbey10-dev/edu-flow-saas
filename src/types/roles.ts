/**
 * Types publics pour les actions et composants liés aux rôles et membres.
 *
 * Ce fichier centralise les types partagés entre le serveur (actions)
 * et le client (composants) pour la gestion des rôles personnalisés
 * et des membres de l'organisation.
 */

/** Rôle personnalisé tel qu'affiché dans l'interface de gestion. */
export type CustomRoleDTO = {
  id: string;
  name: string;
  description: string | null;
  /** Clés de permissions accordées (catalogue `ROLE_PERMISSIONS`). */
  permissions: string[];
  /** Rôle pré-configuré : sa suppression est interdite. */
  isSystem: boolean;
  /** Nombre d'utilisateurs portant ce rôle. */
  userCount: number;
};

/**
 * Utilisateur de l'organisation affiché dans le tableau « Attribution aux
 * utilisateurs ». Les comptes ADMIN / SUPER_ADMIN y figurent également (avec
 * une mention fixe côté interface) : ils ne sont pas éligibles à un rôle
 * personnalisé (`customRoleId` reste null pour eux).
 */
export type RoleUserDTO = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Rôle applicatif de base (enum Prisma `Role`). */
  role: string;
  customRoleId: string | null;
  customRoleName: string | null;
};

/** Données complètes de la page Rôles & Permissions. */
export type RolesOverview = {
  roles: CustomRoleDTO[];
  users: RoleUserDTO[];
};

/** État sérialisable du formulaire de création / édition d'un rôle. */
export type RoleFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/** État sérialisable du formulaire d'ajout / édition d'un membre. */
export type MemberFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    role?: string;
  };
};

/** Résultat d'une opération sur un membre. */
export type MemberActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };
