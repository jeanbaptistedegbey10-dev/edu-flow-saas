"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Étape d'un workflow de procédure (modèle réutilisable par pays). */
export type WorkflowStageDTO = {
  id: string;
  title: string;
  order: number;
  /** Documents requis pour valider l'étape (tableau de chaînes stocké en Json). */
  requiredDocuments: string[];
};

/** Modèle de procédure par pays (ex : Allemagne, Canada, France…). */
export type WorkflowDTO = {
  id: string;
  country: string;
  title: string;
  description: string | null;
  isDefault: boolean;
  baseCost: number;
  stages: WorkflowStageDTO[];
};

export type StudentOptionDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  clientType: "LANGUAGE_ONLY" | "LANGUAGE_AND_TRAVEL" | "TRAVEL_ONLY";
};

/**
 * Dossier de voyage tel que consommé par la vue liste :
 * progression calculée depuis `currentStageOrder` et total d'étapes du workflow,
 * montant déjà encaissé agrégé depuis les règlements liés.
 */
export type TravelProcedureDTO = {
  id: string;
  destination: string;
  targetProgram: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Nom du candidat : étudiant lié ou candidat externe saisi directement. */
  candidateName: string;
  candidatePhone: string | null;
  candidateCode: string | null;
  /** Identifiant de l'étudiant lié (null pour un candidat externe). */
  studentId: string | null;
  isExternalCandidate: boolean;
  workflowId: string | null;
  workflowCountry: string | null;
  workflowTitle: string | null;
  totalCost: number;
  discount: number;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
  /** Nombre d'étapes validées (= ordre de l'étape en cours). */
  validatedStages: number;
  /** Nombre total d'étapes du workflow associé (0 si aucun workflow). */
  totalStages: number;
  /** Pourcentage de progression (0–100), arrondi à l'unité. */
  progressPercent: number;
  /** Étape en cours (titre) si disponible. */
  currentStageTitle: string | null;
  /** Date limite de l'étape en cours (ex : rendez-vous ambassade). */
  currentStageDeadline: Date | null;
};

/** Règlement (tranche) rattaché à un dossier de voyage. */
export type TravelPaymentDTO = {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CREDIT_CARD" | "CHECK";
  reference: string | null;
  description: string | null;
  paidAt: Date;
};

/** Détail complet d'un dossier : étapes du workflow + historique des tranches. */
export type TravelProcedureDetailDTO = {
  id: string;
  destination: string;
  targetProgram: string | null;
  notes: string | null;
  createdAt: Date;
  candidateName: string;
  candidatePhone: string | null;
  candidateCode: string | null;
  isExternalCandidate: boolean;
  workflowId: string | null;
  workflowCountry: string | null;
  workflowTitle: string | null;
  totalCost: number;
  discount: number;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currentStageOrder: number;
  currentStageDeadline: Date | null;
  stages: WorkflowStageDTO[];
  payments: TravelPaymentDTO[];
};

export type WorkflowFormField =
  | "country"
  | "title"
  | "description"
  | "baseCost";

export type WorkflowFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<WorkflowFormField, string>>;
};

export type TravelFormField =
  | "candidateType"
  | "studentId"
  | "candidateName"
  | "candidatePhone"
  | "workflowId"
  | "destination"
  | "targetProgram"
  | "totalCost"
  | "discount"
  | "deadline"
  | "notes";

export type TravelFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<TravelFormField, string>>;
};

/** Résultat des mutations rapides côté client (suppression, changement d'étape…). */
export type TravelMutationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Résultat de l'enregistrement d'une tranche : renvoie le règlement créé pour impression. */
export type AddInstallmentResult =
  | { ok: true; payment: TravelPaymentDTO }
  | { ok: false; message: string };

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

/** Plafond de sécurité pour un montant saisi (FCFA). */
const MAX_AMOUNT = 1_000_000_000;

const MAX_STAGES = 30;

function isPaymentMethod(value: string): value is PaymentMethodValue {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Analyse un montant saisi (accepte la virgule décimale des claviers FR). */
function parseAmount(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  return Number.isNaN(value) ? null : value;
}

/**
 * Analyse une date saisie au format `<input type="date">` (« YYYY-MM-DD »).
 * Midi UTC est utilisé comme heure canonique afin d'éviter tout décalage
 * de jour lié aux fuseaux horaires lors de l'affichage.
 */
function parseDateInput(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Normalise un tableau Json Prisma en liste de chaînes non vides. */
function normalizeDocuments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 20);
}

/** Calcule le pourcentage de progression arrondi à l'unité. */
function computeProgressPercent(validated: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((validated / total) * 100));
}

function revalidateTravels(): void {
  revalidatePath("/dashboard/travels");
}

// --------------------------------------
// Workflows : lectures
// --------------------------------------

/**
 * Récupère tous les modèles de procédures (workflows) de l'organisation active,
 * avec leurs étapes triées par ordre croissant.
 *
 * Garantit la disponibilité des modèles par défaut (Allemagne, Canada, France) :
 * si l'organisation n'en possède aucun, ils sont créés automatiquement au
 * premier appel (auto-provisionnement idempotent).
 */
