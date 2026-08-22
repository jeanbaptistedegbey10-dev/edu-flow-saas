import type { PaymentMethod, PaymentStatus } from "@prisma/client";

/** Libellés français des statuts de paiement. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "En attente",
  PARTIAL: "Partiel",
  COMPLETED: "Payé",
  FAILED: "Échoué",
  REFUNDED: "Remboursé",
};

/** Classes Tailwind des badges de statut de paiement. */
export const PAYMENT_STATUS_BADGE_CLASSES: Record<PaymentStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  PARTIAL: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-400",
  REFUNDED: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
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