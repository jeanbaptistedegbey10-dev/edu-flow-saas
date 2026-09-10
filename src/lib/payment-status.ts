import type { PaymentMethod, PaymentStatus } from "@prisma/client";

/** Libellés français des statuts de paiement. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "En attente",
  PARTIAL: "Partiel",
  COMPLETED: "Payé",
  FAILED: "Échoué",
  REFUNDED: "Remboursé",
};

/**
 * Classes Tailwind des badges de statut de paiement — style moderne :
 * fond clair translucide, texte assorti et fine bordure (variante sombre incluse).
 */
export const PAYMENT_STATUS_BADGE_CLASSES: Record<PaymentStatus, string> = {
  PENDING:
    "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  PARTIAL:
    "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  COMPLETED:
    "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  FAILED:
    "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  REFUNDED:
    "border border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400",
};

/** Libellés français des moyens de paiement. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement bancaire",
  MOBILE_MONEY: "Mobile Money",
  CREDIT_CARD: "Carte bancaire",
  CHECK: "Chèque",
};

/** Ordre d'affichage des statuts (filtres, modale). */
export const PAYMENT_STATUS_ORDER: readonly PaymentStatus[] = [
  "PENDING",
  "PARTIAL",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
];

/** Ordre d'affichage des moyens de paiement (filtres, modale). */
export const PAYMENT_METHOD_ORDER: readonly PaymentMethod[] = [
  "CASH",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CREDIT_CARD",
  "CHECK",
];

export function getPaymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status];
}

export function getPaymentStatusBadgeClass(status: PaymentStatus): string {
  return PAYMENT_STATUS_BADGE_CLASSES[status];
}

export function getPaymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method];
}

// --------------------------------------
// Écritures suspendues (Payment.isVoided)
// --------------------------------------

/** Libellé d'une écriture suspendue (hors trésorerie active). */
export const PAYMENT_VOIDED_LABEL = "Suspendu";

/** Classes Tailwind du badge d'une écriture suspendue. */
export const PAYMENT_VOIDED_BADGE_CLASSES =
  "border border-slate-200/60 bg-slate-50 text-slate-600 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400";