export async function getWorkflows(): Promise<WorkflowDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    let count = await prisma.workflow.count({ where: { organizationId } });

    if (count === 0) {
      await ensureDefaultWorkflows(organizationId);
      count = await prisma.workflow.count({ where: { organizationId } });
    }

    if (count === 0) return [];

    const rows = await prisma.workflow.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: "desc" }, { country: "asc" }],
      select: {
        id: true,
        country: true,
        title: true,
        description: true,
        isDefault: true,
        baseCost: true,
        stages: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            order: true,
            requiredDocuments: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      ...row,
      stages: row.stages.map((stage) => ({
        ...stage,
        requiredDocuments: normalizeDocuments(stage.requiredDocuments),
      })),
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getWorkflows] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Crée les trois modèles par défaut (Allemagne, Canada, France) avec leurs
 * étapes types si l'organisation n'a encore aucun workflow.
 * Utilisée par `getWorkflows` (auto-provisionnement) et le seed.
 */
async function ensureDefaultWorkflows(organizationId: string): Promise<void> {
  const defaults: Array<{
    country: string;
    title: string;
    description: string;
    baseCost: number;
    stages: Array<{ title: string; documents: string[] }>;
  }> = [
    {
      country: "Allemagne",
      title: "Procédure Allemagne — Ausbildung",
      description:
        "Accompagnement complet pour Ausbildung et études en Allemagne.",
      baseCost: 850_000,
      stages: [
        {
          title: "Évaluation du dossier",
          documents: ["Pièce d'identité", "Diplômes", "Relevés de notes"],
        },
        {
          title: "Test de langue (B1/B2)",
          documents: ["Certificat de langue B1 ou B2"],
        },
        {
          title: "Candidature aux établissements",
          documents: [
            "CV",
            "Lettre de motivation",
            "Certificat de langue",
            "Diplômes traduits",
          ],
        },
        {
          title: "Admission obtenue",
          documents: ["Lettre d'admission", "Contrat de formation"],
        },
        {
          title: "Demande de visa",
          documents: [
            "Passeport",
            "Lettre d'admission",
            "Preuves de financement",
            "Assurance santé",
          ],
        },
        {
          title: "Rendez-vous ambassade & visa",
          documents: ["Convocation ambassade", "Visa", "Billet d'avion"],
        },
        {
          title: "Départ & installation",
          documents: ["Contrat de logement", "Assurance"],
        },
      ],
    },
    {
      country: "Canada",
      title: "Procédure Canada — Études supérieures",
      description: "Accompagnement pour étudier au Canada.",
      baseCost: 950_000,
      stages: [
        {
          title: "Évaluation du projet",
          documents: ["Pièce d'identité", "Diplômes"],
        },
        {
          title: "Tests de langue (IELTS/TEF)",
          documents: ["Certificat IELTS/TEF"],
        },
        {
          title: "Candidature universitaire",
          documents: ["CV", "Lettre de motivation", "Relevés de notes"],
        },
        {
          title: "CAQ & Permis d'études",
          documents: ["Lettre d'admission", "Preuves financières"],
        },
        {
          title: "Visa & départ",
          documents: ["Passeport", "Visa", "Billet d'avion"],
        },
      ],
    },
    {
      country: "France",
      title: "Procédure France — Visa étudiant",
      description: "Accompagnement pour les études en France.",
      baseCost: 750_000,
      stages: [
        {
          title: "Préparation du dossier",
          documents: ["Pièce d'identité", "Diplômes", "CV"],
        },
        {
          title: "Inscription Campus France",
          documents: ["Dossier Campus France", "Certificats de langue"],
        },
        {
          title: "Entretien Campus France",
          documents: ["Convocation à l'entretien"],
        },
        {
          title: "Demande de visa",
          documents: [
            "Passeport",
            "Attestation Campus France",
            "Preuves de financement",
          ],
        },
        {
          title: "Visa & départ",
          documents: ["Visa", "Billet d'avion", "Assurance"],
        },
      ],
    },
  ];

  await prisma.$transaction(
    defaults.map((workflow) =>
      prisma.workflow.create({
        data: {
          organizationId,
          country: workflow.country,
          title: workflow.title,
          description: workflow.description,
          isDefault: true,
          baseCost: workflow.baseCost,
          stages: {
            create: workflow.stages.map((stage, index) => ({
              organizationId,
              title: stage.title,
              order: index,
              requiredDocuments: stage.documents,
            })),
          },
        },
      })
    )
  );
}

// --------------------------------------
// Dossiers : lectures
// --------------------------------------

/**
 * Récupère tous les dossiers de voyage de l'organisation active avec :
 * - identité du candidat (étudiant lié ou candidat externe),
 * - métadonnées du workflow associé,
 * - montant encaissé (somme des règlements COMPLETED/PARTIAL),
 * - progression calculée (étapes validées / total).
 */
