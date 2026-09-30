/**
 * Donnees du bulletin / rapport d'evaluation premium.
 * Le rendu ecran (React) et le document telecharge partagent
 * exactement ces donnees et la meme charte visuelle.
 *
 * Formation modulaire : chaque module est valide INDEPENDAMIMENT selon le
 * bareme (maxScore) et le seuil (passingScore) configures par le professeur.
 * Aucune moyenne generale, aucun coefficient : la note est affichee sur le
 * bareme reel (ex : « 60 / 100 »).
 */

/** Ligne module du bulletin : note obtenue sur le bareme reel du module. */
export type PremiumReportRow = {
  /** Intitule de la session d'evaluation (ex : « Examen Continu N°1 »). */
  evaluationTitle: string;
  /** Nom du module evalue (ex : « Lesen »). */
  module: string;
  /** Date de la session d'evaluation (null si indisponible). */
  date: Date | null;
  /** Note obtenue sur le bareme du module (null si non note). */
  score: number | null;
  /** Bareme configure par le professeur (ex : 100). */
  maxScore: number;
  /** Seuil de validation du module (ex : 60). */
  passingScore: number;
  /**
   * true : note >= seuil → module VALIDE.
   * false : note < seuil → module NON VALIDE.
   * null : module non note (ligne sans statut).
   */
  passed: boolean | null;
};

/** Cle d'un mode de reglement (aligne sur l'enum Prisma PaymentMethod). */
export type PremiumPaymentMethodKey =
  | "CASH"
  | "BANK_TRANSFER"
  | "MOBILE_MONEY"
  | "CREDIT_CARD"
  | "CHECK";

/** Libelles francais des modes de reglement (bulletin / rapport global). */
export const PAYMENT_METHOD_LABELS: Record<PremiumPaymentMethodKey, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement",
  MOBILE_MONEY: "Mobile Money",
  CREDIT_CARD: "Carte bancaire",
  CHECK: "Chèque",
};

/** Resout le libelle francais d'un mode de reglement (fallback : brut). */
export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method as PremiumPaymentMethodKey] ?? method;
}

/** Versement chronologique affiche dans les historiques de paiement. */
export type PremiumPaymentEntry = {
  /** Date du versement (UTC). */
  paidAt: Date;
  /** Montant du versement en FCFA. */
  amount: number;
  /** Libelle du mode de reglement (Espèces, Mobile Money…). */
  method: string;
  /** Reference / libelle optionnel du versement. */
  reference: string | null;
};

/** Compteurs d'assiduite d'un bulletin premium (bilan des emargements). */
export type PremiumAttendanceSummary = {
  /** Nombre total d'emargements consideres. */
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
};

/**
 * Recapitulatif financier detaille du RAPPORT GLOBAL (admin / staff).
 * Reserve aux roles administratifs : il n'apparait JAMAIS sur le bulletin
 * academique de l'enseignant (`financial: null`).
 */
export type PremiumFinancialSummary = {
  /** Prix de la formation (cout total brut) en FCFA. */
  totalCost: number | null;
  /** Reduction accordee (montant FCFA), null si non renseignee. */
  discount: number | null;
  /** Libelle de la reduction (ex : « 10 % » ou « 25 000 FCFA »), sinon null. */
  discountLabel: string | null;
  /** Net a payer apres reduction (prix − reduction). */
  netAmount: number | null;
  /** Total encaisse (paiements COMPLETED, non suspendus) en FCFA. */
  amountPaid: number;
  /** Reste a payer calcule (>= 0), null si aucun montant de formation. */
  remaining: number | null;
  /** Statut financier lisible : true si solde integrale (Soldé). */
  isFullyPaid: boolean | null;
  /** Historique chronologique des versements (du plus ancien au plus recent). */
  history: PremiumPaymentEntry[];
};

/** Etape de la procedure de voyage avec son etat de validation. */
export type PremiumTravelStep = {
  /** Libelle de l'etape (ex : « Test de langue »). */
  label: string;
  /** true si l'etape est validee (passe depuis le statut courant). */
  validated: boolean;
};

/**
 * Section « Procedure de voyage » du RAPPORT GLOBAL (admin / staff) :
 * avancement du dossier + historique des reglements specifiques au voyage.
 * Reservee aux roles administratifs (`travel: null` sur le bulletin).
 */
