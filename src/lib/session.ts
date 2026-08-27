import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// --------------------------------------
// Contexte de session résilient
// --------------------------------------
//
// Problème historique : l'identifiant d'organisation stocké dans le JWT de
// session peut devenir obsolète (organisation supprimée en base, base
// réinitialisée puis re-seedée avec de nouveaux identifiants…). Toutes les
// Server Actions et pages dépendant de cet identifiant plantaient alors en
// cascade (P2025 sur findUniqueOrThrow, listes vides, crash 500).
//
// Solution : le contexte de session est systématiquement revalidé contre la
// base de données (source de vérité) :
//   1. L'utilisateur du JWT doit toujours exister et être actif ;
//   2. Son organisation doit exister — sinon bascule automatique (fallback)
//      sur la première organisation valide de la base ;
//   3. Si aucune organisation n'existe (ou session absente/corrompue), les
//      helpers redirigent proprement vers la page de connexion.
//
// Le résultat est mémoïsé par requête via React `cache()` : une page appelant
// plusieurs actions ne déclenche qu'une seule série de vérifications.

export type SessionContext = {
  id: string;
  role: string;
  organizationId: string;
};

const resolveSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return null;
    }

    try {
      // 1. L'utilisateur doit exister en base (le JWT peut survivre à une
      //    suppression de compte) et être actif.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          organizationId: true,
        },
      });

      if (!user || !user.isActive) {
        return null;
      }

      // 2. Vérifie que l'organisation rattachée existe toujours.
      const organization = await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { id: true },
      });

      if (organization) {
        return {
          id: user.id,
          role: user.role,
          organizationId: user.organizationId,
        };
      }

      // 3. Fallback : première organisation valide de la base.
      const fallbackOrganization = await prisma.organization.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      if (!fallbackOrganization) {
        console.error(
          `[session] Aucune organisation valide en base pour l'utilisateur ${user.email}.`
        );
        return null;
      }

      console.warn(
        `[session] Organisation ${user.organizationId} introuvable pour ` +
          `${user.email} ; bascule automatique sur ${fallbackOrganization.id}.`
      );

      return {
        id: user.id,
        role: user.role,
        organizationId: fallbackOrganization.id,
      };
    } catch (error) {
      // Une panne base de données ne doit pas provoquer un crash 500 en
      // cascade : on traite comme une session non résoluble (redirection
      // vers la connexion) après journalisation.
      console.error("[session] Échec de résolution du contexte :", error);
      return null;
    }
  }
);

/**
 * Contexte de session validé contre la base de données, SANS effet de bord.
 *
 * Statut UNAUTHENTICATED (`null`) si :
 * - la session est absente ou corrompue ;
 * - l'utilisateur du JWT n'existe plus en base ou est désactivé ;
 * - aucune organisation valide n'est disponible.
 *
 * N'émet JAMAIS de redirection : c'est l'appelant qui décide de la suite
 * (page /login : affichage du formulaire et ignorance du cookie ; pages
 * protégées : redirection vers /login via les helpers ci-dessous). C'est ce
 * contrat qui garantit l'absence de boucle /login ↔ /dashboard lorsqu'un
 * cookie de session référence des données supprimées de la base.
 */
export async function getValidatedSessionContext(): Promise<SessionContext | null> {
  return resolveSessionContext();
}

/**
 * Détermine si une erreur interceptée est une redirection Next.js
 * (`redirect()` / `notFound()` lèvent des exceptions de contrôle de flux).
 * Ces erreurs ne doivent JAMAIS être converties en résultat d'erreur
 * métier : elles doivent être relancées telles quelles.
 */
export function isNextRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }

  const digest = (error as { digest?: unknown }).digest;

  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

/**
 * Résout l'identifiant de l'organisation active à partir de la session.
 *
 * Isolation multi-tenant : toutes les requêtes des Server Actions sont
 * filtrées par ce `organizationId`, garantissant qu'un utilisateur ne peut
 * accéder qu'aux données de sa propre organisation.
 *
 * Résilience :
 * - L'identifiant est revalidé contre la base (voir `resolveSessionContext`) ;
 * - Si l'organisation liée au cookie n'existe plus, bascule automatiquement
 *   sur la première organisation valide ;
 * - Si aucune organisation n'est disponible ou si la session est invalide,
 *   redirige proprement vers la page de connexion.
 */
export async function getCurrentOrganizationId(): Promise<string> {
  const context = await resolveSessionContext();

  if (!context) {
    redirect("/login");
  }

  return context.organizationId;
}

/**
 * Résout l'utilisateur complet de la session active (id, rôle, organisation),
 * revalidé contre la base de données. Utilisé par les actions nécessitant une
 * logique dépendante du rôle (ex : un enseignant ne voit que ses propres cours).
 *
 * Redirige vers la page de connexion si la session est absente, corrompue,
 * si le compte a été supprimé/désactivé ou si aucune organisation valide
 * n'est disponible.
 */
export async function getCurrentSessionUser(): Promise<{
  id: string;
  role: string;
  organizationId: string;
}> {
  const context = await resolveSessionContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}