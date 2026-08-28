"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

// --------------------------------------
// Rôles personnalisés (matrice de permissions)
// --------------------------------------
//
// Permet à l'administrateur de créer ses propres rôles (ex : « Secrétaire
// Adjoint ») et de leur associer des permissions simples via une matrice de
// cases à cocher. Chaque permission est une clé stable issue du catalogue
// `ROLE_PERMISSIONS` (src/lib/permissions.ts) et stockée dans la colonne
// `CustomRole.permissions` (String[] PostgreSQL).
//
// Sécurité : toutes les mutations sont réservées aux administrateurs
// (ADMIN / SUPER_ADMIN) et systématiquement bornées à l'organisation de
// l'utilisateur connecté (isolation multi-tenant).

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

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

/** Utilisateur éligible à l'attribution d'un rôle personnalisé. */
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

const ROLES_PATH = "/dashboard/settings/roles";
const VALID_PERMISSION_KEYS = new Set(
  ROLE_PERMISSIONS.map((permission) => permission.key)
);

// --------------------------------------
// Helpers internes
// --------------------------------------

/**
 * Résout le contexte administrateur revalidé contre la base : lève une erreur
 * explicite si la session est invalide ou si le compte n'est pas administrateur.
 */
async function requireAdminContext() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Session invalide : veuillez vous reconnecter.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, organizationId: true },
  });

  if (!user) {
    throw new Error("Compte introuvable : votre session a expiré.");
  }

  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Action réservée aux administrateurs de l'établissement.");
  }

  return user;
}

