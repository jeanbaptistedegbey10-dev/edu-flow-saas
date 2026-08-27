"use server";

import type { PaymentMethod, SaleStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { formatSaleReference } from "@/lib/receipt";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Article/service vendu au comptoir (grille POS). */
export type ProductServiceDTO = {
  id: string;
  name: string;
  category: "BOOK" | "TRANSLATION" | "COPY_SERVICE";
  unitPrice: number;
  description: string | null;
};

export type PosClientOption =
  | {
      kind: "STUDENT";
      id: string;
      label: string;
      detail: string;
    }
  | {
      kind: "TRAVEL_CANDIDATE";
      id: string;
      label: string;
      detail: string;
    };

/** Ligne du panier côté client (avant enregistrement). */
export type CartItemInput = {
  productServiceId: string;
  quantity: number;
};

export type CreateSaleInput = {
  /** null = client de passage (anonyme / comptoir). */
  clientKind: "WALK_IN" | "STUDENT" | "TRAVEL_CANDIDATE";
  clientId: string | null;
  items: CartItemInput[];
  discount: number;
  paymentMethod: string;
};

export type SaleReceiptData = {
  id: string;
  totalAmount: number;
  discount: number;
  netAmount: number;
  paymentMethod:
    | "CASH"
    | "BANK_TRANSFER"
    | "MOBILE_MONEY"
    | "CREDIT_CARD"
    | "CHECK"
    | null;
  createdAt: Date;
  clientName: string;
  clientDetail: string | null;
  cashierName: string;
  items: Array<{
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
};

export type CreateSaleResult =
  | { ok: true; sale: SaleReceiptData }
  | { ok: false; message: string };

export type PosStatsDTO = {
  /** Nombre de ventes enregistrées aujourd'hui. */
  todaySalesCount: number;
  /** Montant net encaissé aujourd'hui (recettes caisse). */
  todayRevenue: number;
  /** Montant net encaissé sur le mois en cours. */
  monthRevenue: number;
  /** Nombre d'articles/services actifs au catalogue. */
  activeProductsCount: number;
};

/** Ligne du tableau « Historique des ventes » du POS. */
export type SaleHistoryDTO = {
  id: string;
  /** Référence lisible du ticket (identique à la facturette imprimée). */
  reference: string;
  createdAt: Date;
  /** Nom du client : étudiant, candidat voyage ou « Client de passage ». */
  clientName: string;
  cashierName: string;
  netAmount: number;
  paymentMethod: PaymentMethod | null;
  status: SaleStatus;
  /** Nombre de lignes d'articles vendues. */
  itemCount: number;
};

/** Page du tableau « Historique des ventes » (pagination serveur). */
export type SalesHistoryPageDTO = {
  sales: SaleHistoryDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "CREDIT_CARD",
  "CHECK",
] as const;

type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

function isPaymentMethod(value: string): value is PaymentMethodValue {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

// --------------------------------------
// Lectures
// --------------------------------------

/**
 * Récupère le catalogue actif des articles/services de l'organisation,
 * trié par catégorie puis nom — alimente la grille POS.
 */
export async function getProductServices(): Promise<ProductServiceDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    return await prisma.productService.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        unitPrice: true,
        description: true,
      },
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getProductServices] Échec de lecture :", error);

    // Dégradation gracieuse : catalogue vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Récupère les options de client pour la caisse :
 * étudiants inscrits et candidats voyage (dossiers ouverts).
 */
export async function getPosClientOptions(): Promise<PosClientOption[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const [students, candidates] = await Promise.all([
    prisma.student.findMany({
      where: { organizationId, status: { in: ["ENROLLED", "IN_PROGRESS"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
      },
    }),
      prisma.travelProcedure.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          destination: true,
          candidateName: true,
          studentId: true,
          student: {
            select: { firstName: true, lastName: true, studentCode: true },
          },
        },
      }),
    ]);

    const options: PosClientOption[] = students.map((student) => ({
      kind: "STUDENT",
      id: student.id,
      label: `${student.firstName} ${student.lastName}`,
      detail: `Étudiant · ${student.studentCode}`,
    }));

    for (const candidate of candidates) {
      const name = candidate.student
        ? `${candidate.student.firstName} ${candidate.student.lastName}`
        : (candidate.candidateName ?? "Candidat externe");

      options.push({
        kind: "TRAVEL_CANDIDATE",
        id: candidate.id,
        label: name,
        detail: `Candidat voyage · ${candidate.destination}`,
      });
    }

    return options;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getPosClientOptions] Échec de lecture :", error);

    // Dégradation gracieuse : aucune option client plutôt que crash serveur.
    return [];
  }
}