export async function getTravelProcedures(): Promise<TravelProcedureDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const [rows, workflows] = await Promise.all([
      prisma.travelProcedure.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          destination: true,
          targetProgram: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          candidateName: true,
          candidatePhone: true,
          studentId: true,
          workflowId: true,
          totalCost: true,
          discount: true,
          netAmount: true,
          currentStageOrder: true,
          currentStageDeadline: true,
          student: {
            select: {
              studentCode: true,
              firstName: true,
              lastName: true,
            },
          },
          workflow: {
            select: {
              country: true,
              title: true,
              _count: { select: { stages: true } },
            },
          },
          payments: {
            // Même règle que la vue liste : seuls les règlements aboutis
            // (COMPLETED/PARTIAL) et ACTIFS (non suspendus) alimentent le
            // total encaissé.
            where: { status: { in: ["COMPLETED", "PARTIAL"] }, isVoided: false },
            select: { amount: true },
          },
        },
      }),
      prisma.workflow.findMany({
        where: { organizationId },
        select: {
          id: true,
          _count: { select: { stages: true } },
        },
      }),
    ]);

    // Total d'étapes par workflow (les dossiers peuvent référencer un workflow supprimé).
    const stageCountsByWorkflow = new Map<string, number>();
    for (const workflow of workflows) {
      stageCountsByWorkflow.set(workflow.id, workflow._count.stages);
    }

    // Titre de l'étape en cours par workflow (indexée par ordre).
    const stageTitles = await prisma.workflowStage.findMany({
      where: { organizationId },
      select: { workflowId: true, title: true, order: true },
      orderBy: { order: "asc" },
    });

    const stageTitleMap = new Map<string, Map<number, string>>();
    for (const stage of stageTitles) {
      let titles = stageTitleMap.get(stage.workflowId);
      if (!titles) {
        titles = new Map<number, string>();
        stageTitleMap.set(stage.workflowId, titles);
      }
      titles.set(stage.order, stage.title);
    }

    return rows.map((row) => {
      const isExternalCandidate = !row.student;
      const candidateName = isExternalCandidate
        ? (row.candidateName ?? "Candidat externe")
        : `${row.student?.firstName ?? ""} ${row.student?.lastName ?? ""}`.trim();

      const paidAmount = row.payments.reduce((sum, p) => sum + p.amount, 0);
      const netAmount = row.netAmount || Math.max(row.totalCost - row.discount, 0);
      const totalStages = row.workflowId
        ? (stageCountsByWorkflow.get(row.workflowId) ?? 0)
        : 0;
      const validatedStages =
        totalStages > 0 ? Math.min(row.currentStageOrder, totalStages) : 0;

      const currentStageTitle = row.workflowId
        ? (stageTitleMap.get(row.workflowId)?.get(row.currentStageOrder) ?? null)
        : null;

      return {
        id: row.id,
        destination: row.destination,
        targetProgram: row.targetProgram,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        candidateName,
        candidatePhone: row.candidatePhone,
        candidateCode: row.student?.studentCode ?? null,
        studentId: row.studentId,
        isExternalCandidate,
        workflowId: row.workflowId,
        workflowCountry: row.workflow?.country ?? null,
        workflowTitle: row.workflow?.title ?? null,
        totalCost: row.totalCost,
        discount: row.discount,
        netAmount,
        paidAmount,
        remainingAmount: Math.max(netAmount - paidAmount, 0),
        validatedStages,
        totalStages,
        progressPercent: computeProgressPercent(validatedStages, totalStages),
        currentStageTitle,
        currentStageDeadline: row.currentStageDeadline,
      };
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getTravelProcedures] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Récupère la liste légère des étudiants pouvant ouvrir un dossier de voyage
 * (clientType LANGUAGE_AND_TRAVEL ou TRAVEL_ONLY).
 */
export async function getStudentOptions(): Promise<StudentOptionDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    return await prisma.student.findMany({
      where: {
        organizationId,
        clientType: { in: ["LANGUAGE_AND_TRAVEL", "TRAVEL_ONLY"] },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
        clientType: true,
      },
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getStudentOptions] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Récupère le détail complet d'un dossier de voyage : étapes du workflow,
 * historique des tranches et synthèse financière.
 * Lève une erreur si le dossier est introuvable dans l'organisation active.
 */
export async function getTravelProcedureDetail(
  procedureId: string
): Promise<TravelProcedureDetailDTO> {
  const organizationId = await getCurrentOrganizationId();

  const row = await prisma.travelProcedure.findFirst({
    where: { id: procedureId, organizationId },
    select: {
      id: true,
      destination: true,
      targetProgram: true,
      notes: true,
      createdAt: true,
      candidateName: true,
      candidatePhone: true,
      studentId: true,
      workflowId: true,
      totalCost: true,
      discount: true,
      netAmount: true,
      currentStageOrder: true,
      currentStageDeadline: true,
      student: {
        select: { studentCode: true, firstName: true, lastName: true },
      },
      workflow: {
        select: {
          country: true,
          title: true,
          stages: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              order: true,
              requiredDocuments: true,
            },
          },
        },
      },
      payments: {
        // Même règle que la vue liste : seuls les règlements aboutis
        // (COMPLETED/PARTIAL) et ACTIFS (non suspendus) alimentent le total
        // encaissé.
        where: { status: { in: ["COMPLETED", "PARTIAL"] }, isVoided: false },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentMethod: true,
          reference: true,
          description: true,
          paidAt: true,
        },
      },
    },
  });

  if (!row) {
    throw new Error("Dossier de voyage introuvable.");
  }

  const isExternalCandidate = !row.student;
  const candidateName = isExternalCandidate
    ? (row.candidateName ?? "Candidat externe")
    : `${row.student?.firstName ?? ""} ${row.student?.lastName ?? ""}`.trim();

  // Le filtrage COMPLETED/PARTIAL est appliqué directement dans la requête ;
  // tous les règlements renvoyés sont donc encaissés.
  const paidAmount = row.payments.reduce((sum, p) => sum + p.amount, 0);
  const netAmount = row.netAmount || Math.max(row.totalCost - row.discount, 0);

  return {
    id: row.id,
    destination: row.destination,
    targetProgram: row.targetProgram,
    notes: row.notes,
    createdAt: row.createdAt,
    candidateName,
    candidatePhone: row.candidatePhone,
    candidateCode: row.student?.studentCode ?? null,
    isExternalCandidate,
    workflowId: row.workflowId,
    workflowCountry: row.workflow?.country ?? null,
    workflowTitle: row.workflow?.title ?? null,
    totalCost: row.totalCost,
    discount: row.discount,
    netAmount,
    paidAmount,
    remainingAmount: Math.max(netAmount - paidAmount, 0),
    currentStageOrder: row.currentStageOrder,
    currentStageDeadline: row.currentStageDeadline,
    stages: (row.workflow?.stages ?? []).map((stage) => ({
      ...stage,
      requiredDocuments: normalizeDocuments(stage.requiredDocuments),
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      reference: payment.reference,
      description: payment.description,
      paidAt: payment.paidAt,
    })),
  };
}

