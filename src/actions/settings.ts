"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type UserProfileDTO = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: Date;
};

export type ProfileFormField =
  | "firstName"
  | "lastName"
  | "email"
  | "avatarUrl";

export type ProfileFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<ProfileFormField, string>>;
};

export type NotificationPreferenceDTO = {
  emailNotifications: boolean;
};

export type NotificationPreferenceState = {
  status: "idle" | "success" | "error";
  message?: string;
};

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère le profil de l'utilisateur connecté depuis la base de données.
 */
export async function getUserProfile(): Promise<UserProfileDTO> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error(
      "Session invalide : impossible d'identifier l'utilisateur connecté."
    );
  }

  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
}

/**
 * Met à jour le profil de l'utilisateur connecté.
 * Conçue pour être utilisée avec `useActionState` : reçoit l'état précédent
 * et un `FormData`, retourne un état sérialisable.
 */
export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim();

  const fieldErrors: Partial<Record<ProfileFormField, string>> = {};

  if (!firstName) {
    fieldErrors.firstName = "Le prénom est requis.";
  } else if (firstName.length > 60) {
    fieldErrors.firstName = "Le prénom ne doit pas dépasser 60 caractères.";
  }

  if (!lastName) {
    fieldErrors.lastName = "Le nom est requis.";
  } else if (lastName.length > 60) {
    fieldErrors.lastName = "Le nom ne doit pas dépasser 60 caractères.";
  }

  if (!email) {
    fieldErrors.email = "L'adresse e-mail est requise.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "L'adresse e-mail est invalide.";
  }

  if (avatarUrl && !/^https?:\/\/.+/.test(avatarUrl)) {
    fieldErrors.avatarUrl = "L'URL de l'avatar doit commencer par http(s)://.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors,
    };
  }

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      status: "error",
      message: "Session invalide : impossible d'identifier l'utilisateur.",
    };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        email,
        avatarUrl: avatarUrl || null,
      },
    });

    revalidatePath("/dashboard/settings");

    return {
      status: "success",
      message: "Profil mis à jour avec succès.",
    };
  } catch (error) {
    console.error("[updateProfileAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la mise à jour du profil.",
    };
  }
}

/**
 * Récupère les préférences de notification de l'utilisateur connecté.
 * Les préférences étant dérivées du profil (pas encore de table dédiée),
 * on renvoie une valeur par défaut activée.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferenceDTO> {
  return {
    emailNotifications: true,
  };
}

/**
 * Enregistre les préférences de notification de l'utilisateur connecté.
 * La table `NotificationPreference` n'existe pas encore dans le schéma,
 * cette action conserve donc l'état côté client sans persistance.
 */
export async function updateNotificationPreferencesAction(
  _prevState: NotificationPreferenceState,
  formData: FormData
): Promise<NotificationPreferenceState> {
  const emailNotifications = formData.get("emailNotifications") === "on";

  try {
    revalidatePath("/dashboard/settings");

    return {
      status: "success",
      message: emailNotifications
        ? "Notifications e-mail activées."
        : "Notifications e-mail désactivées.",
    };
  } catch (error) {
    console.error(
      "[updateNotificationPreferencesAction] Échec de mise à jour :",
      error
    );

    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la mise à jour des préférences.",
    };
  }
}