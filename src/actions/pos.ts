"use server";

import type { PaymentMethod, SaleStatus, TransactionType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { formatSaleReference } from "@/lib/receipt";
import {
  getCurrentOrganizationId,
  getCurrentSessionActor,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";
import { logAuditEvent } from "@/lib/actions/audit";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Article/service vendu au comptoir (grille POS). */
export type ProductServiceDTO = {
  id: string;
  name: string;
  /** Catégorie personnalisée (null = produit sans catégorie). */
  categoryId: string | null;
  /** Libellé de la catégorie personnalisée (null = produit sans catégorie). */
  categoryName: string | null;
  unitPrice: number;
  description: string | null;
};

/**
 * Catégorie personnalisée du catalogue, créée et gérée par l'organisation
 * (modèle `ProductCategory`) — aucune catégorie système figée.
 */
export type ProductCategoryDTO = {
  id: string;
  name: string;
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
  /**
   * Coordonnées optionnelles du client de passage (vente anonyme) :
   * affichées sur la facturette sous « Client de passage : Nom - Téléphone ».
   */
  guestName?: string | null;
  guestPhone?: string | null;
  /**
   * Vente encaissée « hors système » / à date antérieure : met à jour le solde
   * débiteur du client mais n'alimente PAS la session de caisse physique.
   * Forcé à `true` dès qu'une date effective antérieure à aujourd'hui est
   * fournie (une vente antérieure ne peut pas alimenter la caisse du jour).
   */
  isOutOfSystem?: boolean;
  /**
   * Date effective de l'encaissement (« YYYY-MM-DD » ou Date) — optionnelle.
   * Une date passée est admise pour une vente hors système / antérieure.
   */
  paidAt?: string | Date | null;
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
  /** Vente « hors système » / antérieure (exclue de la caisse physique). */
  isOutOfSystem: boolean;
  items: Array<{
    name: string;
    /** Libellé de la catégorie personnalisée (null = produit sans catégorie). */
    category: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
};

export type CreateSaleResult =
  | { ok: true; sale: SaleReceiptData }
  | { ok: false; message: string };

export type PosStatsDTO = {
  /** Nombre de ventes enregistrées sur la période. */
  periodSalesCount: number;
  /** Montant net encaissé sur la période (recettes caisse). */
  periodRevenue: number;
  /** Nombre de ventes enregistrées aujourd'hui. */
  todaySalesCount: number;
  /** Montant net encaissé aujourd'hui (recettes caisse). */
  todayRevenue: number;
  /** Montant net encaissé sur le mois en cours. */
  monthRevenue: number;
  /** Nombre d'articles/services actifs au catalogue. */
  activeProductsCount: number;
};

/** Plage de dates optionnelle pour le filtre POS. */
export type DateRangeFilter = {
  startDate: Date;
  endDate: Date;
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
  /** Vente « hors système » / antérieure (exclue de la caisse physique). */
  isOutOfSystem: boolean;
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

/**
 * Normalise une date effective saisie (« YYYY-MM-DD ») ou déjà typée `Date`.
 * L'heure est fixée à midi UTC — même convention que les règlements — afin
 * d'éviter tout décalage de jour lié aux fuseaux horaires.
 * Retourne `null` lorsque la valeur est absente ou invalide.
 */
function parseEffectiveDate(
  value: string | Date | null | undefined
): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const parsed = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Vrai lorsque la date fournie ne tombe pas le jour calendaire courant (UTC). */
function isNotToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getUTCFullYear() !== today.getUTCFullYear() ||
    date.getUTCMonth() !== today.getUTCMonth() ||
    date.getUTCDate() !== today.getUTCDate()
  );
}

/**
 * Construit le détail client imprimé sur la facturette d'une vente anonyme :
 * - aucune coordonnée saisie  → null (le reçu affiche « Client de passage ») ;
 * - nom seul                  → le nom ;
 * - téléphone seul            → le téléphone ;
 * - les deux                  → « Nom Prénom - Numéro ».
 */
function buildWalkInClientDetail(
  guestName?: string | null,
  guestPhone?: string | null
): string | null {
  const name = (guestName ?? "").trim();
  const phone = (guestPhone ?? "").trim();

  if (name && phone) return `${name} - ${phone}`;
  return name || phone || null;
}

// --------------------------------------
// Synchronisation Caisse → Étudiant (Relevé 360°)
// --------------------------------------

/**
 * Nature d'une transaction de caisse rattachée à un étudiant, déduite des
 * libellés des articles vendus au comptoir :
 * - BOOK    : au moins un article identifié comme livre / manuel ;
 * - SERVICE : au moins un article identifié comme prestation (photocopie,
 *             traduction, impression, scan…) ;
 * - OTHER   : aucune correspondance (produit ou service divers).
 * Priorité : BOOK > SERVICE > OTHER.
 */
// (helpers internes : un fichier « use server » ne peut exporter que des
// fonctions async — ces fonctions synchrones restent donc non exportées.)
function classifyTransactionType(
  productNames: string[]
): TransactionType {

  const haystack = productNames.join(" ").toLowerCase();
  if (/(^|\s|>)(livre|book|manuel|manuels|manuel scolaire)/.test(haystack)) {
    return "BOOK";
  }
    if (/(^|\s|>)(service|photocopie|photocopy|copie|copy|traduction|translation|impression|scan|repro|reprographie)/.test(haystack)) {
    return "SERVICE";
  }
  return "OTHER";
}

/** Concatène les articles vendus pour le libellé de la transaction (ex:
 * « 2× Manuel de Français + 1× Photocopie »). */
function buildTransactionDescription(
  items: Array<{ name: string; quantity: number }>
): string {
  return items
    .map((item) => `${item.quantity}× ${item.name}`)
    .join(", ");
}



/**
 * Récupère les catégories personnalisées du catalogue de l'organisation
 * (créées via « Gérer les catégories »), triées par libellé.
 */
export async function getProductCategories(): Promise<ProductCategoryDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    return await prisma.productCategory.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getProductCategories] Échec de lecture :", error);

    // Dégradation gracieuse : aucune catégorie plutôt que crash serveur.
    return [];
  }
}