// --------------------------------------
// Workflows : mutations
// --------------------------------------

type ParsedWorkflowInput =
  | {
      ok: true;
      data: {
        country: string;
        title: string;
        description: string | null;
        baseCost: number;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<WorkflowFormField, string>> };

function parseWorkflowForm(formData: FormData): ParsedWorkflowInput {
  const country = String(formData.get("country") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rawBaseCost = String(formData.get("baseCost") ?? "").trim();

  const fieldErrors: Partial<Record<WorkflowFormField, string>> = {};

  if (!country) {
    fieldErrors.country = "Le pays est requis.";
  } else if (country.length > 80) {
    fieldErrors.country = "Le pays ne doit pas dépasser 80 caractères.";
  }

  if (!title) {
    fieldErrors.title = "Le titre du modèle est requis.";
  } else if (title.length > 150) {
    fieldErrors.title = "Le titre ne doit pas dépasser 150 caractères.";
  }

  if (description.length > 500) {
    fieldErrors.description =
      "La description ne doit pas dépasser 500 caractères.";
  }

  const baseCost = rawBaseCost ? parseAmount(rawBaseCost) : 0;
  if (baseCost === null || baseCost < 0) {
    fieldErrors.baseCost = "Le coût de base doit être un nombre positif.";
    return { ok: false, fieldErrors };
  }
  if (baseCost > MAX_AMOUNT) {
    fieldErrors.baseCost = "Le coût dépasse la limite autorisée.";
    return { ok: false, fieldErrors };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      country,
      title,
      description: description || null,
      baseCost,
    },
  };
}

/**
 * Crée un nouveau modèle de procédure (pays/programme).
 * Conçu pour `useActionState`.
 */
export async function createWorkflowAction(
  _prevState: WorkflowFormState,
  formData: FormData
): Promise<WorkflowFormState> {
  await assertCanMutate();
  const parsed = parseWorkflowForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    await prisma.workflow.create({
      data: {
        organizationId,
        country: parsed.data.country,
        title: parsed.data.title,
        description: parsed.data.description,
        baseCost: parsed.data.baseCost,
        isDefault: false,
      },
    });

    revalidateTravels();

    return {
      status: "success",
      message: "Modèle de procédure créé. Ajoutez maintenant ses étapes.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createWorkflowAction] Échec de création :", error);
    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la création du modèle de procédure.",
    };
  }
}

/**
 * Met à jour les métadonnées d'un modèle de procédure existant.
 * Conçu pour `useActionState` (champ caché `id` dans le formulaire).
 */
export async function updateWorkflowAction(
  _prevState: WorkflowFormState,
  formData: FormData
): Promise<WorkflowFormState> {
  await assertCanMutate();
  const workflowId = String(formData.get("id") ?? "").trim();

  if (!workflowId) {
    return { status: "error", message: "Identifiant du modèle manquant." };
  }

  const parsed = parseWorkflowForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const existing = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return { status: "error", message: "Modèle introuvable." };
    }

    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        country: parsed.data.country,
        title: parsed.data.title,
        description: parsed.data.description,
        baseCost: parsed.data.baseCost,
      },
    });

    revalidateTravels();

    return { status: "success", message: "Modèle mis à jour avec succès." };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[updateWorkflowAction] Échec de mise à jour :", error);
    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la mise à jour du modèle de procédure.",
    };
  }
}

/**
 * Supprime un modèle de procédure. Les dossiers liés conservent leur
 * destination mais perdent le suivi par étapes (relation SetNull).
 */
export async function deleteWorkflowAction(
  workflowId: string
): Promise<TravelMutationResult> {
  await assertCanMutate();
  if (!workflowId) {
    return { ok: false, message: "Identifiant du modèle manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const existing = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return { ok: false, message: "Modèle introuvable." };
    }

    await prisma.workflow.delete({ where: { id: workflowId } });

    revalidateTravels();

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteWorkflowAction] Échec de suppression :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression du modèle de procédure.",
    };
  }
}