/**
 * Indicateurs de la caisse : recettes du jour, du mois, nombre de ventes
 * du jour et taille du catalogue actif.
 */
export async function getPosStats(): Promise<PosStatsDTO> {
  const organizationId = await getCurrentOrganizationId();

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  try {
    const [todayAgg, monthAgg, todayCount, productsCount] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          organizationId,
          status: "COMPLETED",
          createdAt: { gte: dayStart },
        },
        _sum: { netAmount: true },
      }),
      prisma.sale.aggregate({
        where: {
          organizationId,
          status: "COMPLETED",
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { netAmount: true },
      }),
      prisma.sale.count({
        where: { organizationId, createdAt: { gte: dayStart } },
      }),
      prisma.productService.count({
        where: { organizationId, isActive: true },
      }),
    ]);

    return {
      todaySalesCount: todayCount,
      todayRevenue: todayAgg._sum.netAmount ?? 0,
      monthRevenue: monthAgg._sum.netAmount ?? 0,
      activeProductsCount: productsCount,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getPosStats] Échec de calcul des indicateurs :", error);

    // Dégradation gracieuse : indicateurs à zéro plutôt que crash serveur.
    return {
      todaySalesCount: 0,
      todayRevenue: 0,
      monthRevenue: 0,
      activeProductsCount: 0,
    };
  }
}

/**
 * Résout le nom affichable du client d'une vente selon sa rattachement :
 * étudiant inscrit, candidat voyage (étudiant lié ou nom saisi) ou client
 * de passage.
 */
function resolveSaleClientName(client: {
  student: { firstName: string; lastName: string } | null;
  travelProcedure: {
    candidateName: string | null;
    student: { firstName: string; lastName: string } | null;
  } | null;
}): string {
  if (client.student) {
    return `${client.student.firstName} ${client.student.lastName}`;
  }

  if (client.travelProcedure) {
    return (
      (client.travelProcedure.student
        ? `${client.travelProcedure.student.firstName} ${client.travelProcedure.student.lastName}`
        : null) ??
      client.travelProcedure.candidateName ??
      "Candidat externe"
    );
  }

  return "Client de passage";
}

/**
 * Récupère une page de l'historique des ventes de l'organisation active,
 * triée de la plus récente à la plus ancienne.
 *
 * Pagination côté serveur : la table des ventes pouvant croître
 * indéfiniment, seules les lignes de la page demandée sont chargées.
 */
