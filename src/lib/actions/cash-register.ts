"use server";

import type { CashSessionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import { logAuditEvent } from "@/lib/actions/audit";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";

// --------------------------------------
// Types publics
// --------------------------------------

export type CashSessionDTO = {
  id: string;
  status: CashSessionStatus;
  initialAmount: number;
  totalIncoming: number;
  totalOutgoing: number;
  theoreticalBalance: number;
  countedAmount: number | null;
  gapAmount: number | null;
  notes: string | null;
  openedAt: Date;
  closedAt: Date | null;
  openedBy: {
    firstName: string;
    lastName: string;
  };
};

export type CashSessionSummaryDTO = {
  session: CashSessionDTO;
  /** Ventes par moyen de paiement. */
  salesByMethod: Record<string, number>;
  /** Paiements par moyen de paiement. */
  paymentsByMethod: Record<string, number>;
  /** Dépenses de la session. */
  expensesTotal: number;
  /** Nombre de transactions (ventes + paiements). */
  transactionCount: number;
};

export type CashSessionResult =
  | { ok: true; session: CashSessionDTO }
  | { ok: false; message: string };

export type CashSessionSummaryResult =
  | { ok: true; summary: CashSessionSummaryDTO }
  | { ok: false; message: string };

// --------------------------------------
// Constantes
// --------------------------------------

const PAYMENT_METHOD_AGGREGATION = [
  "CASH",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CREDIT_CARD",
  "CHECK",
] as const;

// --------------------------------------
// Helpers internes
// --------------------------------------

function mapSession(session: {
  id: string;
  status: CashSessionStatus;
  initialAmount: number;
  totalIncoming: number;
  totalOutgoing: number;
  theoreticalBalance: number;
  countedAmount: number | null;
  gapAmount: number | null;
  notes: string | null;
  openedAt: Date;
  closedAt: Date | null;
  openedBy: { firstName: string; lastName: string };
}): CashSessionDTO {
  return {
    id: session.id,
    status: session.status,
    initialAmount: session.initialAmount,
    totalIncoming: session.totalIncoming,
    totalOutgoing: session.totalOutgoing,
    theoreticalBalance: session.theoreticalBalance,
    countedAmount: session.countedAmount,
    gapAmount: session.gapAmount,
    notes: session.notes,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    openedBy: session.openedBy,
  };
}

/** Calcule les totaux d'encaissements pour la session active. */
async function computeSessionTotals(
  organizationId: string,
  sessionOpenedAt: Date,
  tx: typeof prisma
): Promise<{ incoming: number; outgoing: number; transactionCount: number }> {
  // Encaissements : ventes (netAmount) + paiements (amount, non voided) depuis l'ouverture
  const salesAgg = await tx.sale.aggregate({
    where: {
      organizationId,
      createdAt: { gte: sessionOpenedAt },
      status: "COMPLETED",
    },
    _sum: { netAmount: true },
  });

  const paymentsAgg = await tx.payment.aggregate({
    where: {
      organizationId,
      paidAt: { gte: sessionOpenedAt },
      isVoided: false,
      status: { in: ["COMPLETED", "PARTIAL"] },
    },
    _sum: { amount: true },
  });

  // Décaissements : dépenses depuis l'ouverture
  const expensesAgg = await tx.expense.aggregate({
    where: {
      organizationId,
      expenseDate: { gte: sessionOpenedAt },
    },
    _sum: { amount: true },
  });

  const incoming =
    (salesAgg._sum.netAmount ?? 0) + (paymentsAgg._sum.amount ?? 0);
  const outgoing = expensesAgg._sum.amount ?? 0;

  // Nombre de transactions
  const salesCount = await tx.sale.count({
    where: {
      organizationId,
      createdAt: { gte: sessionOpenedAt },
      status: "COMPLETED",
    },
  });
  const paymentsCount = await tx.payment.count({
    where: {
      organizationId,
      paidAt: { gte: sessionOpenedAt },
      isVoided: false,
    },
  });

  return {
    incoming,
    outgoing,
    transactionCount: salesCount + paymentsCount,
  };
}

// --------------------------------------
// Actions serveur
// --------------------------------------

/**
 * Ouvre une nouvelle session de caisse avec un fond de caisse initial.
 * Empêche l'ouverture si une session est déjà active pour l'organisation.
 */
export async function openCashSession(
  initialAmount: number
): Promise<CashSessionResult> {
  await assertCanMutate();

  if (initialAmount < 0) {
    return { ok: false, message: "Le fond de caisse ne peut pas être négatif." };
  }

  const organizationId = await getCurrentOrganizationId();
  const user = await getCurrentSessionUser();

  try {
    // Vérifie qu'aucune session n'est déjà ouverte
    const existingOpen = await prisma.cashRegisterSession.findFirst({
      where: { organizationId, status: "OPEN" },
      select: { id: true },
    });

    if (existingOpen) {
      return {
        ok: false,
        message:
          "Une session de caisse est déjà ouverte. Veuillez la clôturer avant d'en ouvrir une nouvelle.",
      };
    }

    const session = await prisma.cashRegisterSession.create({
      data: {
        organizationId,
        openedById: user.id,
        status: "OPEN",
        initialAmount,
        totalIncoming: 0,
        totalOutgoing: 0,
        theoreticalBalance: initialAmount,
      },
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
      },
    });

    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/tresorerie");
    revalidatePath("/dashboard/payments");

    // Journal d'audit : ouverture de caisse
    await logAuditEvent({
      action: AUDIT_ACTIONS.CASH_OPENED,
      entity: AUDIT_ENTITIES.CASH_REGISTER_SESSION,
      entityId: session.id,
      details: { initialAmount, openedBy: user.id },
    });

    return { ok: true, session: mapSession(session) };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[openCashSession] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de l'ouverture de la caisse.",
    };
  }
}

