"use server";

import { randomBytes } from "crypto";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import type {
  CustomRoleDTO,
  RoleUserDTO,
  RolesOverview,
  RoleFormState,
  MemberFormState,
  MemberActionResult,
} from "@/types/roles";
import { assertCanMutate } from "@/lib/license-check";

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
// Génération d'identifiants & mot de passe (membres internes)
// --------------------------------------
//
// Phase 1 (Task 5 — Sécurisation des accès) : la création d'un membre interne
// (enseignant, comptable, secrétaire…) génère UNIQUEMENT un identifiant
// (email de l'organisation) et un mot de passe local. Aucun e-mail SMTP
// externe n'est envoyé — l'administrateur transmet les identifiants
// directement au membre.

/** Normalise un prénom / nom en segment d'identifiant (sans accents). */
function normalizeLoginPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

/**
 * Génère un identifiant unique pour un membre interne au format
 * `prenom.nom@<slug-organisation>.local`. L'unicité globale de
 * `User.email` est garantie par un suffixe numérique si nécessaire.
 */
async function generateMemberLogin(
  organizationId: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  const domain = organization?.slug?.toLowerCase() || "organisation";
  const baseParts = [
    normalizeLoginPart(firstName),
    normalizeLoginPart(lastName),
  ].filter(Boolean);
  const base = baseParts.join(".") || "membre";

  let candidate = `${base}@${domain}.local`;
  let counter = 2;

  // Boucle bornée : suffisante pour résoudre toutes les collisions réelles.
  while (counter < 100) {
    const taken = await prisma.user.findUnique({
      where: { email: candidate },
      select: { id: true },
    });
    if (!taken) {
      return candidate;
    }
    candidate = `${base}${counter}@${domain}.local`;
    counter += 1;
  }

  return `${base}-${Date.now().toString(36)}@${domain}.local`;
}

/**
 * Génère un mot de passe lisible (sans caractères ambigus O/0, I/l, etc.).
 * Affiché une seule fois à l'administrateur — aucun envoi par e-mail.
 */
function generateMemberPassword(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let password = "";
  for (let index = 0; index < length; index += 1) {
    password += alphabet[bytes[index]! % alphabet.length];
  }
  return password;
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
  await assertCanMutate();
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
  await assertCanMutate();
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
  await assertCanMutate();
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

// --------------------------------------
// Mutation : créer / éditer / supprimer un membre
// --------------------------------------

/**
 * Crée un nouveau membre dans l'organisation avec un mot de passe initial.
 */
export async function createMemberAction(
  _prevState: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  await assertCanMutate();
  try {
    const admin = await requireAdminContext();

    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    // Identifiant optionnel : s'il est vide, il est généré automatiquement à
    // partir du slug de l'organisation (prenom.nom@<slug>.local).
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    // Mot de passe optionnel : s'il est vide, un mot de passe lisible est
    // généré et affiché UNE SEULE fois à l'administrateur (aucun e-mail SMTP).
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "STAFF");
    const customRoleId = String(formData.get("customRoleId") ?? "").trim();

    const fieldErrors: MemberFormState["fieldErrors"] = {};

    if (!firstName) fieldErrors.firstName = "Le prénom est obligatoire.";
    if (!lastName) fieldErrors.lastName = "Le nom est obligatoire.";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = "L'email n'est pas valide.";
    }
    if (password && password.length < 6) {
      fieldErrors.password =
        "Le mot de passe doit contenir au moins 6 caractères.";
    }
    if (!["STAFF", "TEACHER", "ADMIN"].includes(role)) {
      fieldErrors.role = "Rôle de base invalide.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { status: "error", fieldErrors, message: "Vérifiez les champs." };
    }

    // Identifiant final (fourni ou généré) avec contrôle d'unicité globale.
    const finalEmail = email
      ? email
      : await generateMemberLogin(
          admin.organizationId,
          firstName,
          lastName
        );

    const existingUser = await prisma.user.findUnique({
      where: { email: finalEmail },
    });
    if (existingUser) {
      return {
        status: "error",
        fieldErrors: { email: "Cet email est déjà utilisé." },
        message: "Cet email est déjà utilisé.",
      };
    }

    // Mot de passe final (fourni ou généré puis affiché une seule fois).
    const generatedPassword = password ? null : generateMemberPassword();
    const finalPassword = generatedPassword ?? password;

    let assignedCustomRoleId: string | null = null;
    if (customRoleId) {
      const customRole = await prisma.customRole.findFirst({
        where: { id: customRoleId, organizationId: admin.organizationId },
        select: { id: true },
      });
      if (!customRole) {
        return {
          status: "error",
          message: "Le rôle personnalisé sélectionné est introuvable.",
        };
      }
      assignedCustomRoleId = customRoleId;
    }

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(finalPassword, 10);

    await prisma.user.create({
      data: {
        organizationId: admin.organizationId,
        firstName,
        lastName,
        email: finalEmail,
        passwordHash,
        role: role as "STAFF" | "TEACHER" | "ADMIN",
        customRoleId: assignedCustomRoleId,
        isActive: true,
      },
    });

    revalidatePath(ROLES_PATH);

    // Le mot de passe généré est affiché UNE SEULE fois à l'administrateur :
    // aucun e-mail SMTP n'est envoyé (Task 5 — Sécurisation des accès).
    const successMessage = generatedPassword
      ? `Membre « ${firstName} ${lastName} » créé. Identifiant : ${finalEmail} — Mot de passe initial : ${generatedPassword} (transmettez-le au membre).`
      : `Membre « ${firstName} ${lastName} » créé avec succès.`;

    return {
      status: "success",
      message: successMessage,
    };
  } catch (error) {
    console.error("[createMemberAction] Échec de création :", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Création du membre impossible pour le moment.",
    };
  }
}

