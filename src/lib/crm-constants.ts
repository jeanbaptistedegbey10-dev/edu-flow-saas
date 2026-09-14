// --------------------------------------
// Constantes CRM — module SANS directive « use server »
// --------------------------------------
//
// Contrainte Next.js : un fichier « use server » ne peut exporter QUE des
// fonctions async — toute constante/objet exporté casse le build
// (« A "use server" file can only export async functions, found object »).
// Les libellés/options du pipeline vivent donc ici et sont importés par
// `src/lib/actions/crm.ts` ainsi que par les composants clients.

import type { LeadSource, LeadStage, LostReason } from "@prisma/client";

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW_LEAD: "Nouveau prospect",
  CONTACTED: "Contacté",
  ASSESSMENT_TEST: "Test de niveau",
  ENROLLED: "Inscrit",
  LOST: "Perdu",
};

export const LEAD_STAGE_ORDER: LeadStage[] = [
  "NEW_LEAD",
  "CONTACTED",
  "ASSESSMENT_TEST",
  "ENROLLED",
  "LOST",
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  FACEBOOK_INSTAGRAM: "Facebook / Instagram",
  RECOMMENDATION: "Recommandation",
  WALK_IN: "Passage en vitrine",
  WEBSITE: "Site web",
  OTHER: "Autre",
};

export const LEAD_SOURCE_OPTIONS: ReadonlyArray<{
  value: LeadSource;
  label: string;
}> = [
  { value: "FACEBOOK_INSTAGRAM", label: "Facebook / Instagram" },
  { value: "RECOMMENDATION", label: "Recommandation" },
  { value: "WALK_IN", label: "Passage en vitrine" },
  { value: "WEBSITE", label: "Site web" },
  { value: "OTHER", label: "Autre" },
];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRICE: "Prix trop élevé",
  SCHEDULE_CONFLICT: "Conflit d'horaires",
  LOCATION: "Localisation",
  CHOOSEN_COMPETITOR: "Concurrent choisi",
  NO_RESPONSE: "Pas de réponse",
};

export const LOST_REASON_OPTIONS: ReadonlyArray<{
  value: LostReason;
  label: string;
}> = [
  { value: "PRICE", label: "Prix trop élevé" },
  { value: "SCHEDULE_CONFLICT", label: "Conflit d'horaires" },
  { value: "LOCATION", label: "Localisation" },
  { value: "CHOOSEN_COMPETITOR", label: "Concurrent choisi" },
  { value: "NO_RESPONSE", label: "Pas de réponse" },
];
