"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  Loader2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Modale de progression pas-à-pas — « Données de démonstration »
// ---------------------------------------------------------------------------
// Affiche, DANS la modale de confirmation ouverte, une liste de contrôle dont
// chaque étape passe de « 🔄 en cours » (spinner) à « ✅ terminée » (coche) au
// fil des réponses des Server Actions exécutées séquentiellement par la carte
// (`await step1() → step2() → step3()`).
//
// Deux issues possibles :
// - Succès : bandeau vert (« Toutes les données de démo ont été nettoyées
//   avec succès ! » ou « Jeu de démonstration injecté avec succès ! ») + un
//   bouton unique « OK » qui recharge le tableau de bord ;
// - Échec : message d'erreur + boutons « Réessayer » / « Fermer ».
// ---------------------------------------------------------------------------

/** Statut d'une étape de la liste de contrôle. */
export type DemoProgressStepPhase = "pending" | "running" | "done" | "error";

/** Étape affichée dans la liste de contrôle (libellé « Étape N : … »). */
export type DemoProgressStep = {
  key: string;
  label: string;
};

export type DemoProgressModalProps = {
  /** Titre affiché au-dessus de la liste de contrôle. */
  title: string;
  /** Description contextuelle (ex : « ne fermez pas cette fenêtre »). */
  description: string;
  /** Étapes dans l'ordre d'exécution. */
  steps: DemoProgressStep[];
  /** Statut de chaque étape (par `key`). */
  statuses: Record<string, DemoProgressStepPhase>;
  /** Phase courante : exécution, succès ou échec. */
  phase: "running" | "done" | "error";
  /** Message principal du bandeau vert de succès. */
  successMessage?: string | null;
  /** Détail optionnel sous le message de succès (comptes supprimés…). */
  successDetail?: string | null;
  /** Message d'erreur affiché en cas d'échec. */
  errorMessage?: string | null;
  /** « Réessayer » — relance le flux depuis l'étape 1. */
  onRetry: () => void;
  /** « Fermer » — referme la modale. */
  onClose: () => void;
  /** « OK » — recharge le tableau de bord pour afficher les données fraîches. */
  onDone: () => void;
};

/** Icône de statut : spinner (en cours), coche (terminée), triangle (erreur). */
function renderStepIcon(status: DemoProgressStepPhase): React.ReactNode {
  switch (status) {
    case "running":
      return <Loader2Icon className="size-4 animate-spin text-indigo-600" />;
    case "done":
      return <CheckCircle2Icon className="size-4 text-emerald-600" />;
    case "error":
      return <AlertTriangleIcon className="size-4 text-destructive" />;
    default:
      return <CircleDotIcon className="size-4 text-muted-foreground/70" />;
  }
}

/**
 * Liste de contrôle pas-à-pas à afficher DANS la modale de confirmation :
 * chaque étape passe de 🔄 (spinner) à ✅ (coche) au fil des réponses des
 * Server Actions, puis un bandeau vert de succès + un bouton unique « OK »
 * concluent le flux (le clic sur « OK » recharge le tableau de bord).
 */
export function DemoProgressModal({
  title,
  description,
  steps,
  statuses,
  phase,
  successMessage,
  successDetail,
  errorMessage,
  onRetry,
  onClose,
  onDone,
}: DemoProgressModalProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {/* Liste de contrôle dynamique. */}
      <ul className="grid gap-2">
        {steps.map((step, index) => {
          const status = statuses[step.key] ?? "pending";
          const isRunning = status === "running";

          return (
            <li
              key={step.key}
              className="flex items-center gap-2 text-sm"
              aria-current={isRunning ? "true" : undefined}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                {renderStepIcon(status)}
              </span>
              <span
                className={
                  status === "done" || isRunning
                    ? "font-medium"
                    : "text-muted-foreground"
                }
              >
                Étape {index + 1} : {step.label}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Succès — bandeau vert + bouton unique « OK ». */}
      {phase === "done" ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">
                {successMessage ?? "Opération terminée."}
              </p>
              {successDetail ? <p className="mt-1">{successDetail}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Échec — message d'alerte. */}
      {phase === "error" ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{errorMessage ?? "Une erreur est survenue."}</span>
        </p>
      ) : null}

      {/* Pied de modale : « OK » au succès, « Réessayer »/« Fermer » en échec.
          Pendant l'exécution, aucun bouton — la modale ne se ferme pas. */}
      {phase !== "running" ? (
        <DialogFooter>
          {phase === "done" ? (
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              onClick={onDone}
            >
              OK
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Fermer
              </Button>
              <Button type="button" variant="destructive" onClick={onRetry}>
                Réessayer
              </Button>
            </>
          )}
        </DialogFooter>
      ) : null}
    </>
  );
}