export type WorkflowStageInput = {
  title: string;
  requiredDocuments: string[];
};

/**
 * Remplace l'intégralité des étapes d'un workflow (ajout, modification,
 * suppression et réordonnancement). Les étapes sont renumérotées 0..N-1
 * selon l'ordre fourni par le client.
 *
 * Réalisée dans une transaction : suppression puis recréation évite tout
 * conflit avec la contrainte unique `[workflowId, order]` lors des permutations.
 */
export async function saveWorkflowStagesAction(
  workflowId: string,
  stages: WorkflowStageInput[]
): Promise<TravelMutationResult> {
  await assertCanMutate();
  if (!workflowId) {
    return { ok: false, message: "Identifiant du modèle manquant." };
  }

  if (stages.length > MAX_STAGES) {
    return {
      ok: false,
      message: `Un modèle ne peut pas contenir plus de ${MAX_STAGES} étapes.`,
    };
  }

  const cleaned: WorkflowStageInput[] = [];
  for (const stage of stages) {
    const title = String(stage?.title ?? "").trim();
    if (!title) {
      return { ok: false, message: "Chaque étape doit avoir un titre." };
    }
    if (title.length > 150) {
      return {
        ok: false,
        message: "Les titres d'étape ne doivent pas dépasser 150 caractères.",
      };
    }
    cleaned.push({
      title,
      requiredDocuments: normalizeDocuments(stage?.requiredDocuments),
    });
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const existing = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return { ok: false, message: "Modèle introuvable." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.workflowStage.deleteMany({ where: { workflowId } });

      if (cleaned.length > 0) {
        await tx.workflowStage.createMany({
          data: cleaned.map((stage, index) => ({
            workflowId,
            organizationId,
            title: stage.title,
            order: index,
            requiredDocuments: stage.requiredDocuments,
          })),
        });
      }
    });

    revalidateTravels();

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[saveWorkflowStagesAction] Échec de sauvegarde :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la sauvegarde des étapes du modèle.",
    };
  }
}

// --------------------------------------
// Dossiers : mutations
// --------------------------------------

type ParsedTravelInput =
  | {
      ok: true;
      data: {
        candidateType: "EXISTING_STUDENT" | "EXTERNAL";
        studentId: string | null;
        candidateName: string | null;
        candidatePhone: string | null;
        workflowId: string | null;
        destination: string;
        targetProgram: string | null;
        totalCost: number;
        discount: number;
        deadline: Date | null;
        notes: string | null;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<TravelFormField, string>> };

function parseTravelForm(formData: FormData): ParsedTravelInput {
  const candidateTypeRaw = String(formData.get("candidateType") ?? "").trim();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const candidateName = String(formData.get("candidateName") ?? "").trim();
  const candidatePhone = String(formData.get("candidatePhone") ?? "").trim();
  const workflowId = String(formData.get("workflowId") ?? "").trim();
  const destination = String(formData.get("destination") ?? "").trim();
  const targetProgram = String(formData.get("targetProgram") ?? "").trim();
  const rawTotalCost = String(formData.get("totalCost") ?? "").trim();
  const rawDiscount = String(formData.get("discount") ?? "").trim();
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors: Partial<Record<TravelFormField, string>> = {};

  const candidateType: "EXISTING_STUDENT" | "EXTERNAL" =
    candidateTypeRaw === "EXTERNAL" ? "EXTERNAL" : "EXISTING_STUDENT";

  if (candidateType === "EXISTING_STUDENT" && !studentId) {
    fieldErrors.studentId = "Veuillez sélectionner un candidat inscrit.";
  }

  if (candidateType === "EXTERNAL") {
    if (!candidateName) {
      fieldErrors.candidateName =
        "Le nom du candidat externe est requis (sans compte étudiant).";
    } else if (candidateName.length > 120) {
      fieldErrors.candidateName =
        "Le nom ne doit pas dépasser 120 caractères.";
    }
    if (candidatePhone.length > 40) {
      fieldErrors.candidatePhone =
        "Le téléphone ne doit pas dépasser 40 caractères.";
    }
  }

  if (!destination) {
    fieldErrors.destination = "La destination est requise.";
  } else if (destination.length > 100) {
    fieldErrors.destination =
      "La destination ne doit pas dépasser 100 caractères.";
  }

  if (targetProgram.length > 150) {
    fieldErrors.targetProgram =
      "Le programme visé ne doit pas dépasser 150 caractères.";
  }

  const totalCost = rawTotalCost ? parseAmount(rawTotalCost) : 0;
  if (totalCost === null || totalCost < 0) {
    fieldErrors.totalCost = "Le coût de la procédure doit être positif.";
    return { ok: false, fieldErrors };
  }
  if (totalCost > MAX_AMOUNT) {
    fieldErrors.totalCost = "Le coût dépasse la limite autorisée.";
    return { ok: false, fieldErrors };
  }

  const discount = rawDiscount ? parseAmount(rawDiscount) : 0;
  if (discount === null || discount < 0) {
    fieldErrors.discount = "La réduction doit être positive.";
    return { ok: false, fieldErrors };
  }
  if (discount > totalCost) {
    fieldErrors.discount = "La réduction ne peut excéder le coût total.";
    return { ok: false, fieldErrors };
  }

  let deadline: Date | null = null;
  if (deadlineRaw) {
    deadline = parseDateInput(deadlineRaw);
    if (!deadline) {
      fieldErrors.deadline = "Format de date invalide.";
    }
  }

  if (notes.length > 500) {
    fieldErrors.notes = "Les notes ne doivent pas dépasser 500 caractères.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      candidateType,
      studentId: candidateType === "EXISTING_STUDENT" ? studentId : null,
      candidateName: candidateType === "EXTERNAL" ? candidateName : null,
      candidatePhone: candidateType === "EXTERNAL" ? candidatePhone || null : null,
      workflowId: workflowId || null,
      destination,
      targetProgram: targetProgram || null,
      totalCost,
      discount,
      deadline,
      notes: notes || null,
    },
  };
}

