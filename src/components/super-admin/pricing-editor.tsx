"use client";

import * as React from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";

import {
  updatePlanPricingAction,
  type SuperAdminPlanPricingRow,
  type UpdatePlanPricingFormState,
} from "@/actions/super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: UpdatePlanPricingFormState = { status: "idle" };

const SUCCESS_ALERT_CLASS =
  "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";

const ERROR_ALERT_CLASS =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400";

/**
 * Éditeur de la grille tarifaire dynamique (table `PlanPricing`) :
 * une carte par formule commerciale avec ses trois montants du modèle
 * hybride — acquisition (prix initial 1ʳᵉ année) et renouvellement
 * (12 mois / 6 mois). Chaque carte possède son propre formulaire et sa
 * propre Server Action `updatePlanPricingAction` (sauvegarde partielle).
 */
export function PricingEditor({ rows }: { rows: SuperAdminPlanPricingRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {rows.map((row) => (
        <PricingPlanCard key={row.planType} row={row} />
      ))}
    </div>
  );
}

function PricingPlanCard({ row }: { row: SuperAdminPlanPricingRow }) {
  const [state, formAction, isPending] = React.useActionState(
    updatePlanPricingAction,
    INITIAL_STATE
  );

  // Un message n'est affiché que sur la carte qui vient d'être enregistrée.
  const isCurrent = state.planType === row.planType;

  const updatedAtLabel = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(row.updatedAt));

  const priceFields: { name: string; label: string; hint: string; value: number }[] =
    [
      {
        name: "initialPrice",
        label: "Prix initial — 1ʳᵉ année",
        hint: "Licence + logiciel, appliqué tant que le client n'a aucune facture réglée.",
        value: row.initialPrice,
      },
      {
        name: "renewalAnnualPrice",
        label: "Renouvellement 12 mois",
        hint: "Appliqué automatiquement dès la première facture réglée (checkout + hors-ligne).",
        value: row.renewalAnnualPrice,
      },
      {
        name: "renewalHalfYearPrice",
        label: "Renouvellement 6 mois",
        hint: "Option semestrielle proposée au checkout en renouvellement.",
        value: row.renewalHalfYearPrice,
      },
    ];

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border bg-background p-5 shadow-sm"
    >
      <input type="hidden" name="planType" value={row.planType} />

      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold tracking-tight">{row.label}</h3>
          <span className="rounded-full border border-violet-200/60 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
            {row.currency}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Dernière modification : {updatedAtLabel}
        </p>
      </div>

      <div className="grid gap-3">
        {priceFields.map((field) => (
          <div key={field.name} className="grid gap-1.5">
            <Label htmlFor={`${row.planType}-${field.name}`}>
              {field.label}
            </Label>
            <Input
              id={`${row.planType}-${field.name}`}
              name={field.name}
              type="number"
              min={0}
              step={500}
              inputMode="numeric"
              defaultValue={String(field.value)}
              required
            />
            <p className="text-xs text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </div>

      {isCurrent && state.status === "success" && state.message ? (
        <p role="status" className={SUCCESS_ALERT_CLASS}>
          {state.message}
        </p>
      ) : null}

      {isCurrent && state.status === "error" && state.message ? (
        <p role="alert" className={ERROR_ALERT_CLASS}>
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="mt-auto">
        {isPending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <SaveIcon className="size-4" />
        )}
        Enregistrer
      </Button>
    </form>
  );
}
