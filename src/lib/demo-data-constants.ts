// --------------------------------------
// Données de démonstration — constantes partagées
// --------------------------------------
//
// ⚠️ Ce fichier NE doit PAS contenir de directive « use server » : il expose
// des valeurs non-fonctions (type + objet) consommées par les composants
// clients et par `src/lib/actions/demo-data.ts`. Les fichiers « use server »
// n'ont le droit d'exporter QUE des fonctions asynchrones — toute constante
// ou type partagé doit vivre ici (ou dans un module similaire hors actions).

import type { DemoDataResetCounts } from "@/lib/demo-data";

/** État sérialisable retourné aux composants clients (`useActionState`). */
export type DemoDataActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Comptes supprimés (renseignés par les sous-actions en cas de succès). */
  counts?: DemoDataResetCounts;
};

/** État initial partagé par les formulaires client. */
export const INITIAL_ACTION_STATE: DemoDataActionState = { status: "idle" };
