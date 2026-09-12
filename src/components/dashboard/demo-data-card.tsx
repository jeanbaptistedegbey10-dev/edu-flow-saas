"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  AlertTriangleIcon,
  FlaskConicalIcon,
  Loader2Icon,
  RefreshCcwIcon,
  ShieldAlertIcon,
} from "lucide-react";

import {
  injectDemoDataAction,
  resetCoursesStepAction,
  resetFinancialStepAction,
  resetStudentsStepAction,
} from "@/lib/actions/demo-data";
import type { DemoDataActionState } from "@/lib/demo-data-constants";
import type { DemoDataResetCounts } from "@/lib/demo-data";
import {
  DemoProgressModal,
  type DemoProgressStepPhase,
} from "@/components/dashboard/demo-progress-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: DemoDataActionState = { status: "idle" };

/** Mot de confirmation exigé pour ÉCRASER des données existantes (injection). */
const OVERWRITE_CONFIRM_WORD = "CONFIRMER";
/** Mot de confirmation exigé pour SUPPRIMER définitivement les données. */
const DELETE_CONFIRM_WORD = "SUPPRIMER";

// ---------------------------------------------------------------------------
// Flux pas-à-pas anti-timeout
// ---------------------------------------------------------------------------
// La confirmation (CONFIRMER / SUPPRIMER) N'ENVOIE PLUS une seule requête
// monolithique : la modale reste ouverte et exécute SÉQUENTIELLEMENT trois
// sous-actions courtes (une requête HTTP chacune, chacune < 3 s côté serveur),
// en affichant une liste de contrôle qui passe de 🔄 (spinner) à ✅ (coche)
// au fil des réponses. Le clic sur « OK » recharge ensuite le tableau de bord.

type ConfirmTarget = "inject" | "reset";

type StepKey = "students" | "courses" | "financial" | "inject";

type DemoFlowPhase = "confirm" | "running" | "done" | "error";

type DemoFlowStep = { key: StepKey; label: string };

type DemoFlowState = {
  phase: DemoFlowPhase;
  steps: DemoFlowStep[];
  status: Record<string, DemoProgressStepPhase>;
  successMessage: string | null;
  successDetail: string | null;
  errorMessage: string | null;
};

/** Étape 3 — étudiants et scolarité (racines, supprimés en dernier). */
const STEP_STUDENTS: DemoFlowStep = {
  key: "students",
  label: "Nettoyage des étudiants et de la scolarité...",
};

/** Étape 2 — cours, évaluations et présences. */
const STEP_COURSES: DemoFlowStep = {
  key: "courses",
  label: "Suppression des cours, évaluations et présences...",
};

/** Étape 1 — données financières et paramètres (dépendances, supprimés en premier). */
const STEP_FINANCIAL: DemoFlowStep = {
  key: "financial",
  label: "Réinitialisation des données financières et paramètres...",
};

/** Étape 4 — injection du jeu de démonstration (flux inject uniquement). */
const STEP_INJECT: DemoFlowStep = {
  key: "inject",
  label: "Injection du jeu de démonstration...",
};

const RESET_STEPS: DemoFlowStep[] = [
  STEP_FINANCIAL,
  STEP_COURSES,
  STEP_STUDENTS,
];

const INJECT_STEPS: DemoFlowStep[] = [
  STEP_FINANCIAL,
  STEP_COURSES,
  STEP_STUDENTS,
  STEP_INJECT,
];

/** Comptes de suppression remis à zéro (fusion des étapes côté client). */
const ZERO_RESET_COUNTS: DemoDataResetCounts = {
  students: 0,
  classes: 0,
  courses: 0,
  payments: 0,
  expenses: 0,
  sales: 0,
  tasks: 0,
  attendances: 0,
  classSessions: 0,
  documents: 0,
  travelProcedures: 0,
  travelSteps: 0,
  demoUsers: 0,
  classEnrollments: 0,
  enrollments: 0,
  housings: 0,
  grades: 0,
  evaluations: 0,
  courseLogs: 0,
  payrolls: 0,
  productServices: 0,
  productCategories: 0,
  workflows: 0,
  workflowStages: 0,
  customRoles: 0,
};