/**
 * Crée un dossier de voyage :
 * - candidat existant (étudiant filtré côté interface) ou candidat externe
 *   saisi directement (sans compte étudiant),
 * - modèle de procédure optionnel (pré-remplit coût/réduction côté client),
 * - date limite de l'étape en cours (ex : rendez-vous ambassade).
 * Conçu pour `useActionState`.
 */
export async function createTravelProcedureAction(
  _prevState: TravelFormState,
  formData: FormData
): Promise<TravelFormState> {
  await assertCanMutate();
  const parsed = parseTravelForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const organizationId = await getCurrentOrganizationId();
    const user = await getCurrentSessionUser();

    // Isolation multi-tenant : vérifie le candidat / le workflow référencés.
    if (parsed.data.studentId) {
      const student = await prisma.student.findFirst({
        where: { id: parsed.data.studentId, organizationId },
        select: { id: true },
      });

      if (!student) {
        return {
          status: "error",
          message: "Étudiant introuvable dans votre organisation.",
          fieldErrors: { studentId: "Étudiant introuvable." },
        };
      }
    }

    if (parsed.data.workflowId) {
      const workflow = await prisma.workflow.findFirst({
        where: { id: parsed.data.workflowId, organizationId },
        select: { id: true },
      });

      if (!workflow) {
        return {
          status: "error",
          message: "Modèle de procédure introuvable.",
          fieldErrors: { workflowId: "Modèle introuvable." },
        };
      }
    }

    await prisma.travelProcedure.create({
      data: {
        organizationId,
        studentId: parsed.data.studentId,
        candidateName: parsed.data.candidateName,
        candidatePhone: parsed.data.candidatePhone,
        workflowId: parsed.data.workflowId,
        advisorId: user.id,
        destination: parsed.data.destination,
        targetProgram: parsed.data.targetProgram,
        totalCost: parsed.data.totalCost,
        discount: parsed.data.discount,
        netAmount: Math.max(parsed.data.totalCost - parsed.data.discount, 0),
        currentStageOrder: 0,
        currentStageDeadline: parsed.data.deadline,
        notes: parsed.data.notes,
      },
    });

    revalidateTravels();

    return {
      status: "success",
      message: "Dossier de voyage créé avec succès.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createTravelProcedureAction] Échec de création :", error);
    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la création du dossier de voyage.",
    };
  }
}

/**
 * Met à jour un dossier de voyage existant (candidat, modèle, finances,
 * date limite). Conçu pour `useActionState` (champ caché `id`).
 */
export async function updateTravelProcedureAction(
  _prevState: TravelFormState,
  formData: FormData
): Promise<TravelFormState> {
  await assertCanMutate();
  const procedureId = String(formData.get("id") ?? "").trim();

  if (!procedureId) {
    return { status: "error", message: "Identifiant du dossier manquant." };
  }

  const parsed = parseTravelForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const existing = await prisma.travelProcedure.findFirst({
      where: { id: procedureId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Dossier de voyage introuvable dans votre organisation.",
      };
    }

    if (parsed.data.studentId) {
      const student = await prisma.student.findFirst({
        where: { id: parsed.data.studentId, organizationId },
        select: { id: true },
      });

      if (!student) {
        return {
          status: "error",
          message: "Étudiant introuvable dans votre organisation.",
          fieldErrors: { studentId: "Étudiant introuvable." },
        };
      }
    }

    if (parsed.data.workflowId) {
      const workflow = await prisma.workflow.findFirst({
        where: { id: parsed.data.workflowId, organizationId },
        select: { id: true },
      });

      if (!workflow) {
        return {
          status: "error",
          message: "Modèle de procédure introuvable.",
          fieldErrors: { workflowId: "Modèle introuvable." },
        };
      }
    }

    await prisma.travelProcedure.update({
      where: { id: procedureId },
      data: {
        studentId: parsed.data.studentId,
        candidateName: parsed.data.candidateName,
        candidatePhone: parsed.data.candidatePhone,
        workflowId: parsed.data.workflowId,
        destination: parsed.data.destination,
        targetProgram: parsed.data.targetProgram,
        totalCost: parsed.data.totalCost,
        discount: parsed.data.discount,
        netAmount: Math.max(parsed.data.totalCost - parsed.data.discount, 0),
        currentStageDeadline: parsed.data.deadline,
        notes: parsed.data.notes,
      },
    });

    revalidateTravels();
    revalidatePath(`/dashboard/travels/${procedureId}`);

    return {
      status: "success",
      message: "Dossier de voyage mis à jour avec succès.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[updateTravelProcedureAction] Échec de mise à jour :", error);
    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la mise à jour du dossier de voyage.",
    };
  }
}