/**
 * Clôture la session de caisse active :
 * - Recalcule le solde théorique (Fond initial + Encaissements − Décaissements)
 * - Calcule l'écart entre le montant compté et le solde théorique
 */
export async function closeCashSession(
  countedAmount: number,
  notes?: string
): Promise<CashSessionResult> {
  await assertCanMutate();

  if (countedAmount < 0) {
    return { ok: false, message: "Le montant compté ne peut pas être négatif." };
  }

  const organizationId = await getCurrentOrganizationId();
  const user = await getCurrentSessionUser();

  try {
    // Récupère la session active
    const activeSession = await prisma.cashRegisterSession.findFirst({
      where: { organizationId, status: "OPEN" },
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!activeSession) {
      return {
        ok: false,
        message: "Aucune session de caisse ouverte à clôturer.",
      };
    }

    // Recalcule les totaux à la clôture
    const totals = await computeSessionTotals(
      organizationId,
      activeSession.openedAt,
      prisma
    );

    const theoreticalBalance =
      activeSession.initialAmount + totals.incoming - totals.outgoing;
    const gapAmount = countedAmount - theoreticalBalance;

    const closed = await prisma.cashRegisterSession.update({
      where: { id: activeSession.id },
      data: {
        status: "CLOSED",
        closedById: user.id,
        totalIncoming: totals.incoming,
        totalOutgoing: totals.outgoing,
        theoreticalBalance,
        countedAmount,
        gapAmount,
        notes: notes ?? null,
        closedAt: new Date(),
      },
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
      },
    });

    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/tresorerie");
    revalidatePath("/dashboard/payments");

    // Journal d'audit : clôture de caisse
    await logAuditEvent({
      action: AUDIT_ACTIONS.CASH_CLOSED,
      entity: AUDIT_ENTITIES.CASH_REGISTER_SESSION,
      entityId: activeSession.id,
      details: { countedAmount, gapAmount, closedBy: user.id },
    });

    return { ok: true, session: mapSession(closed) };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[closeCashSession] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la clôture de la caisse.",
    };
  }
}

/**
 * Récupère la session de caisse active (ouverte) de l'organisation.
 * Retourne null si aucune session n'est ouverte.
 */
export async function getCashSessionStatus(): Promise<CashSessionDTO | null> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const session = await prisma.cashRegisterSession.findFirst({
      where: { organizationId, status: "OPEN" },
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { openedAt: "desc" },
    });

    return session ? mapSession(session) : null;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getCashSessionStatus] Échec :", error);
    return null;
  }
}

/**
 * Récupère le résumé complet de la session active pour la modale de clôture :
 * détail des encaissements par moyen de paiement, dépenses, et totaux.
 */
export async function getCashSessionSummary(): Promise<CashSessionSummaryResult> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const activeSession = await prisma.cashRegisterSession.findFirst({
      where: { organizationId, status: "OPEN" },
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!activeSession) {
      return { ok: false, message: "Aucune session de caisse ouverte." };
    }

    const since = activeSession.openedAt;

    // Ventes par moyen de paiement
    const salesByMethodRaw = await prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: {
        organizationId,
        createdAt: { gte: since },
        status: "COMPLETED",
        paymentMethod: { not: null },
      },
      _sum: { netAmount: true },
    });

    const salesByMethod: Record<string, number> = {};
    for (const method of PAYMENT_METHOD_AGGREGATION) {
      salesByMethod[method] = 0;
    }
    for (const row of salesByMethodRaw) {
      if (row.paymentMethod) {
        salesByMethod[row.paymentMethod] = row._sum.netAmount ?? 0;
      }
    }

    // Paiements par moyen de paiement
    const paymentsByMethodRaw = await prisma.payment.groupBy({
      by: ["paymentMethod"],
      where: {
        organizationId,
        paidAt: { gte: since },
        isVoided: false,
      },
      _sum: { amount: true },
    });

    const paymentsByMethod: Record<string, number> = {};
    for (const method of PAYMENT_METHOD_AGGREGATION) {
      paymentsByMethod[method] = 0;
    }
    for (const row of paymentsByMethodRaw) {
      paymentsByMethod[row.paymentMethod] = row._sum.amount ?? 0;
    }

    // Dépenses
    const expensesAgg = await prisma.expense.aggregate({
      where: {
        organizationId,
        expenseDate: { gte: since },
      },
      _sum: { amount: true },
    });

    // Totaux
    const totals = await computeSessionTotals(organizationId, since, prisma);
    const theoreticalBalance =
      activeSession.initialAmount + totals.incoming - totals.outgoing;

    return {
      ok: true,
      summary: {
        session: mapSession(activeSession),
        salesByMethod,
        paymentsByMethod,
        expensesTotal: expensesAgg._sum.amount ?? 0,
        transactionCount: totals.transactionCount,
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getCashSessionSummary] Échec :", error);
    return {
      ok: false,
      message: "Impossible de charger le résumé de la session.",
    };
  }
}
