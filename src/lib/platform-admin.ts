// --------------------------------------
// Compte Super Admin principal de la plateforme
// --------------------------------------
//
// Email UNIQUE du Super Admin principal (configurable via la variable
// d'environnement `SUPER_ADMIN_EMAIL`). Cet email est reconnu par :
// - le seed (`prisma/seed.ts`) qui crée le compte initial ;
// - la logique RBAC de connexion Google (`src/auth.ts`) : la première
//   connexion Google avec cet email provisionne un compte SUPER_ADMIN
//   (organisation plateforme « EduFlow Platform »), et une connexion
//   ultérieure rétablit le rôle SUPER_ADMIN si nécessaire.
//
// Module pur (aucune dépendance) : importable par le seed comme par auth.ts.

/** Email du Super Admin principal (défaut : jeanbaptistedegbey10@gmail.com). */
export const PLATFORM_SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL ?? "jeanbaptistedegbey10@gmail.com"
)
  .trim()
  .toLowerCase();

/** `true` si l'email fourni est celui du Super Admin principal. */
export function isPlatformSuperAdminEmail(
  email: string | null | undefined
): boolean {
  return (
    typeof email === "string" &&
    email.trim().toLowerCase() === PLATFORM_SUPER_ADMIN_EMAIL
  );
}
