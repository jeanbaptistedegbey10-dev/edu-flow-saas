import "server-only";

import { prisma } from "@/lib/prisma";
import { getValidatedSessionContext } from "@/lib/session";

// --------------------------------------
// Garde d'accès du back-office Super-Admin
// --------------------------------------
//
// Le back-office /super-admin est réservé aux utilisateurs portant le rôle
// applicatif SUPER_ADMIN (administrateurs de la PLATEFORME EduFlow, et non
// administrateurs d'écoles). La vérification est effectuée en BASE DE
// DONNÉES (source de vérité) et non sur la seule session JWT, afin qu'une
// révocation de rôle soit immédiatement effective.
//
// Triple barrière de sécurité :
//   1. `src/proxy.ts`   → blocage JWT en périphérie (navigation) ;
//   2. `layout.tsx`     → redirection serveur si rôle invalide ;
//   3. chaque Server Action de `src/actions/super-admin.ts` → re-vérifie
//      ce garde avant TOUTE écriture (protection anti-falsification d'appel).
export type SuperAdminContext = {
  userId: string;
  email: string;
  /** Organisation « porteuse » du compte plateforme (EduFlow Platform). */
  organizationId: string;
};

/**
 * Retourne le contexte Super-Admin si l'utilisateur connecté possède bien le
 * rôle SUPER_ADMIN (compte actif, vérifié en base), sinon `null`.
 * N'émet aucune redirection : l'appelant décide (redirection /dashboard).
 */
export async function getSuperAdminContext(): Promise<SuperAdminContext | null> {
  const session = await getValidatedSessionContext();

  if (!session || session.role !== "SUPER_ADMIN") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      organizationId: true,
    },
  });

  if (!user || !user.isActive || user.role !== "SUPER_ADMIN") {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    organizationId: user.organizationId,
  };
}

// --------------------------------------
// Clés API de paiement (KKiaPay / FedaPay)
// --------------------------------------

/**
 * Identifiants des clés de paiement stockées dans `SystemSettings`.
 * Objet de constantes déplacé ici pour respecter la contrainte Next.js
 * qui interdit l'export d'objets/constantes dans les fichiers "use server".
 */
export const PAYMENT_SETTING_KEYS = {
  KKIA_PAY_PUBLIC_KEY: "kkiapay.publicKey",
  KKIA_PAY_PRIVATE_KEY: "kkiapay.privateKey",
  KKIA_PAY_SECRET: "kkiapay.secret",
  KKIA_PAY_MODE: "kkiapay.mode",
  KKIA_PAY_IS_ACTIVE: "kkiapay.isActive",
  FEDA_PAY_PUBLIC_KEY: "fedapay.publicKey",
  FEDA_PAY_SECRET_KEY: "fedapay.secretKey",
  FEDA_PAY_MODE: "fedapay.mode",
  FEDA_PAY_IS_ACTIVE: "fedapay.isActive",
} as const;
