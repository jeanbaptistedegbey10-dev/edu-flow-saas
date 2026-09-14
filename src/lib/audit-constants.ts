// --------------------------------------
// Constantes d'audit — module SANS directive « use server »
// --------------------------------------
//
// Contrainte Next.js : un fichier « use server » ne peut exporter QUE des
// fonctions async — toute constante/objet exporté casse le build
// (« A "use server" file can only export async functions, found object »).
// Les constantes d'audit vivent donc ici et sont importées par
// `src/lib/actions/audit.ts` ainsi que par les appelants (Server Actions,
// composants).

/** Types d'actions auditées (constantes pour éviter les fautes de frappe). */
export const AUDIT_ACTIONS = {
  STUDENT_CREATED: "STUDENT_CREATED",
  STUDENT_UPDATED: "STUDENT_UPDATED",
  STUDENT_DELETED: "STUDENT_DELETED",
  STUDENTS_IMPORTED: "STUDENTS_IMPORTED",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_UPDATED: "PAYMENT_UPDATED",
  PAYMENT_DELETED: "PAYMENT_DELETED",
  PAYMENT_VOIDED: "PAYMENT_VOIDED",
  CASH_OPENED: "CASH_OPENED",
  CASH_CLOSED: "CASH_CLOSED",
  CERTIFICATE_ISSUED: "CERTIFICATE_ISSUED",
  CERTIFICATE_REVOKED: "CERTIFICATE_REVOKED",
  DEMO_RESET: "DEMO_RESET",
  DEMO_SEEDED: "DEMO_SEEDED",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
  CLASS_CLOSED: "CLASS_CLOSED",
  ROLE_CREATED: "ROLE_CREATED",
  ROLE_UPDATED: "ROLE_UPDATED",
  ROLE_DELETED: "ROLE_DELETED",
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_DELETED: "USER_DELETED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Entités auditées. */
export const AUDIT_ENTITIES = {
  STUDENT: "Student",
  PAYMENT: "Payment",
  CASH_REGISTER_SESSION: "CashRegisterSession",
  CERTIFICATE: "Certificate",
  ORGANIZATION: "Organization",
  USER: "User",
  CUSTOM_ROLE: "CustomRole",
  CLASS: "Class",
  DEMO: "Demo",
} as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[keyof typeof AUDIT_ENTITIES];
