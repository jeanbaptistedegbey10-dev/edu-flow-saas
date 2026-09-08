// --------------------------------------
// Compte Super Admin principal de la plateforme
// --------------------------------------
//
// Email UNIQUE et CODÉ EN DUR du Super Admin principal. Cet email est reconnu
// par :
// - le seed (`prisma/seed.ts`) qui `upsert` le compte initial ;
// - la logique RBAC de connexion Google (`src/auth.ts`) : la première
//   connexion Google avec cet email provisionne un compte SUPER_ADMIN
//   (organisation plateforme « EduFlow Platform »), et une connexion
//   ultérieure rétablit le rôle SUPER_ADMIN si nécessaire.
//
// Module pur (aucune dépendance) : importable par le seed comme par auth.ts.
//
// SÉCURITÉ : cette valeur est la SEULE autorisée à porter le rôle
// SUPER_ADMIN. Elle est volontairement codée en dur — aucune variable
// d'environnement ne doit permettre de promouvoir un autre compte (principe
// « super admin unique », sans vecteur de configuration).

/** Email UNIQUE du Super Admin principal (codé en dur). */
export const PLATFORM_SUPER_ADMIN_EMAIL = "jeanbaptistedegbey10@gmail.com";

/** `true` si l'email fourni est celui du Super Admin principal. */
export function isPlatformSuperAdminEmail(
  email: string | null | undefined
): boolean {
  return (
    typeof email === "string" &&
    email.trim().toLowerCase() === PLATFORM_SUPER_ADMIN_EMAIL
  );
}