/**
 * Supprime un dossier de voyage de l'organisation active.
 */
export async function deleteTravelProcedureAction(
  procedureId: string
): Promise<TravelMutationResult> {
  await assertCanMutate();
  if (!procedureId) {
    return { ok: false, message: "Identifiant du dossier manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const existing = await prisma.travelProcedure.findFirst({
      where: { id: procedureId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Dossier de voyage introuvable dans votre organisation.",
      };
    }

    await prisma.travelProcedure.delete({ where: { id: procedureId } });

    revalidateTravels();

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteTravelProcedureAction] Échec de suppression :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression du dossier de voyage.",
    };
  }
}

/**
 * Définit l'étape courante d'un dossier (validation d'étapes, retour arrière).
 *
 * Convention de progression : `stageOrder` = nombre d'étapes validées.
 * Les étapes d'ordre inférieur sont « Validées » (vert), celle d'ordre égal
 * est « En cours » (indigo) et les suivantes « À venir » (slate).
 * `stageOrder` peut valoir le total d'étapes (procédure entièrement validée).
 */
export async function setTravelCurrentStageAction(
  procedureId: string,
  stageOrder: number,
  deadline?: string | null
): Promise<TravelMutationResult> {
  await assertCanMutate();
  if (!procedureId) {
    return { ok: false, message: "Identifiant du dossier manquant." };
  }

  if (!Number.isInteger(stageOrder) || stageOrder < 0) {
    return { ok: false, message: "Numéro d'étape invalide." };
  }

  let deadlineDate: Date | null | undefined;
  if (deadline !== undefined && deadline !== null) {
    if (deadline === "") {
      deadlineDate = null;
    } else {
      deadlineDate = parseDateInput(deadline);
      if (!deadlineDate) {
        return { ok: false, message: "Format de date limite invalide." };
      }
    }
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const procedure = await prisma.travelProcedure.findFirst({
      where: { id: procedureId, organizationId },
      select: {
        id: true,
        workflowId: true,
        workflow: { select: { _count: { select: { stages: true } } } },
      },
    });

    if (!procedure) {
      return { ok: false, message: "Dossier de voyage introuvable." };
    }

    const totalStages = procedure.workflow?._count.stages ?? 0;

    if (procedure.workflowId && stageOrder > totalStages) {
      return {
        ok: false,
        message: `Cette procédure ne compte que ${totalStages} étape(s).`,
      };
    }

    await prisma.travelProcedure.update({
      where: { id: procedureId },
      data: {
        currentStageOrder: stageOrder,
        ...(deadlineDate !== undefined ? { currentStageDeadline: deadlineDate } : {}),
      },
    });

    revalidateTravels();
    revalidatePath(`/dashboard/travels/${procedureId}`);

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[setTravelCurrentStageAction] Échec :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la mise à jour de l'étape du dossier.",
    };
  }
}

/**
 * Entrée de `unverifyStepAction` : annulation de la validation d'une étape
 * déjà validée d'un dossier de voyage.
 */
export type UnverifyStepInput = {
  procedureId: string;
  /** Ordre (1-based) de l'étape dont on annule la validation. */
  stepOrder: number;
};

/**
 * Annule la validation d'une étape déjà validée d'un dossier de voyage
 * (« retour arrière » dans la procédure).
 *
 * Convention de progression : `currentStageOrder` = nombre d'étapes validées.
 * Annuler la validation de l'étape `stepOrder` ramène donc le compteur à
 * `stepOrder - 1` :
 * - l'étape visée repasse au statut « En cours » (IN_PROGRESS) ;
 * - les étapes suivantes (validées par voie de conséquence) repassent au
 *   statut « À venir » (PENDING) ;
 * - si la première étape est annulée, la procédure revient à son état
 *   initial (aucune étape validée).
 *
 * La date limite de l'étape en cours est conservée : elle correspond
 * généralement à un rendez-vous qui reste pertinent après le retour arrière.
 */
export async function unverifyStepAction({
  procedureId,
  stepOrder,
}: UnverifyStepInput): Promise<TravelMutationResult> {
  await assertCanMutate();

  if (!procedureId) {
    return { ok: false, message: "Identifiant du dossier manquant." };
  }

  if (!Number.isInteger(stepOrder) || stepOrder < 1) {
    return { ok: false, message: "Numéro d'étape invalide." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const procedure = await prisma.travelProcedure.findFirst({
      where: { id: procedureId, organizationId },
      select: {
        id: true,
        currentStageOrder: true,
        workflowId: true,
        workflow: { select: { _count: { select: { stages: true } } } },
      },
    });

    if (!procedure) {
      return {
        ok: false,
        message: "Dossier de voyage introuvable dans votre organisation.",
      };
    }

    const totalStages = procedure.workflow?._count.stages ?? 0;

    if (procedure.workflowId && stepOrder > totalStages) {
      return {
        ok: false,
        message: `Cette procédure ne compte que ${totalStages} étape(s).`,
      };
    }

    if (stepOrder > procedure.currentStageOrder) {
      return {
        ok: false,
        message:
          "Cette étape n'est pas encore validée : il n'y a rien à annuler.",
      };
    }

    await prisma.travelProcedure.update({
      where: { id: procedure.id },
      data: { currentStageOrder: stepOrder - 1 },
    });

    revalidateTravels();
    revalidatePath(`/dashboard/travels/${procedure.id}`);

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[unverifyStepAction] Échec :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de l'annulation de la validation de l'étape.",
    };
  }
}

