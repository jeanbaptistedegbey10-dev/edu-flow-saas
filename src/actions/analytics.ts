"use server";

// --------------------------------------
// Actions analytiques du tableau de bord
// --------------------------------------
//
// Agrégations serveur destinées à la vue analytique (/dashboard) et à ses
// graphiques Recharts. Principes :
// - Isolation multi-tenant : chaque requête est filtrée par l'organisation
//   active résolue depuis la session revalidée contre la base ;
// - Règles métier identiques aux modules existants :
//     * Encaissements scolaires / voyage : paiements `COMPLETED`
//       (+ `PARTIAL` pour les dossiers voyage, cf. src/actions/travels.ts) ;
//     * Ventes POS : ventes `COMPLETED`, montant net (cf. src/actions/pos.ts) ;
//     * Impayés : max(0, montantNet − encaissé) ;
// - Sécurité des rôles : les actions exposant des données financières
//   rejettent explicitement les rôles TEACHER et STUDENT (défense en
//   profondeur en plus du filtrage côté page) ;
// - Dégradation gracieuse : une panne SQL renvoie des valeurs neutres plutôt
//   que de faire crasher le rendu du tableau de bord.

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import type { RecentPaymentDTO } from "@/actions/dashboard";
import { STUDENT_STATUS_LABELS } from "@/lib/student-status";

// --------------------------------------
// Types publics (contrat avec les composants serveur/clients)
// --------------------------------------

export type CollectedBreakdownDTO = {
  /** Encaissements de scolarité (paiements hors dossiers voyage). */
  scolarite: number;
  /** Encaissements rattachés aux procédures de voyage. */
  voyages: number;
  /** Encaissements des ventes comptoir (POS). */
  pos: number;
  /** Total encaissé toutes sources confondues. */
  total: number;
};

export type OutstandingBreakdownDTO = {
  /** Restes à payer de scolarité (somme par étudiant). */
  scolarite: number;
  /** Restes à payer des procédures de voyage. */
  voyages: number;
  /** Total impayé en cours. */
  total: number;
};

/** Type d'un impayé prioritaire (alimente les alertes rapides). */
export type UnpaidAlertSource = "SCOLARITE" | "VOYAGE";

export type UnpaidAlertDTO = {
  id: string;
  sourceType: UnpaidAlertSource;
  /** Nom affichable : étudiant ou candidat externe. */
  label: string;
  /** Contexte secondaire : code étudiant ou destination du dossier. */
  subtitle: string | null;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
};

export type DashboardAnalyticsDTO = {
  /** Total encaissé du mois courant ventilé par source. */
  collectedThisMonth: CollectedBreakdownDTO;
  /** Total impayé en cours (scolarité + procédures voyage). */
  outstanding: OutstandingBreakdownDTO;
  /** Étudiants actifs (ENROLLED ou IN_PROGRESS). */
  activeStudentsCount: number;
  /**
   * Taux de présence moyen du mois courant (0–100, LATE compté comme
   * présent). `null` si aucune émargement n'a été saisi ce mois-ci.
   */
  monthlyAttendanceRate: number | null;
  /** Nombre d'émargements saisis durant le mois courant. */
  attendanceEntriesThisMonth: number;
  /** Les 5 derniers versements enregistrés (par date de paiement). */
  recentPayments: RecentPaymentDTO[];
  /** Les 5 impayés les plus élevés, tous types confondus. */
  unpaidAlerts: UnpaidAlertDTO[];
};

// --------------------------------------
// Utilitaires internes (dates, sécurité, formats)
// --------------------------------------

const FRENCH_MONTH_ABBREVIATIONS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/** Clé de mois stable : « YYYY-MM ». */
function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Libellé court déterministe d'un mois : « janv. 26 » (sans Intl, sans fuseau). */
function monthLabelOf(key: string): string {
  const [yearPart, monthPart] = key.split("-");
  const monthIndex = Number(monthPart) - 1;
  const year = Number(yearPart);
  return `${FRENCH_MONTH_ABBREVIATIONS[monthIndex]} ${String(year % 100).padStart(2, "0")}`;
}

/** Premier jour du mois en cours (heure locale, cohérente avec pos.ts). */
function currentMonthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

type MonthBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

/**
 * Construit les `months` buckets mensuels consécutifs se terminant par le
 * mois courant (index [months-1] = mois le plus ancien … index 0 ignoré ;
 * l'ordre retourné est chronologique du plus ancien au plus récent).
 */