export type PremiumTravelSummary = {
  /** Destination du dossier (ex : « Allemagne »). */
  destination: string;
  /** Programme vise (ex : « Ausbildung »), null si non renseigne. */
  targetProgram: string | null;
  /** Libelle du statut courant du dossier (ex : « Visa approuvé »). */
  statusLabel: string;
  /** Etapes du workflow avec leur etat de validation. */
  steps: PremiumTravelStep[];
  /** Nombre d'etapes validees. */
  validatedSteps: number;
  /** Nombre total d'etapes du workflow (0 si aucun workflow). */
  totalSteps: number;
  /** Cout total du dossier (FCFA). */
  totalCost: number | null;
  /** Reduction accordee sur le dossier (FCFA). */
  discount: number | null;
  /** Net a payer du dossier (FCFA). */
  netAmount: number | null;
  /** Total regle pour la procedure (FCFA). */
  amountPaid: number;
  /** Reste a payer du dossier (>= 0), null si non calculable. */
  remaining: number | null;
  /** Historique chronologique des reglements du dossier de voyage. */
  history: PremiumPaymentEntry[];
};

/** Portee du document : bulletin academique (enseignant) ou rapport global (admin). */
export type PremiumReportScope = "academic" | "global";

/** Donnees completes d'un bulletin premium, pretes pour l'impression. */
export type PremiumReportData = {
  studentFirstName: string;
  studentLastName: string;
  studentCode: string;
  className: string | null;
  courseTitle: string | null;
  /** Periode / semestre affichee (ex : "Semestre 1 — 2025/2026"). */
  periodLabel: string;
  /** Professeur responsable (cartouche eleve). */
  teacherName: string | null;
  /** Portee du document : academic (aucune donnee financiere) ou global (admin). */
  scope: PremiumReportScope;
  rows: PremiumReportRow[];
  /** Nombre de modules VALIDES (note >= seuil). */
  validatedModules: number;
  /** Nombre de modules NOTES (base du ratio de validation). */
  gradedModules: number;
  /** Texte « Appréciation / Recommandations de l'enseignant ». */
  generalAppreciation: string;
  /** Identifiant unique du document (ex : REP-2026-4821). */
  documentNumber: string;
  /** Date d'edition (UTC). */
  issuedAt: Date;
  /**
   * Resume d'assiduite (optionnel : non renseigne si aucune donnee
   * d'emargement n'est disponible).
   */
  attendance: PremiumAttendanceSummary | null;
  /**
   * Recapitulatif financier detaille : RENSEIGNE UNIQUEMENT pour le rapport
   * global (admin / staff) — toujours null sur le bulletin academique de
   * l'enseignant (exclusion stricte des donnees financieres).
   */
  financial: PremiumFinancialSummary | null;
  /**
   * Section procedure de voyage : RENSEIGNEE UNIQUEMENT pour le rapport
   * global (admin / staff) et si un dossier de voyage existe.
   */
  travel: PremiumTravelSummary | null;
};

export type PremiumReportOrganization = {
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  rccm: string | null;
  ifu: string | null;
};

/**
 * Adresse affichable de l'organisation (ex : « Abidjan, Cocody »).
 * Evite la duplication : si la ville est deja incluse dans l'adresse,
 * seule l'adresse complete est renvoyee (`address + ", " + city` sinon).
 */
export function formatOrganizationAddress(
  organization: Pick<PremiumReportOrganization, "address" | "city">
): string {
  const address = organization.address?.trim() ?? "";
  const city = organization.city?.trim() ?? "";
  if (address.length === 0) return city;
  if (city.length === 0) return address;
  return address.toLowerCase().includes(city.toLowerCase())
    ? address
    : `${address}, ${city}`;
}

const frNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** Formate une note sur son bareme reel (2 decimales max, "—" si absente). */
export function formatScore(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "—";
  return frNumber.format(Math.round(score * 100) / 100);
}

/** Affiche « 60 / 100 » : note sur le bareme reel du module. */
export function formatScoreOnScale(
  score: number | null,
  maxScore: number
): string {
  return `${formatScore(score)} / ${formatScore(maxScore)}`;
}