/**
 * Met à jour les informations et/ou le rôle d'un membre existant.
 */
export async function updateMemberAction(
  _prevState: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  await assertCanMutate();
  try {
    const admin = await requireAdminContext();

    const userId = String(formData.get("userId") ?? "").trim();
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "STAFF");
    const customRoleId = String(formData.get("customRoleId") ?? "").trim();
    const isActive = formData.get("isActive") === "on";

    const fieldErrors: MemberFormState["fieldErrors"] = {};

    if (!firstName) fieldErrors.firstName = "Le prénom est obligatoire.";
    if (!lastName) fieldErrors.lastName = "Le nom est obligatoire.";
    if (!email) {
      fieldErrors.email = "L'email est obligatoire.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = "L'email n'est pas valide.";
    }
    if (!["STAFF", "TEACHER", "ADMIN"].includes(role)) {
      fieldErrors.role = "Rôle de base invalide.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { status: "error", fieldErrors, message: "Vérifiez les champs." };
    }

    const existingUser = await prisma.user.findFirst({
      where: { id: userId, organizationId: admin.organizationId },
    });
    if (!existingUser) {
      return {
        status: "error",
        message: "Membre introuvable ou appartenant à une autre organisation.",
      };
    }

    const emailConflict = await prisma.user.findFirst({
      where: { email, id: { not: userId } },
    });
    if (emailConflict) {
      return {
        status: "error",
        fieldErrors: { email: "Cet email est déjà utilisé." },
        message: "Cet email est déjà utilisé.",
      };
    }

    let assignedCustomRoleId: string | null = null;
    if (customRoleId) {
      const customRole = await prisma.customRole.findFirst({
        where: { id: customRoleId, organizationId: admin.organizationId },
        select: { id: true },
      });
      if (!customRole) {
        return {
          status: "error",
          message: "Le rôle personnalisé sélectionné est introuvable.",
        };
      }
      assignedCustomRoleId = customRoleId;
    }

    const updateData: Record<string, unknown> = {
      firstName,
      lastName,
      email,
      role,
      customRoleId: assignedCustomRoleId,
      isActive,
    };

    if (password && password.length >= 6) {
      const bcrypt = await import("bcryptjs");
      updateData.passwordHash = await bcrypt.hash(password, 10);
    } else if (password && password.length > 0 && password.length < 6) {
      return {
        status: "error",
        fieldErrors: {
          password: "Le mot de passe doit contenir au moins 6 caractères.",
        },
        message: "Mot de passe trop court.",
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    revalidatePath(ROLES_PATH);
    return {
      status: "success",
      message: `Membre « ${firstName} ${lastName} » mis à jour.`,
    };
  } catch (error) {
    console.error("[updateMemberAction] Échec de mise à jour :", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Mise à jour impossible pour le moment.",
    };
  }
}

/**
 * Supprime (désactive) un membre de l'organisation.
 */
export async function deleteMemberAction(
  userId: string
): Promise<MemberActionResult> {
  await assertCanMutate();
  try {
    const admin = await requireAdminContext();

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: admin.organizationId },
      select: { firstName: true, lastName: true, role: true },
    });

    if (!target) {
      return { ok: false, message: "Membre introuvable." };
    }
    if (target.role === "SUPER_ADMIN") {
      return {
        ok: false,
        message: "Impossible de supprimer le Super Administrateur.",
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    revalidatePath(ROLES_PATH);
    return {
      ok: true,
      message: `Accès révoqué pour « ${target.firstName} ${target.lastName} ».`,
    };
  } catch (error) {
    console.error("[deleteMemberAction] Échec de suppression :", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Suppression impossible pour le moment.",
    };
  }
}
