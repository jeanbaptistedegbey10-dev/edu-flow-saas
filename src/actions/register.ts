"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// --------------------------------------
// Types publics (contrat avec le composant client)
// --------------------------------------

export type RegisterFormField =
  | "organizationName"
  | "firstName"
  | "lastName"
  | "email"
  | "password";

export type RegisterFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<RegisterFormField, string>>;
};

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Nombre de tours bcrypt pour le hachage du mot de passe. */
const BCRYPT_ROUNDS = 10;

type ParsedRegisterInput =
  | {
      ok: true;
      data: {
        organizationName: string;
        firstName: string;
        lastName: string;
        email: string;
        password: string;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<RegisterFormField, string>> };

function parseRegisterForm(formData: FormData): ParsedRegisterInput {
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const fieldErrors: Partial<Record<RegisterFormField, string>> = {};

  if (!organizationName) {
    fieldErrors.organizationName = "Le nom de l'organisation est requis.";
  } else if (organizationName.length > 200) {
    fieldErrors.organizationName =
      "Le nom de l'organisation ne doit pas dépasser 200 caractères.";
  }

  if (!firstName) {
    fieldErrors.firstName = "Le prénom est requis.";
  } else if (firstName.length > 100) {
    fieldErrors.firstName = "Le prénom ne doit pas dépasser 100 caractères.";
  }

  if (!lastName) {
    fieldErrors.lastName = "Le nom est requis.";
  } else if (lastName.length > 100) {
    fieldErrors.lastName = "Le nom ne doit pas dépasser 100 caractères.";
  }

  if (!email) {
    fieldErrors.email = "L'adresse email est requise.";
  } else if (!EMAIL_REGEX.test(email)) {
    fieldErrors.email = "L'adresse email est invalide.";
  }

  if (!password) {
    fieldErrors.password = "Le mot de passe est requis.";
  } else if (password.length < 8) {
    fieldErrors.password = "Le mot de passe doit contenir au moins 8 caractères.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      organizationName,
      firstName,
      lastName,
      email,
      password,
    },
  };
}

/**
 * Génère un slug unique à partir du nom de l'organisation.
 * Normalise en minuscules, remplace les espaces/accents, puis ajoute
 * un suffixe numérique si le slug existe déjà.
 */
async function generateUniqueSlug(organizationName: string): Promise<string> {
  const base = organizationName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "organisation";

  let slug = base;
  let counter = 1;

  // Vérifie l'unicité et incrémente le suffixe si nécessaire.
  while (true) {
    const existing = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }

    counter += 1;
    slug = `${base}-${counter}`;
  }
}

// --------------------------------------
// Server Action
// --------------------------------------

/**
 * Crée une nouvelle organisation et son administrateur initial.
 *
 * - Hache le mot de passe avec bcryptjs (10 tours).
 * - Attribue le rôle `ADMIN` à l'utilisateur.
 * - Lie l'utilisateur à l'organisation créée (transaction atomique).
 *
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent
 * et un `FormData`, retourne un état sérialisable (succès, erreurs de champs,
 * message). En cas de succès, le composant client redirige vers `/login`.
 */
export async function registerAction(
  _prevState: RegisterFormState,
  formData: FormData
): Promise<RegisterFormState> {
  const parsed = parseRegisterForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const { organizationName, firstName, lastName, email, password } = parsed.data;

  // Vérifie qu'aucun compte n'existe déjà avec cet email.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return {
      status: "error",
      message: "Un compte existe déjà avec cette adresse email.",
      fieldErrors: { email: "Cette adresse email est déjà utilisée." },
    };
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const slug = await generateUniqueSlug(organizationName);

    // Transaction atomique : l'organisation et son administrateur sont créés
    // ensemble. Si l'un échoue, aucun enregistrement n'est persisté.
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
        },
      });

      await tx.user.create({
        data: {
          organizationId: organization.id,
          email,
          passwordHash,
          firstName,
          lastName,
          role: "ADMIN",
        },
      });
    });

    return {
      status: "success",
      message: "Votre compte a été créé avec succès. Vous pouvez vous connecter.",
    };
  } catch (error) {
    // Collision sur l'email (contrainte unique) survenue entre la vérification
    // et la création (course condition) : message explicite.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "Un compte existe déjà avec cette adresse email.",
        fieldErrors: { email: "Cette adresse email est déjà utilisée." },
      };
    }

    console.error("[registerAction] Échec de création du compte :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la création du compte. Veuillez réessayer.",
    };
  }
}