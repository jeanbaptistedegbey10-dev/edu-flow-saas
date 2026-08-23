import { auth } from "@/auth";

/**
 * Résout l'identifiant de l'organisation active à partir de la session
 * NextAuth de l'utilisateur connecté.
 *
 * Isolation multi-tenant : toutes les requêtes des Server Actions sont
 * filtrées par ce `organizationId`, garantissant qu'un utilisateur ne peut
 * accéder qu'aux données de sa propre organisation.
 *
 * Lève une erreur si la session est absente ou incomplète (accès direct
 * sans authentification, token corrompu…). Le proxy bloque déjà ces cas
 * au niveau des routes `/dashboard/*` ; cette garde protège également
 * les Server Actions invoquées directement.
 */
export async function getCurrentOrganizationId(): Promise<string> {
  const session = await auth();
  const organizationId = session?.user?.organizationId;

  if (!organizationId) {
    throw new Error(
      "Session invalide : aucune organisation associée à l'utilisateur connecté."
    );
  }

  return organizationId;
}