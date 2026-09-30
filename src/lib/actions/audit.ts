"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getCurrentSessionUser } from "@/lib/session";
import type { AuditAction, AuditEntity } from "@/lib/audit-constants";
import { sanitizeAuditDetails } from "@/lib/audit-sanitize";

// --------------------------------------
// Types publics
// --------------------------------------
//
// Note : les constantes AUDIT_ACTIONS / AUDIT_ENTITIES vivent dans
// `@/lib/audit-constants` (module SANS « use server ») car Next.js interdit
// d'exporter des objets depuis un fichier « use server »
// (« A "use server" file can only export async functions, found object »).
// Les appelants les importent depuis `@/lib/audit-constants`, les fonctions
// ci-dessous depuis ce fichier.

/** Données pour la création d'une entrée d'audit. */
export type AuditLogInput = {
  action: AuditAction | string;
  entity: AuditEntity | string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
};

// --------------------------------------
// Fonction utilitaire principale
// --------------------------------------

/**
 * Enregistre un événement dans le journal d'audit.
 * Résout automatiquement l'utilisateur connecté et son organisation.
 * En cas d'échec, l'erreur est journalisée mais ne bloque pas l'opération.
 *
 * SÉCURITÉ : le champ `details` est systématiquement passé par
 * `sanitizeAuditDetails` AVANT écriture — aucun mot de passe, jeton
 * d'authentification, clé d'API, donnée bancaire ou identifiant technique
 * sensible ne peut donc être injecté dans le journal d'audit, même par un
 * appelant qui transmettrait un payload complet. Si rien de exploitable ne
 * subsiste après nettoyage, `details` est omis (pas d'objet vide en base).
 */
export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    const user = await getCurrentSessionUser();
    const safeDetails = sanitizeAuditDetails(input.details);

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        ...(safeDetails
          ? { details: safeDetails as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  } catch (error) {
    console.error("[audit] Échec de l'enregistrement de l'événement :", {
      action: input.action,
      entity: input.entity,
      error,
    });
  }
}


// --------------------------------------
// Fonctions de lecture (pour l'UI)
// --------------------------------------

/** Filtres pour la consultation du journal d'audit. */
export type AuditLogFilters = {
  /**
   * OBSOLÈTE — conservé uniquement pour la compatibilité de type avec les
   * appelants historiques. La valeur transmise est IGNORÉE : c'est
   * systématiquement `getCurrentSessionUser().organizationId` qui fait foi.
   * Ne jamais s'appuyer dessus pour autoriser un accès (IDOR cross-tenant).
   */
  organizationId?: string;
  userId?: string | null;
  action?: string | null;
  entity?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  page?: number;
  pageSize?: number;
};

/** Résultat paginé de la consultation du journal d'audit. */
export type AuditLogPage = {
  logs: AuditLogWithUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Entrée d'audit enrichie avec les informations utilisateur. */
export type AuditLogWithUser = {
  id: string;
  organizationId: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Prisma.JsonValue | null;
  createdAt: Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
};

/**
 * Récupère les entrées du journal d'audit avec filtres et pagination.
 *
 * ISOLATION MULTI-TENANT — l'identifiant d'organisation provient
 * EXCLUSIVEMENT de la session (`getCurrentSessionUser`), jamais du
 * `filters.organizationId` reçu du client. Sans cette règle, cette
 * Server Action (endpoint HTTP public dans Next.js) permettrait à n'importe
 * quel utilisateur authentifié de lire le journal d'un autre établissement
 * en forgeant l'identifiant — fuite de noms, e-mails et d'historique
 * financier (IDOR cross-tenant).
 *
 * Si l'appelant fournit un `organizationId` différent de celui de sa
 * session, l'écart est journalisé puis ignoré.
 */
export async function getAuditLogs(
  filters: AuditLogFilters
): Promise<AuditLogPage> {
  const {
    userId,
    action,
    entity,
    startDate,
    endDate,
    page = 1,
    pageSize = 25,
  } = filters;

  // Source de vérité : la session, pas le client.
  const sessionUser = await getCurrentSessionUser();
  const organizationId = sessionUser.organizationId;

  if (
    filters.organizationId &&
    filters.organizationId !== organizationId
  ) {
    console.warn(
      `[audit] Tentative de consultation cross-tenant du journal ` +
        `(demandée : ${filters.organizationId}, session : ${organizationId}) — ` +
        `requête restreinte à l'organisation de l'utilisateur.`
    );
  }

  const createdAt: Prisma.DateTimeFilter | undefined =
    startDate || endDate
      ? {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        }
      : undefined;

  const where: Prisma.AuditLogWhereInput = {
    organizationId,
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs: logs as unknown as AuditLogWithUser[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Récupère les actions distinctes du journal pour l'organisation courante.
 *
 * ISOLATION MULTI-TENANT — aucun paramètre d'organisation : l'identifiant
 * provient exclusivement de la session. Cette fonction étant exportée d'un
 * fichier « use server », elle constitue un endpoint HTTP public ; accepter
 * un `organizationId` aurait permis d'énumérer les actions d'un autre tenant.
 */
export async function getDistinctAuditActions(): Promise<string[]> {
  const { organizationId } = await getCurrentSessionUser();

  const results = await prisma.auditLog.findMany({
    where: { organizationId },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return results.map((r) => r.action);
}

/**
 * Récupère les entités distinctes du journal pour l'organisation courante.
 * ISOLATION MULTI-TENANT — voir `getDistinctAuditActions`.
 */
export async function getDistinctAuditEntities(): Promise<string[]> {
  const { organizationId } = await getCurrentSessionUser();

  const results = await prisma.auditLog.findMany({
    where: { organizationId },
    distinct: ["entity"],
    select: { entity: true },
    orderBy: { entity: "asc" },
  });
  return results.map((r) => r.entity);
}

/**
 * Récupère les utilisateurs de l'organisation courante ayant des entrées
 * d'audit.
 *
 * ISOLATION MULTI-TENANT — l'identifiant vient de la session. Les identifiants
 * collectés le sont via les lignes d'audit déjà filtrées sur l'organisation ;
 * le `findMany` utilisateur est donc borné à ce même périmètre.
 */
export async function getAuditLogUsers(): Promise<
  { id: string; firstName: string; lastName: string }[]
> {
  const { organizationId } = await getCurrentSessionUser();

  const ids = await prisma.auditLog.findMany({
    where: { organizationId },
    distinct: ["userId"],
    select: { userId: true },
  });
  if (ids.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: ids.map((r) => r.userId) } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { lastName: "asc" },
  });
}
