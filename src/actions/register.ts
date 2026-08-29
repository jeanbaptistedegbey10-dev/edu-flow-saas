import { assertCanMutate } from "@/lib/license-check";
"use server";

// --------------------------------------
// Inscription publique â€” DÃ‰SACTIVÃ‰E (Phase 1, commercialisation)
// --------------------------------------
//
// Depuis la Phase 1, le formulaire d'inscription par email + mot de passe est
// retirÃ© : la bouton Â« Continuer avec Google Â» (OAuth) est l'UNIQUE voie de
// crÃ©ation de compte Organisme / Administrateur (voir src/auth.ts â€” callback
// `signIn`, qui crÃ©e l'organisation en plan TRIAL/ACTIVE avec un essai de
// 30 jours et le compte administrateur).
//
// Cette Server Action est conservÃ©e UNIQUEMENT comme protection dÃ©fensive :
// mÃªme en cas d'appel direct (HTTP `Next-Action` falsifiÃ©), elle refuse
// systÃ©matiquement la crÃ©ation d'un compte par identifiants.
//
// Voir src/lib/actions/demo-data.ts pour l'injection / rÃ©initialisation du
// jeu de donnÃ©es de dÃ©monstration.

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

/**
 * Refuse systÃ©matiquement la crÃ©ation de compte par formulaire.
 * Retourne un Ã©tat d'erreur informatif â€” aucune Ã©criture en base.
 */
export async function registerAction(
  _prevState: RegisterFormState
): Promise<RegisterFormState> {
  return {
    status: "error",
    message:
      "La crÃ©ation de compte par formulaire est dÃ©sactivÃ©e. Utilisez Â« Continuer avec Google Â» pour crÃ©er votre organisation.",
  };
}
