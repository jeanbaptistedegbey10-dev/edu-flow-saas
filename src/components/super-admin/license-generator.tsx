"use client";

import * as React from "react";
import {
  Building2Icon,
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  UserRoundIcon,
} from "lucide-react";

import {
  generateStandaloneLicenseAction,
  type GenerateLicenseFormState,
  type LicenseTargetOrganization,
  type SuperAdminPlanPricingRow,
} from "@/actions/super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LICENSE_PLAN_TYPES,
  PLAN_TYPE_LABELS,
  type LicensePlanType,
} from "@/lib/plan-labels";
import {
  formatXOF,
  getPricingPlanForLicensePlan,
  PRICING_PLAN_LABELS,
} from "@/lib/plan-pricing";

const INITIAL_STATE: GenerateLicenseFormState = { status: "idle" };

/** Options de plan proposées (ordre stable de LICENSE_PLAN_TYPES). */
const PLAN_OPTIONS: { value: LicensePlanType; label: string }[] =
  LICENSE_PLAN_TYPES.map((planType) => ({
    value: planType,
    label: PLAN_TYPE_LABELS[planType],
  }));

/** Durées en mois proposées (0 = sans échéance / perpétuelle). */
const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 mois" },
  { value: 3, label: "3 mois" },
  { value: 6, label: "6 mois" },
  { value: 12, label: "12 mois" },
  { value: 24, label: "24 mois" },
  { value: 36, label: "36 mois" },
  { value: 0, label: "Sans échéance (perpétuelle)" },
];

type ExpiryMode = "duration" | "date" | "perpetual";

/**
 * Générateur de licences Ed25519 du back-office Super-Admin.
 *
 * 1. Cible : organisation existante (attribution immédiate en base) OU
 *    nom / ID de client saisi librement (clé à transmettre hors-ligne) ;
 * 2. Plan : SAAS_MONTHLY, SAAS_HALF_YEAR, SAAS_YEARLY, SELF_HOSTED, OFFLINE ou
 *    DESKTOP_LIFETIME (perpétuelle) ;
 * 3. Expiration : durée en mois, date explicite, ou sans échéance ;
 * 4. Tarif théorique : la grille tarifaire dynamique (PlanPricing) est
 *    consultée en continu pour afficher le prix de référence — acquisition
 *    (prix initial) ou renouvellement (12 / 6 mois) — utile lors de la
 *    facturation hors-ligne du client ;
 * 5. La clé `EDU-XXXX-XXXX-…` est signée via une Server Action réutilisant
 *    `generateLicenseKey()` et s'affiche avec un bouton « Copier ».
 */
