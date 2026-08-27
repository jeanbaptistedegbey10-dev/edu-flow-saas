"use server";

import type { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, isNextRedirectError } from "@/lib/session";

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
  /** Ville de l'organisation (reçus imprimables). */
  city: string | null;
  /** Site web officiel (reçus imprimables). */
  website: string | null;
  logoUrl: string | null;
  /** Numéro RCCM (mention légale des reçus). */
  rccm: string | null;
  /** Numéro IFU / NIF (mention légale des reçus). */
  ifu: string | null;
  /**
   * Frais d'inscription par défaut (FCFA), facturés une seule fois à
   * l'inscription d'un étudiant qui ne les a pas encore réglés.
   */
  defaultRegistrationFee: number;
  createdAt: Date;
  memberCount: number;
};

export type OrganizationFormField =
  | "name"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "website"
  | "logoUrl"
  | "rccm"
  | "ifu"
  | "defaultRegistrationFee";

export type OrganizationFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<OrganizationFormField, string>>;
};

/** Plafond de sécurité pour les frais d'inscription (FCFA). */
const MAX_REGISTRATION_FEE = 10_000_000;

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère les informations de l'organisation active, avec le nombre
 * de membres rattachés.
 */
export async function getOrganizationInfo(): Promise<OrganizationInfoDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    // `findUnique` sécurisé : l'organisation est garantie par la résolution de
    // session ; une absence ici signale une course (suppression concurrente).
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        website: true,
        logoUrl: true,
        rccm: true,
        ifu: true,
        defaultRegistrationFee: true,
        createdAt: true,
        _count: {
          select: { users: true },
        },
      },
    });

    if (!organization) {
      throw new Error(
        "Organisation introuvable : votre session pointe vers une organisation qui n'existe plus."
      );
    }

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      email: organization.email,
      phone: organization.phone,
      address: organization.address,
      city: organization.city,
      website: organization.website,
      logoUrl: organization.logoUrl,
      rccm: organization.rccm,
      ifu: organization.ifu,
      defaultRegistrationFee: organization.defaultRegistrationFee,
      createdAt: organization.createdAt,
      memberCount: organization._count.users,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getOrganizationInfo] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger les informations de l'organisation pour le moment."
    );
  }
}

/**
 * Lecture légère des frais d'inscription par défaut de l'organisation
 * active. Alimente les formulaires d'inscription étudiant (annonce du
 * montant facturé automatiquement).
 *
 * Retourne la valeur par défaut du schéma (15 000 FCFA) en cas
 * d'indisponibilité, afin de ne jamais bloquer une inscription.
 */
export async function getDefaultRegistrationFee(): Promise<number> {
  const DEFAULT_FALLBACK = 15000;

  try {
    const organizationId = await getCurrentOrganizationId();

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultRegistrationFee: true },
    });

    return organization?.defaultRegistrationFee ?? DEFAULT_FALLBACK;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getDefaultRegistrationFee] Échec de lecture :",
      error
    );

    return DEFAULT_FALLBACK;
  }
}

/**
 * Lecture légère de l'identité visuelle de l'organisation active (nom +
 * logo). Alimente l'en-tête du tableau de bord sans charger les autres
 * champs ni le comptage des membres.
 *
 * Retourne `null` en cas d'indisponibilité (dégradation gracieuse : le
 * header affiche alors le monogramme par défaut).
 */
export async function getCurrentOrganizationBranding(): Promise<{
  name: string;
  logoUrl: string | null;
} | null> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoUrl: true },
    });

    return organization;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getCurrentOrganizationBranding] Échec de lecture :",
      error
    );

    return null;
  }
}

/**
 * Récupère les membres de l'organisation active (tous rôles confondus),
 * triés par date de création puis nom.
 */
export async function getOrganizationMembers(): Promise<OrganizationMemberDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    return await prisma.user.findMany({
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
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getOrganizationMembers] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
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
  const city = String(formData.get("city") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const rccm = String(formData.get("rccm") ?? "").trim();
  const ifu = String(formData.get("ifu") ?? "").trim();

  // Frais d'inscription par défaut : montant positif ; vide ⇒ 0 (aucun frais).
  const rawDefaultRegistrationFee = String(
    formData.get("defaultRegistrationFee") ?? ""
  )
    .trim()
    .replace(",", ".");
  const defaultRegistrationFee =
    rawDefaultRegistrationFee !== "" ? Number(rawDefaultRegistrationFee) : 0;

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

  if (city && city.length > 80) {
    fieldErrors.city = "La ville ne doit pas dépasser 80 caractères.";
  }

  if (
    website &&
    !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#][^\s]*)?$/i.test(website)
  ) {
    fieldErrors.website = "L'adresse du site web est invalide.";
  } else if (website && website.length > 200) {
    fieldErrors.website =
      "Le site web ne doit pas dépasser 200 caractères.";
  }

  // Logo : URL http(s) classique ou image encodée en data URL (upload local
  // redimensionné côté client avant envoi).
  const isHttpImageUrl = /^https?:\/\/\S+$/i.test(logoUrl);
  const isDataImageUrl =
    /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(
      logoUrl
    );

  if (logoUrl && !isHttpImageUrl && !isDataImageUrl) {
    fieldErrors.logoUrl =
      "Le logo doit être une URL d'image valide (https://… ou image importée).";
  } else if (logoUrl.length > 500_000) {
    fieldErrors.logoUrl =
      "L'image du logo est trop volumineuse (500 Ko maximum après compression).";
  }

  if (rccm && rccm.length > 60) {
    fieldErrors.rccm =
      "Le numéro RCCM ne doit pas dépasser 60 caractères.";
  }

  if (ifu && ifu.length > 60) {
    fieldErrors.ifu =
      "Le numéro IFU / NIF ne doit pas dépasser 60 caractères.";
  }

  if (Number.isNaN(defaultRegistrationFee)) {
    fieldErrors.defaultRegistrationFee =
      "Les frais d'inscription doivent être un nombre.";
  } else if (defaultRegistrationFee < 0) {
    fieldErrors.defaultRegistrationFee =
      "Les frais d'inscription ne peuvent pas être négatifs.";
  } else if (defaultRegistrationFee > MAX_REGISTRATION_FEE) {
    fieldErrors.defaultRegistrationFee =
      "Les frais d'inscription dépassent la limite autorisée.";
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
        city: city || null,
        website: website || null,
        logoUrl: logoUrl || null,
        rccm: rccm || null,
        ifu: ifu || null,
        defaultRegistrationFee,
      },
    });

    revalidatePath("/dashboard/organization");
    revalidatePath("/dashboard");
    // Le logo et le nom apparaissent dans le layout du tableau de bord :
    // revalidation large pour rafraîchir toutes les pages filles.
    revalidatePath("/", "layout");

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