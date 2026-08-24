"use server";

import type { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type OrganizationMemberDTO = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type OrganizationInfoDTO = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  createdAt: Date;
  memberCount: number;
};

export type OrganizationFormField = "name" | "email" | "phone" | "address";

export type OrganizationFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<OrganizationFormField, string>>;
};

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère les informations de l'organisation active, avec le nombre
 * de membres rattachés.
 */
export async function getOrganizationInfo(): Promise<OrganizationInfoDTO> {
  const organizationId = await getCurrentOrganizationId();

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
      address: true,
      logoUrl: true,
      createdAt: true,
      _count: {
        select: { users: true },
      },
    },
  });

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    email: organization.email,
    phone: organization.phone,
    address: organization.address,
    logoUrl: organization.logoUrl,
    createdAt: organization.createdAt,
    memberCount: organization._count.users,
  };
}

/**
 * Récupère les membres de l'organisation active (tous rôles confondus),
 * triés par date de création puis nom.
 */
export async function getOrganizationMembers(): Promise<OrganizationMemberDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  return prisma.user.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      avatarUrl: true,
      isActive: true,
      createdAt: true,
    },
  });
}

/**
 * Met à jour les informations de l'organisation active.
 * Conçue pour être utilisée avec `useActionState` : reçoit l'état précédent
 * et un `FormData`, retourne un état sérialisable.
 */
export async function updateOrganizationAction(
  _prevState: OrganizationFormState,
  formData: FormData
): Promise<OrganizationFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  const fieldErrors: Partial<Record<OrganizationFormField, string>> = {};

  if (!name) {
    fieldErrors.name = "Le nom de l'organisation est requis.";
  } else if (name.length > 120) {
    fieldErrors.name =
      "Le nom de l'organisation ne doit pas dépasser 120 caractères.";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "L'adresse e-mail est invalide.";
  }

  if (phone && phone.length > 30) {
    fieldErrors.phone = "Le numéro de téléphone ne doit pas dépasser 30 caractères.";
  }

  if (address && address.length > 255) {
    fieldErrors.address =
      "L'adresse ne doit pas dépasser 255 caractères.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
      },
    });

    revalidatePath("/dashboard/organization");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: "Informations de l'organisation mises à jour.",
    };
  } catch (error) {
    console.error(
      "[updateOrganizationAction] Échec de mise à jour :",
      error
    );

    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la mise à jour de l'organisation.",
    };
  }
}