/**
 * Met à jour uniquement la date limite de l'étape en cours
 * (ex : rendez-vous ambassade). Chaîne vide = supprimer la date limite.
 */
export async function updateTravelDeadlineAction(
  procedureId: string,
  deadline: string
): Promise<TravelMutationResult> {
  await assertCanMutate();
  if (!procedureId) {
    return { ok: false, message: "Identifiant du dossier manquant." };
  }

  let deadlineDate: Date | null = null;
  if (deadline !== "") {
    deadlineDate = parseDateInput(deadline);
    if (!deadlineDate) {
      return { ok: false, message: "Format de date limite invalide." };
    }
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const existing = await prisma.travelProcedure.findFirst({
      where: { id: procedureId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return { ok: false, message: "Dossier de voyage introuvable." };
    }

    await prisma.travelProcedure.update({
      where: { id: procedureId },
      data: { currentStageDeadline: deadlineDate },
    });

    revalidateTravels();
    revalidatePath(`/dashboard/travels/${procedureId}`);

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[updateTravelDeadlineAction] Échec :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la mise à jour de la date limite.",
    };
  }
}

/**
 * Enregistre une tranche de règlement (échelonnement financier) rattachée
 * au dossier. Le règlement alimente également les recettes globales
 * (Payment lié à l'organisation, et à l'étudiant quand il existe).
 */
export async function addTravelInstallmentAction(
  procedureId: string,
  input: {
    amount: number;
    paymentMethod: string;
    reference?: string | null;
    description?: string | null;
  }
): Promise<AddInstallmentResult> {
  await assertCanMutate();
  if (!procedureId) {
    return { ok: false, message: "Identifiant du dossier manquant." };
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Le montant de la tranche doit être positif." };
  }
  if (amount > MAX_AMOUNT) {
    return { ok: false, message: "Le montant dépasse la limite autorisée." };
  }

  if (!isPaymentMethod(String(input.paymentMethod))) {
    return { ok: false, message: "Moyen de paiement invalide." };
  }

  const reference = input.reference?.trim() || null;
  if (reference && reference.length > 100) {
    return {
      ok: false,
      message: "La référence ne doit pas dépasser 100 caractères.",
    };
  }

  const description = input.description?.trim() || null;
  if (description && description.length > 255) {
    return {
      ok: false,
      message: "La description ne doit pas dépasser 255 caractères.",
    };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const procedure = await prisma.travelProcedure.findFirst({
      where: { id: procedureId, organizationId },
      select: { id: true, studentId: true, destination: true },
    });

    if (!procedure) {
      return { ok: false, message: "Dossier de voyage introuvable." };
    }

    const created = await prisma.payment.create({
      data: {
        organizationId,
        studentId: procedure.studentId,
        travelProcedureId: procedure.id,
        amount,
        paymentMethod: input.paymentMethod as PaymentMethodValue,
        status: "COMPLETED",
        reference,
        description:
          description ?? `Tranche — Procédure ${procedure.destination}`,
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        reference: true,
        description: true,
        paidAt: true,
      },
    });

    revalidateTravels();
    revalidatePath(`/dashboard/travels/${procedureId}`);
    revalidatePath("/dashboard/payments");

    return {
      ok: true,
      payment: {
        id: created.id,
        amount: created.amount,
        currency: created.currency,
        paymentMethod: created.paymentMethod,
        reference: created.reference,
        description: created.description,
        paidAt: created.paidAt,
      },
    };
  } catch (error) {
    // Contrainte unique sur `reference` : numéro déjà utilisé.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        message: "Cette référence de paiement est déjà utilisée.",
      };
    }

    if (isNextRedirectError(error)) throw error;

    console.error("[addTravelInstallmentAction] Échec :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de l'enregistrement de la tranche.",
    };
  }
}

/**
 * Supprime une tranche de règlement rattachée à un dossier.
 */
export async function deleteTravelInstallmentAction(
  paymentId: string
): Promise<TravelMutationResult> {
  await assertCanMutate();
  if (!paymentId) {
    return { ok: false, message: "Identifiant du règlement manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    const existing = await prisma.payment.findFirst({
      where: { id: paymentId, organizationId, travelProcedureId: { not: null } },
      select: { id: true, travelProcedureId: true },
    });

    if (!existing) {
      return { ok: false, message: "Règlement introuvable." };
    }

    await prisma.payment.delete({ where: { id: paymentId } });

    revalidateTravels();
    if (existing.travelProcedureId) {
      revalidatePath(`/dashboard/travels/${existing.travelProcedureId}`);
    }
    revalidatePath("/dashboard/payments");

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteTravelInstallmentAction] Échec :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression de la tranche.",
    };
  }
}
