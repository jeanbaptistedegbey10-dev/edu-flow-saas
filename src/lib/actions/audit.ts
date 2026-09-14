"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getCurrentSessionUser } from "@/lib/session";
import type { AuditAction, AuditEntity } from "@/lib/audit-constants";

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
 */
export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    const user = await getCurrentSessionUser();

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        details:
          input.details != null
            ? (input.details as unknown as Prisma.InputJsonValue)
            : undefined,
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
  organizationId: string;
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

/** Récupère les entrées du journal d'audit avec filtres et pagination. */
export async function getAuditLogs(
  filters: AuditLogFilters
): Promise<AuditLogPage> {
  const {
    organizationId,
    userId,
    action,
    entity,
    startDate,
    endDate,
    page = 1,
    pageSize = 25,
  } = filters;

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

/** Récupère les actions distinctes pour une organisation. */
export async function getDistinctAuditActions(
  organizationId: string
): Promise<string[]> {
  const results = await prisma.auditLog.findMany({
    where: { organizationId },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return results.map((r) => r.action);
}

/** Récupère les entités distinctes pour une organisation. */
export async function getDistinctAuditEntities(
  organizationId: string
): Promise<string[]> {
  const results = await prisma.auditLog.findMany({
    where: { organizationId },
    distinct: ["entity"],
    select: { entity: true },
    orderBy: { entity: "asc" },
  });
  return results.map((r) => r.entity);
}

/** Récupère les utilisateurs ayant des entrées d'audit. */
export async function getAuditLogUsers(
  organizationId: string
): Promise<{ id: string; firstName: string; lastName: string }[]> {
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