function buildMonthBuckets(months: number): MonthBucket[] {
  const now = new Date();
  const anchors = Array.from({ length: months }, (_, index) => {
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - (months - 1 - index),
      1
    );
    return {
      key: monthKeyOf(start),
      label: monthLabelOf(monthKeyOf(start)),
      start,
      end: new Date(start.getFullYear(), start.getMonth() + 1, 1),
    };
  });

  return anchors;
}

/** Arrondit un montant flottant à l'unité (le FCFA n'a pas de centimes). */
function roundAmount(value: number): number {
  return Math.round(value);
}

/** Taux arrondi à une décimale, borné à 0–100. */
function roundRate(rate: number): number {
  return Math.min(100, Math.max(0, Math.round(rate * 10) / 10));
}

/**
 * Garde-fou financier : les indicateurs de revenus / impayés ne sont JAMAIS
 * exposés aux enseignants ni aux étudiants, même si une action venait à être
 * invoquée directement (défense en profondeur côté serveur).
 */
function assertFinancialAccess(role: string): void {
  if (role === "TEACHER" || role === "STUDENT") {
    throw new Error(
      "Accès refusé : les données financières sont réservées aux rôles administratifs."
    );
  }
}

// --------------------------------------
// Server Action — Indicateurs principaux du tableau de bord
// --------------------------------------

/**
 * Agrège les indicateurs clés du tableau de bord pour l'organisation active :
 * - Total encaissé du mois (scolarité + procédures voyage + POS) ;
 * - Total impayé en cours (scolarité + procédures voyage) ;
 * - Nombre d'étudiants actifs et taux de présence moyen du mois ;
 * - 5 derniers versements et alertes d'impayés prioritaires.
 *
 * Isolation multi-tenant garantie par `organizationId` ; les rôles TEACHER et
 * STUDENT sont rejetés en amont (aucune donnée financière ne doit leur être
 * sérialisée, même en cas de mauvais usage de l'action).
 */