export function LicenseGenerator({
  organizations,
  pricingRows,
}: {
  organizations: LicenseTargetOrganization[];
  pricingRows: SuperAdminPlanPricingRow[];
}) {
  const [state, formAction, isPending] = React.useActionState(
    generateStandaloneLicenseAction,
    INITIAL_STATE
  );

  const [targetMode, setTargetMode] = React.useState<"existing" | "manual">(
    "existing"
  );
  const [organizationId, setOrganizationId] = React.useState("");
  const [clientRef, setClientRef] = React.useState("");
  const [planType, setPlanType] =
    React.useState<LicensePlanType>("SAAS_YEARLY");
  const [expiryMode, setExpiryMode] = React.useState<ExpiryMode>("duration");
  const [durationMonths, setDurationMonths] = React.useState(12);
  const [expiresAt, setExpiresAt] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [session, setSession] = React.useState(0);

  const isDesktopLifetime = planType === "DESKTOP_LIFETIME";

  // ------------------------------------
  // Tarif théorique (référence de facturation hors-ligne)
  // ------------------------------------
  //
  // La formule tarifaire est déduite du plan de licence sélectionné, puis le
  // prix affiché suit le modèle hybride : prix INITIAL pour un nouveau client
  // (saisie manuelle) ou une organisation sans aucune facture COMPLETED,
  // tarif de RENOUVELLEMENT (12 / 6 mois) pour un client déjà facturé.

  const selectedOrganization = organizations.find(
    (organization) => organization.id === organizationId
  );

  const pricingPlanType = getPricingPlanForLicensePlan(planType);
  const pricingRow = pricingRows.find(
    (candidate) => candidate.planType === pricingPlanType
  );

  const isInitialPurchase =
    targetMode === "manual" || !selectedOrganization?.hasCompletedInvoice;

  const referencePrice: { amount: number; kindLabel: string } | null = (() => {
    if (!pricingRow) {
      return null;
    }

    if (expiryMode === "perpetual") {
      return {
        amount: pricingRow.initialPrice,
        kindLabel: "Licence perpétuelle — prix initial de référence",
      };
    }

    if (isInitialPurchase) {
      return {
        amount: pricingRow.initialPrice,
        kindLabel: "Prix initial — 1ʳᵉ année (licence + logiciel)",
      };
    }

    if (expiryMode === "duration" && durationMonths === 12) {
      return {
        amount: pricingRow.renewalAnnualPrice,
        kindLabel: "Renouvellement 12 mois",
      };
    }

    if (expiryMode === "duration" && durationMonths === 6) {
      return {
        amount: pricingRow.renewalHalfYearPrice,
        kindLabel: "Renouvellement 6 mois",
      };
    }

    // Durée personnalisée (1 / 3 / 24 / 36 mois ou date) : hors grille.
    return null;
  })();

  function handlePlanChange(value: string) {
    const next = value as LicensePlanType;
    setPlanType(next);

    // Le plan « Desktop hors-ligne — à vie » est TOUJOURS perpétuel.
    if (next === "DESKTOP_LIFETIME") {
      setExpiryMode("perpetual");
    } else if (isDesktopLifetime) {
      setExpiryMode("duration");
    }
  }

  function resetForm() {
    setTargetMode("existing");
    setOrganizationId("");
    setClientRef("");
    setPlanType("SAAS_YEARLY");
    setExpiryMode("duration");
    setDurationMonths(12);
    setExpiresAt("");
    setCopied(false);
    // Remonte le formulaire : useActionState repart sur `idle`.
    setSession((current) => current + 1);
  }

  async function handleCopy() {
    if (!state.licenseKey) return;

    try {
      await navigator.clipboard.writeText(state.licenseKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : la clé reste sélectionnable à la main.
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-xl border bg-background p-6 shadow-sm">
        {state.status === "success" && state.licenseKey ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <p className="font-semibold">Licence générée avec succès</p>
              <p className="mt-1">{state.message}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Clé de licence
              </Label>
              <div className="mt-1 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
                  {state.licenseKey}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                  {copied ? "Copiée" : "Copier"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Transmettez cette clé à l&apos;administrateur concerné :
                l&apos;activation s&apos;effectue dans « Abonnement &amp;
                licence » (SaaS) ou lors du premier lancement du desktop
                hors-ligne. La clé privée de signature ne quitte jamais le
                serveur.
              </p>
            </div>

            <Button type="button" variant="outline" onClick={resetForm}>
              <KeyRoundIcon className="size-4" />
              Générer une autre clé
            </Button>
          </div>
        ) : (
          /* ---------- Formulaire de génération ---------- */
          <form key={session} action={formAction} className="grid gap-5">

            <div className="grid gap-1.5">
              <Label>Attribuer la licence à</Label>
              <Tabs
                value={targetMode}
                onValueChange={(value) =>
                  setTargetMode(value as "existing" | "manual")
                }
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="existing">
                    <Building2Icon />
                    Organisation existante
                  </TabsTrigger>
                  <TabsTrigger value="manual">
                    <UserRoundIcon />
                    Nouveau client
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="existing" className="pt-3">
                  <Select
                    name="organizationId"
                    value={organizationId}
                    onValueChange={setOrganizationId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une organisation" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name} ({org.planType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="manual" className="grid gap-1.5 pt-3">
                  <Input
                    name="clientRef"
                    value={clientRef}
                    onChange={(event) => setClientRef(event.target.value)}
                    placeholder="Nom / ID du client (ex : École Excellence — EC-2026-01)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Le nom / ID saisi est embarqué dans la clé signée (aucune
                    écriture en base). Idéal pour les clients desktop
                    hors-ligne.
                  </p>
                </TabsContent>
              </Tabs>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="license-plan">Type de plan</Label>
              <Select
                name="planType"
                value={planType}
                onValueChange={handlePlanChange}
              >
                <SelectTrigger id="license-plan">
                  <SelectValue placeholder="Choisir un plan" />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isDesktopLifetime ? (
                <p className="text-xs text-muted-foreground">
                  Licence desktop hors-ligne définitive (clé signée à
                  expiration perpétuelle).
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="license-expiry">Expiration</Label>
              <Select
                name="expiryMode"
                value={expiryMode}
                onValueChange={(value) => setExpiryMode(value as ExpiryMode)}
                disabled={isDesktopLifetime}
              >
                <SelectTrigger id="license-expiry">
                  <SelectValue placeholder="Choisir le mode d'expiration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="duration">Durée (mois)</SelectItem>
                  <SelectItem value="date">Date d&apos;expiration</SelectItem>
                  <SelectItem value="perpetual">
                    Sans échéance (perpétuelle)
                  </SelectItem>
                </SelectContent>
              </Select>

              {isDesktopLifetime ? (
                <p className="text-xs text-muted-foreground">
                  Le plan « Desktop — à vie » est automatiquement perpétuel.
                </p>
              ) : expiryMode === "duration" ? (
                <Select
                  name="durationMonths"
                  value={String(durationMonths)}
                  onValueChange={(value) => setDurationMonths(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une durée" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={String(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : expiryMode === "date" ? (
                <div className="grid gap-1.5">
                  <Input
                    type="date"
                    name="expiresAt"
                    value={expiresAt}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    La licence expire à la fin de la date saisie.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Licence sans échéance (expiration signée à ~100 ans).
                </p>
              )}
            </div>

            {/* Tarif théorique : référence pour la facturation hors-ligne. */}
            <div className="rounded-lg border border-violet-200/70 bg-violet-50/50 p-3 dark:border-violet-500/20 dark:bg-violet-500/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
                    Tarif théorique — {PRICING_PLAN_LABELS[pricingPlanType]}
                  </p>
                  {referencePrice ? (
                    <p className="mt-1 text-lg font-semibold tracking-tight">
                      {formatXOF(referencePrice.amount)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {referencePrice.kindLabel}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Durée personnalisée : hors grille — référez-vous aux
                      tarifs de référence ci-dessous.
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-violet-200/60 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                  {isInitialPurchase ? "Acquisition" : "Client existant"}
                </span>
              </div>

              {pricingRow ? (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md border bg-background p-2">
                    <p className="text-xs text-muted-foreground">Initial</p>
                    <p className="text-sm font-semibold">
                      {formatXOF(pricingRow.initialPrice)}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background p-2">
                    <p className="text-xs text-muted-foreground">12 mois</p>
                    <p className="text-sm font-semibold">
                      {formatXOF(pricingRow.renewalAnnualPrice)}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background p-2">
                    <p className="text-xs text-muted-foreground">6 mois</p>
                    <p className="text-sm font-semibold">
                      {formatXOF(pricingRow.renewalHalfYearPrice)}
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="mt-2 text-xs text-muted-foreground">
                Grille éditable dans « 💰 Tarifs &amp; Offres » — à facturer
                hors-ligne au client (la licence générée ici ne déclenche
                aucune facture en ligne).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="license-max-students">
                  Étudiants max.{" "}
                  <span className="font-normal text-muted-foreground">
                    (optionnel)
                  </span>
                </Label>
                <Input
                  id="license-max-students"
                  name="maxStudents"
                  type="number"
                  min={1}
                  placeholder="Illimité"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="license-max-users">
                  Utilisateurs max.{" "}
                  <span className="font-normal text-muted-foreground">
                    (optionnel)
                  </span>
                </Label>
                <Input
                  id="license-max-users"
                  name="maxUsers"
                  type="number"
                  min={1}
                  placeholder="Illimité"
                />
              </div>
            </div>

            {state.status === "error" && state.message ? (
              <p
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
              >
                {state.message}
              </p>
            ) : null}

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Clé signée Ed25519 côté serveur ({PLAN_OPTIONS.length} types de
                plan disponibles).
              </p>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <KeyRoundIcon className="size-4" />
                )}
                Générer la clé
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Panneau latéral : rappels de sécurité */}
      <aside className="rounded-xl border bg-muted/30 p-5">
        <h3 className="text-sm font-semibold">Signé &amp; vérifiable</h3>
        <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
            <span>
              La clé est signée avec la paire Ed25519 de la plateforme
              (LICENSE_PRIVATE_KEY) : elle n&apos;est jamais falsifiable.
            </span>
          </li>
          <li className="flex gap-2">
            <UserRoundIcon className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
            <span>
              En mode « Organisation existante », le plan et la clé sont
              enregistrés et activés immédiatement.
            </span>
          </li>
          <li className="flex gap-2">
            <CopyIcon className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
            <span>
              En mode « Nouveau client », copiez la clé et transmettez-la hors
              du back-office (desktop / self-hosted).
            </span>
          </li>
        </ul>
      </aside>
    </div>
  );
}