/** Crée un flux remis à zéro (phase « confirmation », toutes étapes pending). */
function makeFlow(steps: DemoFlowStep[]): DemoFlowState {
  return {
    phase: "confirm",
    steps,
    status: Object.fromEntries(
      steps.map((step) => [step.key, "pending"])
    ) as Record<string, DemoProgressStepPhase>,
    successMessage: null,
    successDetail: null,
    errorMessage: null,
  };
}

/** Cumule les comptes supprimés renvoyés par chaque étape (message final). */
function mergeResetCounts(
  target: DemoDataResetCounts,
  step?: DemoDataResetCounts | null
): DemoDataResetCounts {
  if (!step) return target;
  const acc = target as Record<string, number>;
  for (const [key, value] of Object.entries(step)) {
    acc[key] += value;
  }
  return target;
}

/**
 * Carte « Données de démonstration » du tableau de bord (administrateurs).
 *
 * Garde-fous déployés :
 * - Deletion guard : « Supprimer la démo » est désactivé lorsque le centre ne
 *   contient aucune donnée (`hasData === false`) ;
 * - Confirmation mot-clé : injecter (écrasement des données existantes) exige
 *   la saisie de CONFIRMER et supprimer exige SUPPRIMER — la vérification est
 *   rejouée côté serveur À CHAQUE étape (src/lib/actions/demo-data.ts) ;
 * - Exécution pas-à-pas : la modale reste ouverte pendant les trois étapes
 *   (`await step1() → step2() → step3()`), affiche la progression en direct
 *   puis un bandeau vert de succès ; le bouton « OK » recharge la page ;
 * - `useActionState` conserve le chemin d'injection direct (organisation vide)
 *   et bloque toute double soumission.
 */
