/**
 * Vérification du formateur / sanitisation du journal d'audit.
 * Usage : npx tsx scripts/smoke-audit-format.ts
 */
import {
  formatAuditDetails,
  getAuditActionLabel,
  getAuditEntityLabel,
  summarizeAuditDetails,
} from "../src/lib/audit-labels";
import { sanitizeAuditDetails } from "../src/lib/audit-sanitize";

const CASES: ReadonlyArray<{ action: string; entity: string; details: unknown }> = [
  {
    action: "CLASS_UNARCHIVED",
    entity: "Class",
    details: {
      className: "Classe A Archiver",
      previousStatus: "ARCHIVED",
      reopenedStatus: "ACTIVE",
      reactivatedEnrollments: 7,
    },
  },
  {
    action: "PAYMENT_RECEIVED",
    entity: "Payment",
    details: {
      createdByUserId: "ckq8w9x000001",
      studentName: "Awa Ndiaye",
      amount: 50000,
      method: "MOBILE_MONEY",
      status: "COMPLETED",
      isOutOfSystem: false,
    },
  },
  {
    action: "CLASS_CLOSED",
    entity: "Class",
    details: {
      className: "Classe B",
      promoted: 12,
      retained: 3,
      dropped: 1,
      targetClassName: "Allemand A2",
      chargedReRegistrationFee: 15000,
    },
  },
  {
    action: "USER_CREATED",
    entity: "User",
    details: {
      email: "professeur@exemple.com",
      password: "MotDePasseSecret123!",
      apiKey: "sk_live_abcdefgh12345678",
      cardNumber: "4242424242424242",
      jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmno",
      nested: { refreshToken: "abc123", keep: "visible" },
    },
  },
];

for (const testCase of CASES) {
  console.log("=".repeat(70));
  console.log("Action :", getAuditActionLabel(testCase.action));
  console.log("Entité :", getAuditEntityLabel(testCase.entity));
  console.log("Résumé :", summarizeAuditDetails(testCase.details, testCase.action));
  console.log("Détails :");
  for (const entry of formatAuditDetails(testCase.details, testCase.action)) {
    console.log(`  - ${entry.label} : ${entry.value}`);
  }
  console.log("Payload persisté :", JSON.stringify(sanitizeAuditDetails(testCase.details)));
}