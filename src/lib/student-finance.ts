import type { StudentDetailDTO } from "@/actions/students";

/**
 * Récapitulatif agrégé du compte financier d'un étudiant (scolarité + caisse) :
 * - total des achats en caisse (books + services + autres) ;
 * - total encaissé (scolarité, paiements confirmés) ;
 * - reste à payer de la scolarité.
 */
export type StudentFinancialSummaryDTO = {
  /** Somme des paiements scolarité COMPLETED (encaissé activé). */
  totalTuitionPaid: number;
  /** Somme des achats en caisse (books + services + other). */
  totalPosSpent: number;
  /** Coût initial de la formation. */
  totalCost: number | null;
  /** Réduction accordée. */
  discount: number | null;
  /** Net à payer (coût — réduction). */
  netAmount: number | null;
  /** Solde débiteur restant sur la scolarité (max(0, net — encaissé — hérité)). */
  remainingAmount: number | null;
  /** Indique si la scolarité est intégralement réglée. */
  isFullyPaid: boolean;
};

/**
 * Calcule le récapitulatif financier global d'un étudiant (scolarité + caisse)
 * à partir de sa fiche détaillée. Utilisé par la vue 360° pour afficher un
 * total dépensé par le parent et le reste à payer de la scolarité.
 *
 * Le total "dépensé" = scolarité encaissée (COMPLETED) + achats en caisse
 * (StudentTransaction). Le reste à payer concerne uniquement la scolarité :
 * `max(0, netAmount − encaissé − montant hérité)`.
 *
 * (Fichier lib SANS directive « use server » : un module « use server » ne
 * peut exporter que des fonctions async — ce calcul pur synchrone vit ici.)
 */
export function getStudentFinancialSummary(
  detail: StudentDetailDTO
): StudentFinancialSummaryDTO {
  const totalTuitionPaid = detail.paidAmount ?? 0;
  const totalPosSpent = (detail.studentTransactions ?? []).reduce(
    (sum, tx) => sum + tx.amount,
    0
  );

  const isFullyPaid =
    detail.netAmount !== null &&
    detail.remainingAmount !== null &&
    detail.remainingAmount <= 0;

  return {
    totalTuitionPaid,
    totalPosSpent,
    totalCost: detail.totalCost,
    discount: detail.discount,
    netAmount: detail.netAmount,
    remainingAmount: detail.remainingAmount,
    isFullyPaid,
  };
}