export function DemoDataCard({
  isAdmin,
  hasData,
}: {
  isAdmin: boolean;
  hasData: boolean;
}) {
  // Injection directe (organisation vide) — Server Action unique, rapide.
  const [injectState, injectFormAction, injectPending] = useActionState(
    injectDemoDataAction,
    INITIAL_STATE
  );

  const [confirmTarget, setConfirmTarget] = React.useState<ConfirmTarget | null>(
    null
  );
  const [confirmWord, setConfirmWord] = React.useState("");
  const [flows, setFlows] = React.useState<
    Record<ConfirmTarget, DemoFlowState>
  >(() => ({
    inject: makeFlow(INJECT_STEPS),
    reset: makeFlow(RESET_STEPS),
  }));

  const [, startTransition] = React.useTransition();

  const injectFlow = flows.inject;
  const resetFlow = flows.reset;

  // Un seul flux à la fois : les boutons de la carte sont gelés pendant
  // l'exécution d'un quelconque flux pas-à-pas.
  const anyRunning =
    injectFlow.phase === "running" || resetFlow.phase === "running";
  const pending = injectPending || anyRunning;

  // Message de l'injection directe (organisation vide).
  const message = injectState.message;
  const success = injectState.status === "success";
  const isError = injectState.status === "error";
  const showMessage = message && !pending;

  const activeFlow = confirmTarget ? flows[confirmTarget] : null;
  const activeRunning = activeFlow?.phase === "running";

  const requiredWord =
    confirmTarget === "reset" ? DELETE_CONFIRM_WORD : OVERWRITE_CONFIRM_WORD;
  const confirmValid = confirmWord.trim().toUpperCase() === requiredWord;

  // Deletion guard : le bouton « Supprimer la démo » est inopérant sans données.
  const resetDisabled = !isAdmin || !hasData || pending;

  const resetTitle = !isAdmin
    ? "Réservé aux administrateurs"
    : !hasData
      ? "Aucune donnée de démonstration à supprimer"
      : "Supprimer définitivement toutes les données métier";

  const closeConfirm = React.useCallback(() => {
    setConfirmTarget(null);
    setConfirmWord("");
  }, []);

  // Ouvre une modale de confirmation : le flux repart de la phase « confirm ».
  const openConfirm = (target: ConfirmTarget) => {
    setConfirmWord("");
    setFlows((prev) => ({
      ...prev,
      [target]: makeFlow(target === "reset" ? RESET_STEPS : INJECT_STEPS),
    }));
    setConfirmTarget(target);
  };
  /**
   * Exécute le flux pas-à-pas : trois étapes de nettoyage séquentielles
   * (une requête HTTP chacune) puis, pour l'injection, le seeding final.
   * La liste de contrôle de la modale est mise à jour après chaque réponse.
   */
  const runDemoFlow = (target: ConfirmTarget) => {
    const word = confirmWord.trim().toUpperCase();
    if (word !== requiredWord) return;

    const steps = target === "reset" ? RESET_STEPS : INJECT_STEPS;

    // Bascule en phase « exécution » : toutes les étapes repassent à pending.
    setFlows((prev) => ({
      ...prev,
      [target]: {
        ...prev[target],
        phase: "running",
        steps,
        status: Object.fromEntries(
          steps.map((step) => [step.key, "pending"])
        ) as Record<string, DemoProgressStepPhase>,
        successMessage: null,
        successDetail: null,
        errorMessage: null,
      },
    }));
    setConfirmWord("");

    // La confirmation mot-clé est transmise à CHAQUE étape (rejouée serveur).
    const formData = new FormData();
    formData.set("confirmation", word);

    const mark = (key: StepKey, status: DemoProgressStepPhase) =>
      setFlows((prev) => ({
        ...prev,
        [target]: {
          ...prev[target],
          status: { ...prev[target].status, [key]: status },
        },
      }));

    const fail = (key: StepKey, errorMessage: string) =>
      setFlows((prev) => ({
        ...prev,
        [target]: {
          ...prev[target],
          phase: "error",
          status: { ...prev[target].status, [key]: "error" },
          errorMessage,
        },
      }));

    const complete = (successMessage: string, successDetail: string) =>
      setFlows((prev) => ({
        ...prev,
        [target]: {
          ...prev[target],
          phase: "done",
          successMessage,
          successDetail,
          errorMessage: null,
        },
      }));

        startTransition(async () => {
      let currentStep: StepKey = "financial";
      const merged: DemoDataResetCounts = { ...ZERO_RESET_COUNTS };

      try {
        // ---------------------------------------------------------------
        // Étape 1 — Nettoyage des données financières et paramètres
        // (dépendances : Expenses, Payments, Tasks, etc.)
        // ---------------------------------------------------------------
        currentStep = "financial";
        mark("financial", "running");
        const stepFinancial = await resetFinancialStepAction(
          INITIAL_STATE,
          formData
        );
        if (stepFinancial.status !== "success") {
          fail(
            "financial",
            stepFinancial.message ??
              "Échec de la réinitialisation des données financières et paramètres."
          );
          return;
        }
        mergeResetCounts(merged, stepFinancial.counts);
        mark("financial", "done");

        // ---------------------------------------------------------------
        // Étape 2 — Suppression des cours, évaluations et présences.
        // ---------------------------------------------------------------
        currentStep = "courses";
        mark("courses", "running");
        const stepCourses = await resetCoursesStepAction(
          INITIAL_STATE,
          formData
        );
        if (stepCourses.status !== "success") {
          fail(
            "courses",
            stepCourses.message ??
              "Échec de la suppression des cours, évaluations et présences."
          );
          return;
        }
        mergeResetCounts(merged, stepCourses.counts);
        mark("courses", "done");

        // ---------------------------------------------------------------
        // Étape 3 — Nettoyage des étudiants et de la scolarité (racines).
        // ---------------------------------------------------------------
        currentStep = "students";
        mark("students", "running");
        const stepStudents = await resetStudentsStepAction(
          INITIAL_STATE,
          formData
        );
        if (stepStudents.status !== "success") {
          fail(
            "students",
            stepStudents.message ??
              "Échec du nettoyage des étudiants et de la scolarité."
          );
          return;
        }
        mergeResetCounts(merged, stepStudents.counts);
        mark("students", "done");


        // Réinitialisation : terminé (bandeau vert + bouton unique « OK »).
        if (target === "reset") {
          complete(
            "Toutes les données de démo ont été nettoyées avec succès !",
            `Base réinitialisée : ${merged.students} élèves, ${merged.courses} cours, ${merged.payments} paiements supprimés.`
          );
          return;
        }

        // ---------------------------------------------------------------
        // Étape 4 — Injection du jeu de démonstration (organisation purgée).
        // ---------------------------------------------------------------
        currentStep = "inject";
        mark("inject", "running");
        const seed = await injectDemoDataAction(INITIAL_STATE, formData);
        if (seed.status !== "success") {
          fail(
            "inject",
            seed.message ?? "Échec de l'injection du jeu de démonstration."
          );
          return;
        }
        mark("inject", "done");
        complete(
          "Jeu de démonstration injecté avec succès !",
          seed.message ?? ""
        );
      } catch (error: any) {
        console.error("[demo-data-card] Étape en échec :", error);
        fail(
          currentStep,
          error?.message ??
            "Une erreur est survenue pendant l'opération. Veuillez réessayer."
        );
      }
    });
  };
  return (
    <section className="rounded-xl border border-dashed bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <FlaskConicalIcon className="size-4 text-indigo-600" />
        <h2 className="font-semibold tracking-tight">Données de démonstration</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Injectez <strong>2-3 classes, 5 élèves et 2 reçus</strong> d&apos;exemple pour
        tester l&apos;application immédiatement, ou réinitialisez votre base en 1 clic.
      </p>

      <div className="mt-4 grid gap-3">
        {showMessage ? (
          <p
            role="status"
            className={
              success
                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                : isError
                  ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
            }
          >
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {hasData ? (
            // Des données existent : l'injection les écrase — confirmation requise
            // puis exécution pas-à-pas dans la modale (anti-timeout).
            <Button
              type="button"
              size="sm"
              disabled={pending}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => openConfirm("inject")}
            >
              <FlaskConicalIcon className="size-4" />
              Injecter la démo
            </Button>
          ) : (
            // Organisation vide : injection directe (double soumission bloquée).
            <form
              action={injectFormAction}
              onSubmit={(event) => {
                if (pending) {
                  event.preventDefault();
                }
              }}
            >
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {injectPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <FlaskConicalIcon className="size-4" />
                )}
                Injecter la démo
              </Button>
            </form>
          )}

          {/* Deletion guard : « Supprimer la démo » désactivé sans données. */}
          {hasData ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={resetDisabled}
              title={resetTitle}
              className="text-destructive hover:text-destructive"
              onClick={() => openConfirm("reset")}
            >
              <RefreshCcwIcon className="size-4" />
              Supprimer la démo
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              title={resetTitle}
              className="text-destructive hover:text-destructive disabled:opacity-50"
            >
              <RefreshCcwIcon className="size-4" />
              Supprimer la démo
            </Button>
          )}

          {!isAdmin ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangleIcon className="size-3.5" />
              Réinitialisation réservée aux administrateurs
            </span>
          ) : null}

          {hasData ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldAlertIcon className="size-3.5" />
              Confirmation par mot-clé requise
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldAlertIcon className="size-3.5" />
              Aucune donnée à supprimer
            </span>
          )}
        </div>

      </div>

      {/* ------------------------------------------------------------------
          Modale « Suppression définitive » — mot clé : SUPPRIMER.
          Après confirmation, la modale RESTE OUVERTE et affiche la liste de
          contrôle pas-à-pas (une requête par étape, anti-timeout Vercel).
      ------------------------------------------------------------------- */}
      <Dialog
        open={confirmTarget === "reset"}
        onOpenChange={(open) => {
          // Fermeture impossible pendant l'exécution des étapes.
          if (!open && !activeRunning) closeConfirm();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!activeRunning}
          onEscapeKeyDown={(event) => {
            if (activeRunning) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (activeRunning) event.preventDefault();
          }}
        >
          {resetFlow.phase === "confirm" ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                runDemoFlow("reset");
              }}
            >
              <DialogHeader>
                <DialogTitle>Supprimer toutes les données ?</DialogTitle>
                <DialogDescription>
                  Élèves, cours, sessions, paiements, ventes, présences,
                  dossiers voyage… <strong>toutes</strong> les données de
                  l&apos;organisation seront définitivement supprimées (compte
                  administrateur conservé). Tapez{" "}
                  <span className="font-mono font-semibold">
                    {DELETE_CONFIRM_WORD}
                  </span>{" "}
                  pour confirmer.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="demo-delete-confirmation">
                  Mot de confirmation
                </Label>
                <Input
                  id="demo-delete-confirmation"
                  name="confirmation"
                  value={confirmWord}
                  onChange={(event) => setConfirmWord(event.target.value)}
                  placeholder={DELETE_CONFIRM_WORD}
                  autoFocus
                  className="font-mono uppercase"
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    Annuler
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={!confirmValid || pending || !isAdmin}
                >
                  <RefreshCcwIcon className="size-4" />
                  Supprimer définitivement
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <DemoProgressModal
              title="Réinitialisation en cours..."
              description="Suppression séquentielle des données de démonstration — ne fermez pas cette fenêtre."
              steps={resetFlow.steps}
              statuses={resetFlow.status}
              phase={resetFlow.phase}
              successMessage={resetFlow.successMessage}
              successDetail={resetFlow.successDetail}
              errorMessage={resetFlow.errorMessage}
              onRetry={() => runDemoFlow("reset")}
              onClose={closeConfirm}
              onDone={() => window.location.reload()}
            />
          )}
        </DialogContent>
      </Dialog>


      {/* ------------------------------------------------------------------
          Modale « Écraser & injecter » — mot clé : CONFIRMER.
          Après confirmation : purge pas-à-pas (étapes 1 à 3) puis injection
          du jeu de démonstration, le tout DANS la modale ouverte.
      ------------------------------------------------------------------- */}
      <Dialog
        open={confirmTarget === "inject"}
        onOpenChange={(open) => {
          // Fermeture impossible pendant l'exécution des étapes.
          if (!open && !activeRunning) closeConfirm();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!activeRunning}
          onEscapeKeyDown={(event) => {
            if (activeRunning) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (activeRunning) event.preventDefault();
          }}
        >
          {injectFlow.phase === "confirm" ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                runDemoFlow("inject");
              }}
            >
              <DialogHeader>
                <DialogTitle>Écraser les données existantes ?</DialogTitle>
                <DialogDescription>
                  Votre organisation contient déjà des données. Injecter le jeu
                  de démonstration les{" "}
                  <strong>remplacera définitivement</strong>. Tapez{" "}
                  <span className="font-mono font-semibold">
                    {OVERWRITE_CONFIRM_WORD}
                  </span>{" "}
                  pour confirmer l&apos;écrasement.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="demo-inject-confirmation">
                  Mot de confirmation
                </Label>
                <Input
                  id="demo-inject-confirmation"
                  name="confirmation"
                  value={confirmWord}
                  onChange={(event) => setConfirmWord(event.target.value)}
                  placeholder={OVERWRITE_CONFIRM_WORD}
                  autoFocus
                  className="font-mono uppercase"
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    Annuler
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={!confirmValid || pending}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <FlaskConicalIcon className="size-4" />
                  Écraser et injecter la démo
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <DemoProgressModal
              title="Réinitialisation & injection en cours..."
              description="Nettoyage séquentiel puis injection du jeu de démonstration — ne fermez pas cette fenêtre."
              steps={injectFlow.steps}
              statuses={injectFlow.status}
              phase={injectFlow.phase}
              successMessage={injectFlow.successMessage}
              successDetail={injectFlow.successDetail}
              errorMessage={injectFlow.errorMessage}
              onRetry={() => runDemoFlow("inject")}
              onClose={closeConfirm}
              onDone={() => window.location.reload()}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