/** Filtre et dé-duplique les clés de permissions reçues du formulaire. */
function sanitizePermissionKeys(raw: FormDataEntryValue[]): string[] {
  const keys = raw
    .map((value) => String(value))
    .filter((key) => VALID_PERMISSION_KEYS.has(key));

  return Array.from(new Set(keys));
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Charge les rôles personnalisés et les utilisateurs éligibles de
 * l'organisation connectée (réservé aux administrateurs).
 */
export async function getRolesOverview(): Promise<RolesOverview> {
  const admin = await requireAdminContext();

  try {
    const [roles, users] = await Promise.all([
      prisma.customRole.findMany({
        where: { organizationId: admin.organizationId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          permissions: true,
          isSystem: true,
          _count: { select: { users: true } },
        },
      }),
      prisma.user.findMany({
        where: { organizationId: admin.organizationId },
        orderBy: [{ role: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          customRole: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      roles: roles.map(({ _count, ...role }) => ({
        ...role,
        userCount: _count.users,
      })),
      // Les administrateurs disposent déjà de toutes les permissions : seuls
      // les comptes STAFF / TEACHER sont éligibles à un rôle personnalisé.
      users: users
        .filter((user) => user.role === "STAFF" || user.role === "TEACHER")
        .map(({ customRole, ...user }) => ({
          ...user,
          customRoleId: customRole?.id ?? null,
          customRoleName: customRole?.name ?? null,
        })),
    };
  } catch (error) {
    console.error("[getRolesOverview] Échec de lecture :", error);
    throw new Error("Impossible de charger les rôles pour le moment.");
  }
}

/**
 * Crée ou met à jour un rôle personnalisé (selon la présence de `roleId`).
 * Conçue pour `useActionState` : reçoit l'état précédent et un `FormData`,
 * retourne un état sérialisable.
 */
export async function saveCustomRoleAction(
  _prevState: RoleFormState,
  formData: FormData
): Promise<RoleFormState> {
  const roleId = String(formData.get("roleId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const permissions = sanitizePermissionKeys(formData.getAll("permissions"));

  if (!name) {
    return { status: "error", message: "Le nom du rôle est requis." };
  }
  if (name.length > 60) {
    return {
      status: "error",
      message: "Le nom du rôle ne doit pas dépasser 60 caractères.",
    };
  }
  if (description.length > 200) {
    return {
      status: "error",
      message: "La description ne doit pas dépasser 200 caractères.",
    };
  }

  try {
    const admin = await requireAdminContext();

    if (roleId) {
      // Mise à jour : le rôle doit appartenir à l'organisation de l'admin.
      const existing = await prisma.customRole.findFirst({
        where: { id: roleId, organizationId: admin.organizationId },
        select: { id: true },
      });

      if (!existing) {
        return {
          status: "error",
          message: "Rôle introuvable ou appartenant à une autre organisation.",
        };
      }

      await prisma.customRole.update({
        where: { id: roleId },
        data: {
          name,
          description: description || null,
          permissions,
        },
      });

      revalidatePath(ROLES_PATH);
      return { status: "success", message: `Rôle « ${name} » mis à jour.` };
    }

    // Création : nom unique au sein de l'organisation (insensible à la casse).
    const duplicate = await prisma.customRole.findFirst({
      where: {
        organizationId: admin.organizationId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (duplicate) {
      return {
        status: "error",
        message: `Un rôle nommé « ${name} » existe déjà pour votre établissement.`,
      };
    }

    await prisma.customRole.create({
      data: {
        organizationId: admin.organizationId,
        name,
        description: description || null,
        permissions,
      },
    });

    revalidatePath(ROLES_PATH);
    return { status: "success", message: `Rôle « ${name} » créé.` };
  } catch (error) {
    console.error("[saveCustomRoleAction] Échec d'enregistrement :", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Enregistrement impossible pour le moment.",
    };
  }
}

/**
 * Supprime un rôle personnalisé. Les utilisateurs concernés conservent leur
 * rôle de base (`customRoleId` devient null via `onDelete: SetNull`).
 * Les rôles système (pré-configurés) ne peuvent pas être supprimés.
 */
export async function deleteCustomRoleAction(
  roleId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const admin = await requireAdminContext();

    const role = await prisma.customRole.findFirst({
      where: { id: roleId, organizationId: admin.organizationId },
      select: { name: true, isSystem: true },
    });

    if (!role) {
      return {
        ok: false,
        message: "Rôle introuvable ou appartenant à une autre organisation.",
      };
    }
    if (role.isSystem) {
      return {
        ok: false,
        message:
          "Ce rôle est pré-configuré par le système et ne peut pas être supprimé.",
      };
    }

    await prisma.customRole.delete({ where: { id: roleId } });

    revalidatePath(ROLES_PATH);
    return { ok: true, message: `Rôle « ${role.name} » supprimé.` };
  } catch (error) {
    console.error("[deleteCustomRoleAction] Échec de suppression :", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Suppression impossible pour le moment.",
    };
  }
}

/**
 * Attribue (ou retire) un rôle personnalisé à un utilisateur de
 * l'organisation. Passe `null` pour retirer le rôle personnalisé.
 */
export async function assignCustomRoleAction(
  userId: string,
  customRoleId: string | null
): Promise<{ ok: boolean; message: string }> {
  try {
    const admin = await requireAdminContext();

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: admin.organizationId },
      select: { firstName: true, lastName: true, role: true },
    });

    if (!target) {
      return { ok: false, message: "Utilisateur introuvable." };
    }
    if (target.role === "ADMIN" || target.role === "SUPER_ADMIN") {
      return {
        ok: false,
        message: "Les administrateurs disposent déjà de toutes les permissions.",
      };
    }

    if (customRoleId) {
      const role = await prisma.customRole.findFirst({
        where: { id: customRoleId, organizationId: admin.organizationId },
        select: { name: true },
      });

      if (!role) {
        return { ok: false, message: "Le rôle sélectionné est introuvable." };
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { customRoleId: customRoleId ?? null },
    });

    revalidatePath(ROLES_PATH);

    const fullName = `${target.firstName} ${target.lastName}`;
    return customRoleId
      ? { ok: true, message: `Rôle attribué à ${fullName}.` }
      : { ok: true, message: `Rôle personnalisé retiré pour ${fullName}.` };
  } catch (error) {
    console.error("[assignCustomRoleAction] Échec d'attribution :", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Attribution impossible pour le moment.",
    };
  }
}