/**
 * Récupère le catalogue actif des articles/services de l'organisation,
 * trié par catégorie puis nom — alimente la grille POS. Les produits sans
 * catégorie sont inclus (filtre « Sans catégorie » côté interface).
 */
export async function getProductServices(): Promise<ProductServiceDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const products = await prisma.productService.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        categoryId: true,
        category: { select: { name: true } },
        unitPrice: true,
        description: true,
      },
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? null,
      unitPrice: product.unitPrice,
      description: product.description,
    }));
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
 * sur la période et taille du catalogue actif.
 * Accepte une plage de dates optionnelle pour filtrer les résultats.
 *
 * Les ventes « hors système » / antérieures (`isOutOfSystem`) sont exclues :
 * elles mettent à jour le solde du client mais n'alimentent jamais la caisse
 * physique — elles ne doivent donc pas gonfler « Encaissé aujourd'hui » ni
 * « Encaissé ce mois ».
 */
export async function getPosStats(dateRange?: DateRangeFilter): Promise<PosStatsDTO> {
  const organizationId = await getCurrentOrganizationId();

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  try {
    // Construction du filtre de date pour la période personnalisée
    const periodWhere: Record<string, unknown> = {
      organizationId,
      status: "COMPLETED",
      // Règlements hors système exclus du tiroir-caisse (aucune recette live).
      isOutOfSystem: false,
    };
    if (dateRange) {
      periodWhere.createdAt = { gte: dateRange.startDate, lte: dateRange.endDate };
    } else {
      periodWhere.createdAt = { gte: dayStart };
    }

    const [periodAgg, periodCount, monthAgg, productsCount, todayCount] = await Promise.all([
      prisma.sale.aggregate({
        where: periodWhere,
        _sum: { netAmount: true },
      }),
      prisma.sale.count({
        where: periodWhere,
      }),
      prisma.sale.aggregate({
        where: {
          organizationId,
          status: "COMPLETED",
          isOutOfSystem: false,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { netAmount: true },
      }),
      prisma.productService.count({
        where: { organizationId, isActive: true },
      }),
      prisma.sale.count({
        where: {
          organizationId,
          status: "COMPLETED",
          isOutOfSystem: false,
          createdAt: { gte: dayStart },
        },
      }),
    ]);

    return {
      periodSalesCount: periodCount,
      periodRevenue: periodAgg._sum.netAmount ?? 0,
      todaySalesCount: todayCount,
      todayRevenue: periodAgg._sum.netAmount ?? 0,
      monthRevenue: monthAgg._sum.netAmount ?? 0,
      activeProductsCount: productsCount,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getPosStats] Échec de calcul des indicateurs :", error);

    // Dégradation gracieuse : indicateurs à zéro plutôt que crash serveur.
    return {
      periodSalesCount: 0,
      periodRevenue: 0,
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
 * de passage (éventuellement identifié par le nom saisi au comptoir).
 */
function resolveSaleClientName(client: {
  guestName?: string | null;
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

  const guestName = (client.guestName ?? "").trim();
  return guestName ? `Client de passage — ${guestName}` : "Client de passage";
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
  pageSize = 10,
  dateRange?: DateRangeFilter
): Promise<SalesHistoryPageDTO> {
  const organizationId = await getCurrentOrganizationId();

  const safePage = Math.max(1, Math.trunc(Number(page)) || 1);
  const safePageSize = Math.min(50, Math.max(1, Math.trunc(Number(pageSize)) || 10));

  // Construction du filtre de date
  const dateFilter: Record<string, unknown> = {};
  if (dateRange) {
    dateFilter.gte = dateRange.startDate;
    dateFilter.lte = dateRange.endDate;
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.sale.findMany({
        where: { organizationId, createdAt: dateFilter },
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        select: {
          id: true,
          netAmount: true,
          paymentMethod: true,
          status: true,
          createdAt: true,
          isOutOfSystem: true,
          guestName: true,
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
      prisma.sale.count({ where: { organizationId, createdAt: dateFilter } }),
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
        isOutOfSystem: sale.isOutOfSystem,
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
        isOutOfSystem: true,
        guestName: true,
        guestPhone: true,
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
            productService: {
              select: { name: true, category: { select: { name: true } } },
            },
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
        isOutOfSystem: sale.isOutOfSystem,
        clientName: resolveSaleClientName(sale),
        clientDetail: hasStudent
          ? "Étudiant inscrit"
          : hasTravelProcedure
            ? "Candidat voyage"
            : buildWalkInClientDetail(sale.guestName, sale.guestPhone),
        cashierName: `${sale.cashier.firstName} ${sale.cashier.lastName}`,
        items: sale.items.map((item) => ({
          name: item.productService.name,
          category: item.productService.category?.name ?? null,
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
// Mutation : création d'un article du catalogue POS
// --------------------------------------

/** Longueur maximale du libellé d'un article. */
const MAX_PRODUCT_NAME_LENGTH = 120;

/** Longueur maximale du libellé d'une catégorie personnalisée. */
const MAX_CATEGORY_NAME_LENGTH = 60;

/** Entrée de création d'un article du catalogue de la caisse. */
export type CreateProductServiceInput = {
  name: string;
  /** Catégorie personnalisée (null/absent = produit sans catégorie). */
  categoryId: string | null;
  /** Prix unitaire en FCFA (source de vérité serveur). */
  unitPrice: number;
  /** Disponibilité à la vente (article actif dans le catalogue). */
  isActive: boolean;
};

/** Article du catalogue tel que renvoyé après création (avec disponibilité). */
export type CreatedProductDTO = ProductServiceDTO & { isActive: boolean };

export type CreateProductServiceResult =
  | { ok: true; product: CreatedProductDTO }
  | { ok: false; message: string };

/**
 * Crée un nouvel article (produit/service) dans le catalogue de la caisse
 * de l'organisation active.
 *
 * Réservée aux administrateurs (ADMIN / SUPER_ADMIN). Validation stricte
 * côté serveur : libellé non vide, catégorie connue, prix numérique ≥ 0,
 * et refus des doublons (même libellé, insensible à la casse).
 */
export async function createProductServiceAction(
  input: CreateProductServiceInput
): Promise<CreateProductServiceResult> {
  await assertCanMutate();
  const user = await getCurrentSessionUser();

  // Action réservée aux administrateurs de l'établissement.
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return {
      ok: false,
      message: "Action réservée aux administrateurs de l'établissement.",
    };
  }

  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > MAX_PRODUCT_NAME_LENGTH) {
    return {
      ok: false,
      message: `Le libellé doit contenir entre 2 et ${MAX_PRODUCT_NAME_LENGTH} caractères.`,
    };
  }

  const categoryId = input.categoryId ? String(input.categoryId).trim() : null;

  if (categoryId) {
    // La catégorie doit exister ET appartenir à l'organisation active
    // (isolation multi-tenant).
    const category = await prisma.productCategory.findFirst({
      where: { id: categoryId, organizationId: user.organizationId },
      select: { id: true },
    });

    if (!category) {
      return { ok: false, message: "Catégorie d'article invalide." };
    }
  }

  const unitPrice = Number(input.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return {
      ok: false,
      message: "Le prix doit être un nombre positif (en FCFA).",
    };
  }

  try {
    // Refus des doublons : un même libellé ne doit pas figurer deux fois
    // dans le catalogue de l'organisation (insensible à la casse).
    const existing = await prisma.productService.findFirst({
      where: {
        organizationId: user.organizationId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      return {
        ok: false,
        message: `Un article « ${name} » existe déjà dans le catalogue.`,
      };
    }

    const created = await prisma.productService.create({
      data: {
        organizationId: user.organizationId,
        name,
        categoryId,
        unitPrice,
        isActive: input.isActive !== false,
      },
      select: {
        id: true,
        name: true,
        categoryId: true,
        category: { select: { name: true } },
        unitPrice: true,
        description: true,
        isActive: true,
      },
    });

    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard");

    return {
      ok: true,
      product: {
        id: created.id,
        name: created.name,
        categoryId: created.categoryId,
        categoryName: created.category?.name ?? null,
        unitPrice: created.unitPrice,
        description: created.description,
        isActive: created.isActive,
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createProductServiceAction] Échec de création :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la création de l'article.",
    };
  }
}

// --------------------------------------
// Mutations : catégories personnalisées du catalogue
// --------------------------------------

/** Entrée de création / renommage d'une catégorie personnalisée. */
export type SaveProductCategoryInput = {
  /** Présent = renommage de la catégorie ; absent ou null = création. */
  id?: string | null;
  name: string;
};

export type SaveProductCategoryResult =
  | { ok: true; category: ProductCategoryDTO }
  | { ok: false; message: string };

/**
 * Crée ou renomme une catégorie personnalisée du catalogue (modèle
 * `ProductCategory`). Réservée aux administrateurs.
 */
export async function saveProductCategoryAction(
  input: SaveProductCategoryInput
): Promise<SaveProductCategoryResult> {
  await assertCanMutate();
  try {
    const user = await getCurrentSessionUser();

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return {
        ok: false,
        message: "Action réservée aux administrateurs de l'établissement.",
      };
    }

    const name = String(input.name ?? "").trim();
    if (name.length < 2 || name.length > MAX_CATEGORY_NAME_LENGTH) {
      return {
        ok: false,
        message: `Le libellé doit contenir entre 2 et ${MAX_CATEGORY_NAME_LENGTH} caractères.`,
      };
    }

    if (input.id) {
      // Renommage : la catégorie doit appartenir à l'organisation active.
      const existing = await prisma.productCategory.findFirst({
        where: { id: input.id, organizationId: user.organizationId },
        select: { id: true },
      });

      if (!existing) {
        return { ok: false, message: "Catégorie introuvable." };
      }

      const duplicate = await prisma.productCategory.findFirst({
        where: {
          organizationId: user.organizationId,
          name: { equals: name, mode: "insensitive" },
          id: { not: existing.id },
        },
        select: { id: true },
      });

      if (duplicate) {
        return {
          ok: false,
          message: `Une catégorie « ${name} » existe déjà.`,
        };
      }

      const renamed = await prisma.productCategory.update({
        where: { id: existing.id },
        data: { name },
        select: { id: true, name: true },
      });

      revalidatePath("/dashboard/pos");

      return { ok: true, category: renamed };
    }

    // Création : refus des doublons (insensible à la casse).
    const duplicate = await prisma.productCategory.findFirst({
      where: {
        organizationId: user.organizationId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (duplicate) {
      return {
        ok: false,
        message: `Une catégorie « ${name} » existe déjà.`,
      };
    }

    const created = await prisma.productCategory.create({
      data: { organizationId: user.organizationId, name },
      select: { id: true, name: true },
    });

    revalidatePath("/dashboard/pos");

    return { ok: true, category: created };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[saveProductCategoryAction] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de l'enregistrement de la catégorie.",
    };
  }
}

/**
 * Supprime une catégorie personnalisée. Les produits rattachés restent
 * intacts : ils deviennent simplement « sans catégorie » (`onDelete: SetNull`).
 * Réservée aux administrateurs.
 */
export async function deleteProductCategoryAction(
  categoryId: string
): Promise<{ ok: boolean; message: string }> {
  await assertCanMutate();
  try {
    const user = await getCurrentSessionUser();

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return {
        ok: false,
        message: "Action réservée aux administrateurs de l'établissement.",
      };
    }

    const existing = await prisma.productCategory.findFirst({
      where: { id: categoryId, organizationId: user.organizationId },
      select: { id: true, name: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Catégorie introuvable ou appartenant à une autre organisation.",
      };
    }

    await prisma.productCategory.delete({ where: { id: existing.id } });

    revalidatePath("/dashboard/pos");

    return {
      ok: true,
      message: `Catégorie « ${existing.name} » supprimée. Ses articles sont désormais sans catégorie.`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteProductCategoryAction] Échec de suppression :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la suppression de la catégorie.",
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
  await assertCanMutate();
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

  // Coordonnées optionnelles du client de passage (vente anonyme) :
  // troncature défensive pour protéger la facturette d'un excès de saisie.
  const guestName =
    input.clientKind === "WALK_IN"
      ? String(input.guestName ?? "").trim().slice(0, 120) || null
      : null;
  const guestPhone =
    input.clientKind === "WALK_IN"
      ? String(input.guestPhone ?? "").trim().slice(0, 30) || null
      : null;

  // Date effective de l'encaissement + caractère « hors système ».
  const requestedPaidAt = parseEffectiveDate(input.paidAt ?? null);
  if (input.paidAt && !requestedPaidAt) {
    return { ok: false, message: "La date de l'encaissement est invalide." };
  }

  // Une date antérieure au jour courant caractérise une vente « hors système » :
  // elle ne peut pas alimenter la caisse physique du jour, le drapeau est donc
  // forcé même si la case n'a pas été cochée côté interface.
  const isOutOfSystem =
    input.isOutOfSystem === true ||
    (requestedPaidAt !== null && isNotToday(requestedPaidAt));
  const effectiveDate = requestedPaidAt ?? new Date();

  try {
    const organizationId = await getCurrentOrganizationId();

    // Auteur de la vente : l'ID et le NOM du caissier connecté sont figés
    // dans les métadonnées de la transaction (traçabilité) ET reportés dans
    // le Journal d'Audit. Le nom sert également à la facturette.
    const actor = await getCurrentSessionActor();
    const cashierName = actor.name;

    // Aucune session de caisse n'est EXIGÉE pour encaisser : le panier et
    // l'encaissement sont accessibles en direct (secrétaire, comptable,
    // admin). L'ouverture de la caisse reste un relevé de fond de caisse
    // facultatif, utile pour la clôture de fin de journée — elle ne
    // conditionne plus l'encaissement.

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

    // Nom du client reporté dans le JOURNAL D'AUDIT. Pour un client comptoir
    // (WALK_IN), la valeur EXACTE saisie par l'utilisateur est conservée
    // (traçabilité de la vente au comptoir) au lieu du libellé générique
    // « Client de passage » ; le repli sur ce libellé n'a lieu que si aucun
    // nom n'a été saisi.
    //
    // `clientName` (valeur d'affichage de la facturette) reste inchangé :
    // `buildSaleReceiptDocument` s'appuie dessus pour le rendu
    // « Client de passage : <nom - téléphone> » (cf. `src/lib/receipt.ts`).
    const auditClientName =
      input.clientKind === "WALK_IN" && guestName ? guestName : clientName;

    // Charge les prix officiels du catalogue (source de vérité serveur).
    const productIds = [...new Set(items.map((item) => item.productServiceId))];
    const products = await prisma.productService.findMany({
      where: { organizationId, id: { in: productIds }, isActive: true },
      select: {
        id: true,
        name: true,
        category: { select: { name: true } },
        unitPrice: true,
      },
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
          // Traçabilité : ID + nom du caissier connecté sont persistés dans
          // les métadonnées de la vente.
          createdById: actor.id,
          createdByName: cashierName,
          totalAmount,
          discount,
          netAmount,
          paymentMethod: input.paymentMethod as PaymentMethodValue,
          status: "COMPLETED",
          isOutOfSystem,
          // Date effective de l'encaissement : `createdAt` porte la date
          // comptable de la vente (les ventes antérieures sont horodatées à
          // leur date réelle et exclues de la caisse du jour).
          createdAt: effectiveDate,
          guestName,
          guestPhone,
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

      // Synchronisation Caisse → Étudiant (Relevé 360°) : lorsqu'une vente est
      // effectuée au nom d'un étudiant, mémoriser automatiquement l'achat dans
      // son relevé financier global (modèle `StudentTransaction`). Une telle
      // écriture est idempotent vis-à-vis de la vente : elle ne modifie en
      // rien le ticket de caisse, elle alimente uniquement le compte élève.
      if (studentId) {
        const lineItems = items.map((item) => {
          const product = productsById.get(item.productServiceId)!;
          return { name: product.name, quantity: item.quantity };
        });
        await tx.studentTransaction.create({
          data: {
            organizationId,
            studentId,
            type: classifyTransactionType(lineItems.map((i) => i.name)),
            description: buildTransactionDescription(lineItems),
            amount: netAmount,
            paymentMode: input.paymentMethod,
          },
        });
      }

      return created;
    });

    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard");

    // Journal d'audit : vente POS avec l'ID et le NOM du caissier connecté.
    await logAuditEvent({
      action: AUDIT_ACTIONS.SALE_CREATED,
      entity: AUDIT_ENTITIES.SALE,
      entityId: sale.id,
      details: {
        createdByUserId: actor.id,
        createdByUserName: cashierName,
        createdByUserRole: actor.role,
        totalAmount,
        discount,
        netAmount,
        paymentMethod: input.paymentMethod,
        isOutOfSystem,
        clientKind: input.clientKind,
        // Client comptoir (WALK_IN) : nom réellement saisi au comptoir.
        clientName: auditClientName,
        itemCount: items.length,
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      },
    });

    return {
      ok: true,
      sale: {
        id: sale.id,
        totalAmount,
        discount,
        netAmount,
        paymentMethod: input.paymentMethod as PaymentMethodValue,
        createdAt: sale.createdAt,
        isOutOfSystem,
        clientName,
        clientDetail:
          input.clientKind === "WALK_IN"
            ? buildWalkInClientDetail(guestName, guestPhone)
            : input.clientKind === "STUDENT"
              ? "Étudiant inscrit"
              : "Candidat voyage",
        cashierName,
        items: items.map((item) => {
          const product = productsById.get(item.productServiceId)!;
          return {
            name: product.name,
            category: product.category?.name ?? null,
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