export async function getSalesHistory(
  page = 1,
  pageSize = 10
): Promise<SalesHistoryPageDTO> {
  const organizationId = await getCurrentOrganizationId();

  const safePage = Math.max(1, Math.trunc(Number(page)) || 1);
  const safePageSize = Math.min(50, Math.max(1, Math.trunc(Number(pageSize)) || 10));

  try {
    const [rows, total] = await Promise.all([
      prisma.sale.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        select: {
          id: true,
          netAmount: true,
          paymentMethod: true,
          status: true,
          createdAt: true,
          student: { select: { firstName: true, lastName: true } },
          travelProcedure: {
            select: {
              candidateName: true,
              student: { select: { firstName: true, lastName: true } },
            },
          },
          cashier: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.sale.count({ where: { organizationId } }),
    ]);

    return {
      sales: rows.map((sale) => ({
        id: sale.id,
        reference: formatSaleReference(sale.id),
        createdAt: sale.createdAt,
        clientName: resolveSaleClientName(sale),
        cashierName: `${sale.cashier.firstName} ${sale.cashier.lastName}`,
        netAmount: sale.netAmount,
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        itemCount: sale._count.items,
      })),
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getSalesHistory] Échec de lecture :", error);

    // Dégradation gracieuse : page vide plutôt que crash serveur.
    return {
      sales: [],
      page: safePage,
      pageSize: safePageSize,
      total: 0,
      totalPages: 1,
    };
  }
}

/** Résultat de la récupération des données de réimpression d'une facturette. */
export type SaleReceiptResult =
  | { ok: true; sale: SaleReceiptData }
  | { ok: false; message: string };

/**
 * Recharge les données complètes d'une vente passée pour réimprimer sa
 * facturette (même document HTML que lors de l'encaissement initial).
 */
export async function getSaleReceiptData(
  saleId: string
): Promise<SaleReceiptResult> {
  if (!saleId) {
    return { ok: false, message: "Identifiant de vente manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : la vente doit appartenir à l'organisation active.
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      select: {
        id: true,
        totalAmount: true,
        discount: true,
        netAmount: true,
        paymentMethod: true,
        createdAt: true,
        student: { select: { firstName: true, lastName: true } },
        travelProcedure: {
          select: {
            candidateName: true,
            student: { select: { firstName: true, lastName: true } },
          },
        },
        cashier: { select: { firstName: true, lastName: true } },
        items: {
          orderBy: { id: "asc" },
          select: {
            quantity: true,
            unitPrice: true,
            subtotal: true,
            productService: { select: { name: true, category: true } },
          },
        },
      },
    });

    if (!sale) {
      return { ok: false, message: "Vente introuvable dans votre organisation." };
    }

    const hasStudent = Boolean(sale.student);
    const hasTravelProcedure = Boolean(sale.travelProcedure);

    return {
      ok: true,
      sale: {
        id: sale.id,
        totalAmount: sale.totalAmount,
        discount: sale.discount,
        netAmount: sale.netAmount,
        paymentMethod: sale.paymentMethod,
        createdAt: sale.createdAt,
        clientName: resolveSaleClientName(sale),
        clientDetail: hasStudent
          ? "Étudiant inscrit"
          : hasTravelProcedure
            ? "Candidat voyage"
            : null,
        cashierName: `${sale.cashier.firstName} ${sale.cashier.lastName}`,
        items: sale.items.map((item) => ({
          name: item.productService.name,
          category: item.productService.category,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
        })),
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getSaleReceiptData] Échec de lecture :", error);

    return {
      ok: false,
      message:
        "Impossible de charger la facturette pour le moment. Réessayez.",
    };
  }
}

// --------------------------------------
// Mutation : enregistrement d'une vente
// --------------------------------------

/**
 * Enregistre une vente comptoir (Sale + SaleItems) dans une transaction :
 * - vérifie que chaque article appartient à l'organisation active,
 * - recalcule les sous-totaux côté serveur (jamais depuis le client),
 * - applique la remise saisie au comptoir.
 *
 * Les montants encaissés alimentent les recettes globales via l'agrégat
 * des ventes COMPLETED (consommé par getPosStats et le tableau de bord).
 */
export async function createSaleAction(
  input: CreateSaleInput
): Promise<CreateSaleResult> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, message: "Le panier est vide." };
  }

  // Quantités valides uniquement.
  const items = input.items.map((item) => ({
    productServiceId: String(item.productServiceId ?? "").trim(),
    quantity: Math.trunc(Number(item.quantity)),
  }));

  if (items.some((item) => !item.productServiceId)) {
    return { ok: false, message: "Article invalide dans le panier." };
  }
  if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return { ok: false, message: "Les quantités doivent être supérieures à 0." };
  }

  const discount = Number(input.discount ?? 0);
  if (!Number.isFinite(discount) || discount < 0) {
    return { ok: false, message: "La remise doit être positive." };
  }

  if (!isPaymentMethod(String(input.paymentMethod))) {
    return { ok: false, message: "Moyen de paiement invalide." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();
    const user = await getCurrentSessionUser();

    // Nom du caissier pour la facturette.
    const cashier = await prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true },
    });
    const cashierName = cashier
      ? `${cashier.firstName} ${cashier.lastName}`
      : "Caisse";

    // Résout le client éventuel (étudiant inscrit ou candidat voyage).
    let studentId: string | null = null;
    let travelProcedureId: string | null = null;
    let clientName = "Client de passage";

    if (input.clientKind === "STUDENT" && input.clientId) {
      const student = await prisma.student.findFirst({
        where: { id: input.clientId, organizationId },
        select: { id: true, firstName: true, lastName: true },
      });

      if (!student) {
        return { ok: false, message: "Étudiant introuvable." };
      }

      studentId = student.id;
      clientName = `${student.firstName} ${student.lastName}`;
    } else if (input.clientKind === "TRAVEL_CANDIDATE" && input.clientId) {
      const procedure = await prisma.travelProcedure.findFirst({
        where: { id: input.clientId, organizationId },
        select: {
          id: true,
          studentId: true,
          candidateName: true,
          student: { select: { firstName: true, lastName: true } },
        },
      });

      if (!procedure) {
        return { ok: false, message: "Candidat voyage introuvable." };
      }

      travelProcedureId = procedure.id;
      // Si le candidat est aussi un étudiant, rattache la vente à son compte.
      studentId = procedure.studentId;
      clientName = procedure.student
        ? `${procedure.student.firstName} ${procedure.student.lastName}`
        : (procedure.candidateName ?? "Candidat externe");
    }

    // Charge les prix officiels du catalogue (source de vérité serveur).
    const productIds = [...new Set(items.map((item) => item.productServiceId))];
    const products = await prisma.productService.findMany({
      where: { organizationId, id: { in: productIds }, isActive: true },
      select: { id: true, name: true, category: true, unitPrice: true },
    });

    const productsById = new Map(products.map((p) => [p.id, p]));

    for (const item of items) {
      if (!productsById.has(item.productServiceId)) {
        return {
          ok: false,
          message: "Un article du panier est introuvable ou inactif.",
        };
      }
    }

    const totalAmount = items.reduce((sum, item) => {
      const product = productsById.get(item.productServiceId);
      return sum + (product ? product.unitPrice * item.quantity : 0);
    }, 0);

    if (discount > totalAmount) {
      return {
        ok: false,
        message: "La remise ne peut excéder le total du panier.",
      };
    }

    const netAmount = totalAmount - discount;

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          organizationId,
          studentId,
          travelProcedureId,
          createdById: user.id,
          totalAmount,
          discount,
          netAmount,
          paymentMethod: input.paymentMethod as PaymentMethodValue,
          status: "COMPLETED",
        },
      });

      await tx.saleItem.createMany({
        data: items.map((item) => {
          const product = productsById.get(item.productServiceId)!;
          return {
            saleId: created.id,
            productServiceId: item.productServiceId,
            quantity: item.quantity,
            unitPrice: product.unitPrice,
            subtotal: product.unitPrice * item.quantity,
          };
        }),
      });

      return created;
    });

    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard");

    return {
      ok: true,
      sale: {
        id: sale.id,
        totalAmount,
        discount,
        netAmount,
        paymentMethod: input.paymentMethod as PaymentMethodValue,
        createdAt: sale.createdAt,
        clientName,
        clientDetail:
          input.clientKind === "WALK_IN"
            ? null
            : input.clientKind === "STUDENT"
              ? "Étudiant inscrit"
              : "Candidat voyage",
        cashierName,
        items: items.map((item) => {
          const product = productsById.get(item.productServiceId)!;
          return {
            name: product.name,
            category: product.category,
            quantity: item.quantity,
            unitPrice: product.unitPrice,
            subtotal: product.unitPrice * item.quantity,
          };
        }),
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createSaleAction] Échec de création :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de l'enregistrement de la vente.",
    };
  }
}