/** Compte les modules valides / notes a partir des lignes du bulletin. */
export function computeModuleValidation(
  rows: ReadonlyArray<{ passed: boolean | null }>
): {
  validatedModules: number;
  gradedModules: number;
} {
  let validatedModules = 0;
  let gradedModules = 0;

  for (const row of rows) {
    if (row.passed === null) continue;
    gradedModules += 1;
    if (row.passed) validatedModules += 1;
  }

  return { validatedModules, gradedModules };
}

/** Appreciation par defaut (texte serveur) a partir du ratio de validation. */
export function defaultAppreciationForValidation(
  validatedModules: number,
  gradedModules: number
): string {
  if (gradedModules === 0) {
    return "Aucune note saisie pour cette période : bulletin non significatif.";
  }

  if (validatedModules === gradedModules) {
    return "Tous les modules évalués sont validés. L'élève maîtrise les compétences visées : poursuivez dans cette dynamique.";
  }

  if (validatedModules === 0) {
    return "Aucun module validé à ce jour. Un accompagnement renforcé et un travail régulier sont indispensables.";
  }

  return `${validatedModules} module${validatedModules > 1 ? "s" : ""} validé${validatedModules > 1 ? "s" : ""} sur ${gradedModules} évalué${gradedModules > 1 ? "s" : ""}. Les modules non validés doivent être repris : encouragez la persévérance.`;
}

// --------------------------------------
// Appréciation personnalisée du bulletin
// --------------------------------------

/**
 * Portée d'un bulletin : détermine à quel document l'appréciation
 * personnalisée s'applique. Le préfixe permet à une SEULE table
 * (`BulletinAppreciation`) de porter les deux documents :
 * - `exam:<evaluationId>` → bulletin d'une session d'examen précise ;
 * - `recap:<classId>`     → bulletin récapitulatif de la classe
 *   (`recap:global` quand l'étudiant n'a pas de classe active).
 */
export const BULLETIN_SCOPE_EXAM = "exam";
export const BULLETIN_SCOPE_RECAP = "recap";
/** Portée « hors classe » du bulletin récapitulatif. */
export const BULLETIN_RECAP_GLOBAL = "global";
/** Longueur maximale d'une appréciation personnalisée (garde-fou serveur). */
export const MAX_APPRECIATION_LENGTH = 1200;

/** Portée du bulletin d'examen d'une session. */
export function examAppreciationScope(evaluationId: string): string {
  return `${BULLETIN_SCOPE_EXAM}:${evaluationId}`;
}

/** Portée du bulletin récapitulatif d'une classe (ou `recap:global`). */
export function recapAppreciationScope(classId: string | null): string {
  const clean =
    classId !== null && classId.trim().length > 0
      ? classId.trim()
      : BULLETIN_RECAP_GLOBAL;
  return `${BULLETIN_SCOPE_RECAP}:${clean}`;
}

/**
 * Valide une portée reçue du client : format strict `exam:<id>` ou
 * `recap:<id>` avec un identifiant type cuid/uuid. Empêche l'injection
 * d'une portée arbitraire dans la base.
 */
export function isValidAppreciationScope(scope: string): boolean {
  return /^(exam|recap):[A-Za-z0-9_-]{1,64}$/.test(scope);
}

/**
 * Normalise un texte saisi par l'enseignant : fins de ligne CRLF unifiées,
 * espaces de bordure retirés, longueur plafonnée. Retourne une chaîne VIDE
 * si l'utilisateur a tout effacé (le serveur supprime alors la ligne et
 * restaure l'appréciation automatique).
 */
export function normalizeAppreciationText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, MAX_APPRECIATION_LENGTH);
}

/**
 * Texte réellement affiché sur le bulletin : le texte personnalisé s'il
 * existe, sinon l'appréciation automatique calculée à partir des résultats.
 */
export function resolveAppreciation(
  automaticText: string,
  customText: string | null | undefined
): string {
  const custom = customText?.trim() ?? "";
  return custom.length > 0 ? custom : automaticText;
}

/**
 * Numero de document unique et lisible au format demande :
 * `REP-<ANNEE>-<XXXX>` (ex : REP-2026-4821).
 * L'aleatoire 4 chiffres est suffisant pour un identifiant d'affichage ;
 * le token d'acces securise reste gere cote base de donnees.
 */
export function formatPremiumReportNumber(
  _studentCode: string,
  issuedAt: Date
): string {
  const y = issuedAt.getUTCFullYear();
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `REP-${y}-${random}`;
}