export async function getDashboardStatsAction(): Promise<DashboardAnalyticsDTO> {
  const user = await getCurrentSessionUser();
  assertFinancialAccess(user.role);
  const organizationId = user.organizationId;

  const now = new Date();
  const monthStart = currentMonthStart(now);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  try {
    const [
      schoolPaymentsAggregate,
      travelPaymentsAggregate,
      posSalesAggregate,
      activeStudentsCount,
      attendanceStatusCounts,
      studentsWithBalance,
      studentPaidGroups,
      travelsWithBalance,
      travelPaidGroups,
      recentPaymentsRows,
    ] = await Promise.all([
      // Encaissements scolaires du mois : paiements COMPLETED non rattachés à
      // un dossier voyage.
      prisma.payment.aggregate({
        where: {
          organizationId,
          status: "COMPLETED",
          paidAt: { gte: monthStart, lt: monthEnd },
          travelProcedureId: null,
        },
        _sum: { amount: true },
      }),

      // Encaissements voyages du mois : paiements COMPLETED liés à un dossier.
      prisma.payment.aggregate({
        where: {
          organizationId,
          status: "COMPLETED",
          paidAt: { gte: monthStart, lt: monthEnd },
          travelProcedureId: { not: null },
        },
        _sum: { amount: true },
      }),

      // Ventes POS du mois : ventes COMPLETED, montant net encaissé.
      prisma.sale.aggregate({
        where: {
          organizationId,
          status: "COMPLETED",
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { netAmount: true },
      }),

      // Étudiants actifs : officiellement inscrits ou en cours de formation.
      prisma.student.count({
        where: { organizationId, status: { in: ["ENROLLED", "IN_PROGRESS"] } },
      }),

      // Répartition des émargements du mois par statut (une seule requête).
      prisma.attendance.groupBy({
        by: ["status"],
        where: {
          organizationId,
          date: { gte: monthStart, lt: monthEnd },
        },
                _count: { _all: true },
      }),

      // Étudiants avec montant net facturé — base du calcul des impayés
      // scolaires et des alertes prioritaires.
      prisma.student.findMany({
        where: {
          organizationId,
          netAmount: { not: null, gt: 0 },
        },
        select: {
          id: true,
          studentCode: true,
          firstName: true,
          lastName: true,
          netAmount: true,
        },
      }),

      // Total encaissé par étudiant (règlements confirmés uniquement, même
      // règle que src/actions/students.ts getStudentDetail).
      prisma.payment.groupBy({
        by: ["studentId"],
        where: {
          organizationId,
          status: "COMPLETED",
          studentId: { not: null },
        },
        _sum: { amount: true },
      }),

      // Dossiers de voyage facturés — base des impayés voyages / alertes.
      prisma.travelProcedure.findMany({
        where: {
          organizationId,
          OR: [{ netAmount: { gt: 0 } }, { totalCost: { gt: 0 } }],
        },
        select: {
          id: true,
          destination: true,
          candidateName: true,
          totalCost: true,
          discount: true,
          netAmount: true,
          student: {
            select: {
              id: true,
              studentCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),

      // Total encaissé par dossier voyage (COMPLETED + PARTIAL, même règle
      // que la vue liste des voyages).
      prisma.payment.groupBy({
        by: ["travelProcedureId"],
        where: {
          organizationId,
          status: { in: ["COMPLETED", "PARTIAL"] },
          travelProcedureId: { not: null },
        },
        _sum: { amount: true },
      }),

      // Les 5 derniers versements enregistrés, rattachés à un étudiant
      // (`studentId` nullable au schéma : on écarte les lignes orphelines).
      prisma.payment
        .findMany({
          where: { organizationId },
          orderBy: { paidAt: "desc" },
          take: 5,
          select: {
            id: true,
            amount: true,
            currency: true,
            paymentMethod: true,
            status: true,
            paidAt: true,
            student: {
              select: {
                id: true,
                studentCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        })
        .then((rows) =>
          rows.flatMap((row) =>
            row.student ? [{ ...row, student: row.student }] : []
          )
        ),
    ]);

    // ----- Impayés & alertes prioritaires -----
    const paidByStudentId = new Map<string, number>();
    for (const group of studentPaidGroups) {
      if (group.studentId) {
        paidByStudentId.set(group.studentId, group._sum.amount ?? 0);
      }
    }

    const unpaidAlerts: UnpaidAlertDTO[] = [];
    let outstandingScolarite = 0;

    for (const student of studentsWithBalance) {
      const netAmount = student.netAmount ?? 0;
      if (netAmount <= 0) continue;

      const paidAmount = Math.max(paidByStudentId.get(student.id) ?? 0, 0);
      const remainingAmount = Math.max(netAmount - paidAmount, 0);
      if (remainingAmount <= 0) continue;

      outstandingScolarite += remainingAmount;
      unpaidAlerts.push({
        id: student.id,
        sourceType: "SCOLARITE",
        label: `${student.firstName} ${student.lastName}`,
        subtitle: student.studentCode,
        netAmount,
        paidAmount,
        remainingAmount,
      });
    }

    const paidByTravelId = new Map<string, number>();
    for (const group of travelPaidGroups) {
      if (group.travelProcedureId) {
        paidByTravelId.set(group.travelProcedureId, group._sum.amount ?? 0);
      }
    }

    let outstandingVoyages = 0;

    for (const travel of travelsWithBalance) {
      // Même convention que le module voyages : le montant net facturé vaut
      // `netAmount`, sinon total − remise.
      const netAmount =
        travel.netAmount || Math.max(travel.totalCost - travel.discount, 0);
      if (netAmount <= 0) continue;

      const paidAmount = Math.max(paidByTravelId.get(travel.id) ?? 0, 0);
      const remainingAmount = Math.max(netAmount - paidAmount, 0);
      if (remainingAmount <= 0) continue;

      outstandingVoyages += remainingAmount;
      unpaidAlerts.push({
        id: travel.id,
        sourceType: "VOYAGE",
        label: travel.student
          ? `${travel.student.firstName} ${travel.student.lastName}`
          : (travel.candidateName ?? "Candidat externe"),
        subtitle: travel.destination,
        netAmount,
        paidAmount,
        remainingAmount,
      });
    }

    unpaidAlerts.sort((a, b) => b.remainingAmount - a.remainingAmount);

    // ----- Assiduité du mois -----
    // Les retardataires ont bien assisté au cours : PRESENT et LATE comptent
    // comme présences effectives.
    const presentishCount = attendanceStatusCounts
      .filter((row) => row.status === "PRESENT" || row.status === "LATE")
      .reduce((total, row) => total + row._count._all, 0);
    const attendanceEntriesThisMonth = attendanceStatusCounts.reduce(
      (total, row) => total + row._count._all,
      0
    );

    return {
      collectedThisMonth: {
        scolarite: roundAmount(schoolPaymentsAggregate._sum.amount ?? 0),
        voyages: roundAmount(travelPaymentsAggregate._sum.amount ?? 0),
        pos: roundAmount(posSalesAggregate._sum.netAmount ?? 0),
        total: roundAmount(
          (schoolPaymentsAggregate._sum.amount ?? 0) +
            (travelPaymentsAggregate._sum.amount ?? 0) +
            (posSalesAggregate._sum.netAmount ?? 0)
        ),
      },
      outstanding: {
        scolarite: roundAmount(outstandingScolarite),
        voyages: roundAmount(outstandingVoyages),
        total: roundAmount(outstandingScolarite + outstandingVoyages),
      },
      activeStudentsCount,
      monthlyAttendanceRate:
        attendanceEntriesThisMonth > 0
          ? roundRate((presentishCount / attendanceEntriesThisMonth) * 100)
          : null,
      attendanceEntriesThisMonth,
      recentPayments: recentPaymentsRows.map((row) => ({
        id: row.id,
        amount: row.amount,
        currency: row.currency,
        paymentMethod: row.paymentMethod,
        status: row.status,
        paidAt: row.paidAt,
        student: row.student,
      })),
      unpaidAlerts: unpaidAlerts.slice(0, 5).map((alert) => ({
        ...alert,
        netAmount: roundAmount(alert.netAmount),
        paidAmount: roundAmount(alert.paidAmount),
        remainingAmount: roundAmount(alert.remainingAmount),
      })),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getDashboardStatsAction] Échec de calcul des indicateurs :",
      error
    );

    // Dégradation gracieuse : tableau vide plutôt que crash serveur.
    return {
      collectedThisMonth: { scolarite: 0, voyages: 0, pos: 0, total: 0 },
      outstanding: { scolarite: 0, voyages: 0, total: 0 },
      activeStudentsCount: 0,
      monthlyAttendanceRate: null,
      attendanceEntriesThisMonth: 0,
      recentPayments: [],
      unpaidAlerts: [],
    };
  }
}

// --------------------------------------
// Server Action — Évolution mensuelle des recettes (graphique BarChart)
// --------------------------------------

/** Point mensuel du graphique des recettes. */
export type FinancialOverviewPointDTO = {
  /** Clé stable « YYYY-MM ». */
  key: string;
  /** Libellé court déterministe (« janv. 26 »). */
  label: string;
  /** Recettes scolarité encaissées dans le mois. */
  scolarite: number;
  /** Recettes procédures voyage encaissées dans le mois. */
  voyages: number;
  /** Recettes ventes POS du mois. */
  pos: number;
};

/**
 * Données mensuelles des recettes sur les N derniers mois (6 par défaut,
 * bornées à 12), ventilées par source pour le BarChart Recharts.
 * Seuls les rôles administratifs y ont accès.
 */
export async function getFinancialOverviewAction(
  months = 6
): Promise<FinancialOverviewPointDTO[]> {
  const user = await getCurrentSessionUser();
  assertFinancialAccess(user.role);
  const organizationId = user.organizationId;

  // Fenêtre normalisée entre 1 et 12 mois (6 par défaut).
  const windowSize = Math.min(Math.max(Math.trunc(months) || 6, 1), 12);
  const buckets = buildMonthBuckets(windowSize);
  if (buckets.length === 0) return [];

  const windowStart = buckets[0].start;

  try {
    const [payments, sales] = await Promise.all([
      // Paiements confirmés de la fenêtre : classés voyage si liés à un
      // dossier, sinon scolarité.
      prisma.payment.findMany({
        where: {
          organizationId,
          status: "COMPLETED",
          paidAt: { gte: windowStart },
        },
        select: {
          amount: true,
          paidAt: true,
          travelProcedureId: true,
        },
      }),

      // Ventes POS terminées de la fenêtre (montant net).
      prisma.sale.findMany({
        where: {
          organizationId,
          status: "COMPLETED",
          createdAt: { gte: windowStart },
        },
        select: {
          netAmount: true,
          createdAt: true,
        },
      }),
    ]);

    // Buckets indexés par clé de mois pour un classement O(1).
    const totalsByKey = new Map<string, { scolarite: number; voyages: number; pos: number }>();
    for (const bucket of buckets) {
      totalsByKey.set(bucket.key, { scolarite: 0, voyages: 0, pos: 0 });
    }

    for (const payment of payments) {
      const key = monthKeyOf(payment.paidAt);
      const totals = totalsByKey.get(key);
      if (!totals) continue;

      if (payment.travelProcedureId !== null) {
        totals.voyages += payment.amount;
      } else {
        totals.scolarite += payment.amount;
      }
    }

    for (const sale of sales) {
      const totals = totalsByKey.get(monthKeyOf(sale.createdAt));
      if (!totals) continue;

      totals.pos += sale.netAmount;
    }

    return buckets.map((bucket) => {
      const totals = totalsByKey.get(bucket.key)!;

      return {
        key: bucket.key,
        label: bucket.label,
        scolarite: roundAmount(totals.scolarite),
        voyages: roundAmount(totals.voyages),
        pos: roundAmount(totals.pos),
      };
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getFinancialOverviewAction] Échec de calcul de l'évolution des recettes :",
      error
    );

    // Dégradation gracieuse : série vide plutôt que crash serveur.
    return buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      scolarite: 0,
      voyages: 0,
      pos: 0,
    }));
  }
}

// --------------------------------------
// Server Action — Répartition des étudiants (graphique Donut)
// --------------------------------------

/** Clés de niveaux reconnues (extraites des libellés classes/cours). */
const LEVEL_KEYS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export type StudentLevelKey = (typeof LEVEL_KEYS)[number] | "AUTRES";

/** Libellés affichables des niveaux CECRL. */
const LEVEL_LABELS: Record<StudentLevelKey, string> = {
  A1: "A1 · Débutant",
  A2: "A2 · Élémentaire",
  B1: "B1 · Intermédiaire",
  B2: "B2 · Avancé",
  C1: "C1 · Autonome",
  C2: "C2 · Maîtrise",
  AUTRES: "Non catégorisés",
};

/**
 * Extrait le niveau CECRL d'une liste de textes candidats (nom de classe,
 * titre / code du cours). Le premier niveau reconnu gagne ; sans correspondance
 * le lot retombe dans « AUTRES ».
 */
function extractStudentLevel(texts: Array<string | null | undefined>): StudentLevelKey {
  for (const text of texts) {
    if (!text) continue;

    const match = text.match(/\b(A1|A2|B1|B2|C1|C2)\b/i);
    if (match) {
      const level = match[1].toUpperCase();
      if ((LEVEL_KEYS as readonly string[]).includes(level)) {
        return level as StudentLevelKey;
      }
    }
  }

  return "AUTRES";
}

/** Tranche agrégée du donut (par niveau ou par statut). */
export type StudentDistributionSliceDTO = {
  key: string;
  label: string;
  count: number;
};

export type StudentDistributionDTO = {
  /** Nombre total d'étudiants de l'organisation (tous statuts). */
  totalStudents: number;
  /** Apprenants actifs (ENROLLED ou IN_PROGRESS) — population du donut. */
  activeStudents: number;
  /** Répartition des apprenants actifs par niveau (A1 → C2). */
  byLevel: StudentDistributionSliceDTO[];
  /** Répartition de tous les étudiants par statut administratif. */
  byStatus: StudentDistributionSliceDTO[];
};

/** Ordre canonique des statuts pour la ventilation. */
const STATUS_ORDER: Array<keyof typeof STUDENT_STATUS_LABELS> = [
  "PROSPECT",
  "ENROLLED",
  "IN_PROGRESS",
  "COMPLETED",
  "SUSPENDED",
  "DROPPED_OUT",
];

/**
 * Répartition des étudiants :
 * - par niveau de formation (niveau déduit de la classe active puis des
 *   inscriptions aux cours, via le motif A1/A2/B1/B2/C1/C2) ;
 * - par statut administratif.
 *
 * Action non financière : accessible à tous les rôles authentifiés staff.
 */
export async function getStudentDistributionAction(): Promise<StudentDistributionDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const students = await prisma.student.findMany({
      where: { organizationId },
      select: {
        id: true,
        status: true,
        currentClass: {
          select: {
            name: true,
            course: { select: { title: true, code: true } },
          },
        },
        enrollments: {
          select: { course: { select: { title: true, code: true } } },
        },
      },
    });

    const levelCounts = new Map<StudentLevelKey, number>();
    const statusCounts = new Map<string, number>();
    let activeStudents = 0;

    for (const student of students) {
      // Ventilation par statut : tous les étudiants.
      statusCounts.set(student.status, (statusCounts.get(student.status) ?? 0) + 1);

      const isActive =
        student.status === "ENROLLED" || student.status === "IN_PROGRESS";
      if (!isActive) continue;

      activeStudents += 1;

      // Niveau : la classe active est prioritaire, puis les cours suivis.
      const levelTexts: Array<string | null | undefined> = [
        student.currentClass?.name,
        student.currentClass?.course?.title,
        student.currentClass?.course?.code,
        ...student.enrollments.flatMap((enrollment) => [
          enrollment.course.title,
          enrollment.course.code,
        ]),
      ];

      const level = extractStudentLevel(levelTexts);
      levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
    }

    const byLevel: StudentDistributionSliceDTO[] = [
      ...(LEVEL_KEYS.map((key) => ({
        key,
        label: LEVEL_LABELS[key],
        count: levelCounts.get(key) ?? 0,
      }) satisfies StudentDistributionSliceDTO)),
    ];

    // « Non catégorisés » uniquement s'il existe des étudiants à classer.
    const uncategorizedCount = levelCounts.get("AUTRES") ?? 0;
    if (uncategorizedCount > 0) {
      byLevel.push({
        key: "AUTRES",
        label: LEVEL_LABELS.AUTRES,
        count: uncategorizedCount,
      });
    }

    const byStatus: StudentDistributionSliceDTO[] = STATUS_ORDER.map(
      (status) => ({
        key: status,
        label: STUDENT_STATUS_LABELS[status],
        count: statusCounts.get(status) ?? 0,
      })
    );

    return {
      totalStudents: students.length,
      activeStudents,
      byLevel,
      byStatus,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getStudentDistributionAction] Échec de calcul de la répartition :",
      error
    );

    // Dégradation gracieuse : répartition vide plutôt que crash serveur.
    return { totalStudents: 0, activeStudents: 0, byLevel: [], byStatus: [] };
  }
}

// --------------------------------------
// Server Action — Tendance mensuelle de l'assiduité (graphique LineChart)
// --------------------------------------

/** Point mensuel de la courbe d'assiduité globale. */
export type AttendanceTrendPointDTO = {
  /** Clé stable « YYYY-MM ». */
  key: string;
  /** Libellé court déterministe (« janv. 26 »). */
  label: string;
  /**
   * Taux de présence du mois (0–100, LATE compté comme présent) ;
   * `null` si aucun émargement n'existe pour ce mois.
   */
  rate: number | null;
  /** Nombre total d'émargements saisis sur le mois. */
  entries: number;
};

/**
 * Taux de présence mensuel global de l'organisation sur les N derniers mois
 * (6 par défaut, bornés à 12). Action non financière.
 */
export async function getAttendanceTrendAction(
  months = 6
): Promise<AttendanceTrendPointDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  const windowSize = Math.min(Math.max(Math.trunc(months) || 6, 1), 12);
  const buckets = buildMonthBuckets(windowSize);
  if (buckets.length === 0) return [];

  const windowStart = buckets[0].start;

  try {
    // Un seul balayage léger : seuls statut et date sont transportés.
    const attendanceRows = await prisma.attendance.findMany({
      where: {
        organizationId,
        date: { gte: windowStart },
      },
      select: {
        status: true,
        date: true,
      },
    });

    const statsByKey = new Map<string, { presentish: number; total: number }>();
    for (const bucket of buckets) {
      statsByKey.set(bucket.key, { presentish: 0, total: 0 });
    }

    for (const row of attendanceRows) {
      const stats = statsByKey.get(monthKeyOf(row.date));
      if (!stats) continue;

      stats.total += 1;
      if (row.status === "PRESENT" || row.status === "LATE") {
        stats.presentish += 1;
      }
    }

    return buckets.map((bucket) => {
      const stats = statsByKey.get(bucket.key)!;

      return {
        key: bucket.key,
        label: bucket.label,
        rate:
          stats.total > 0
            ? roundRate((stats.presentish / stats.total) * 100)
            : null,
        entries: stats.total,
      };
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getAttendanceTrendAction] Échec de calcul de la tendance d'assiduité :",
      error
    );

    // Dégradation gracieuse : série vide plutôt que crash serveur.
    return buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      rate: null,
      entries: 0,
    }));
  }
}




