"use client";

import { useState, useTransition } from "react";
import {
  CreditCardIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react";

import {
  initiateSubscriptionPaymentAction,
  type InitiateSubscriptionActionResult,
} from "@/actions/billing";
import { Button } from "@/components/ui/button";

// --------------------------------------
// Paiement Mobile Money / Carte (Phase 3)
// --------------------------------------
//
// Composant client : affiche les offres SaaS (mensuel / annuel en XOF) et
// déclenche le paiement via la Server Action `initiateSubscriptionPaymentAction`.
// - Mode Live : le serveur crée la transaction FedaPay et renvoie l'URL de
//   guichet → redirection du navigateur vers `checkout.fedapay.com` ;
// - Mode démo : le widget officiel FedaPay (cdn.fedapay.com/fedapay.js) est
//   ouvert côté navigateur avec `environment: "sandbox"`.
//
// Aucune clé secrète ne transite ici : seule la clé publique est utilisée par
// le widget FedaPay. La validation finale (licence + organisation + facture)
// est réalisée côté serveur par le webhook signé `/api/webhooks/payment`.

/** Option de prix pré-formatée par la page serveur (aucun import serveur ici). */
export type CheckoutPlanOption = {
  /** Durée facturable : 12 mois ou 6 mois. */
  durationMonths: number;
  /** Libellé de l'option (ex : « 1ʳᵉ année — licence + logiciel »). */
  name: string;
  /** Prix applicable au statut du client, pré-formaté (XOF). */
  priceText: string;
  /** Période couverte (ex : « 12 mois »). */
  periodLabel: string;
  /** Option mise en avant (durée standard de la formule). */
  isPrimary: boolean;
};

/** Formule commerciale pré-formatée par la page serveur (aucun import serveur ici). */
export type CheckoutPlan = {
  planType: "SAAS_CLOUD" | "SELF_HOSTED" | "DESKTOP_OFFLINE";
  label: string;
  tagline: string;
  /** « Tarif acquisition » ou « Tarif renouvellement » (statut du client). */
  priceKindLabel: string;
  /** Options facturables : 12 mois (toujours) + 6 mois (renouvellement). */
  options: CheckoutPlanOption[];
  /**
   * `true` si cette formule est celle actuellement souscrite par
   * l'organisation — la carte est alors désactivée (bouton grisé « Offre actuelle »).
   */
  isCurrent: boolean;
};

type Props = {
  plans: CheckoutPlan[];
  /** Libellé commercial de la passerelle (« FedaPay »). */
  providerLabel: string;
  /** `true` en mode démonstration (bac à sable FedaPay). */
  sandbox: boolean;
  configured: boolean;
};

// --------------------------------------
// Widget FedaPay (chargement + ouverture)
// --------------------------------------
//
// SDK officiel : https://cdn.fedapay.com/fedapay.js (global `FedaPay`).
// `FedaPay.init({ public_key, environment })` renvoie un widget à ouvrir via
// `widget.open()`.
//
// Le même script sert aux deux environnements : c'est l'option `environment`
// (« live » ou « sandbox ») passée à `FedaPay.init` qui sélectionne
// l'hôte FedaPay ciblé. Elle est décidée côté SERVEUR par
// `getFedapayWidgetEnvironment()` (donc par `PAYMENT_PROVIDER_MODE`) et
// reçue dans `widget.environment` : le client ne peut pas la contourner.

/**
 * Script officiel du widget FedaPay.
 *
 * Constante redéclarée ici (et non importée de `@/lib/payment`) : ce module
 * manipule la clé SECRÈTE et `node:crypto`, il est donc strictement serveur
 * et ne doit jamais entrer dans le bundle client.
 */
const FEDAPAY_SCRIPT_URL = "https://cdn.fedapay.com/fedapay.js";

type FedaPayCheckoutWidget = {
  open: () => void;
};

type FedaPayGlobal = {
  init: (options: Record<string, unknown>) => FedaPayCheckoutWidget;
};

let fedapayScriptPromise: Promise<void> | null = null;

function loadFedapayScript(): Promise<void> {
  if (fedapayScriptPromise) return fedapayScriptPromise;

  fedapayScriptPromise = new Promise<void>((resolve, reject) => {
    const win = window as unknown as { FedaPay?: FedaPayGlobal };

    if (typeof win.FedaPay?.init === "function") {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = FEDAPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      fedapayScriptPromise = null;
      reject(new Error("Impossible de charger le widget de paiement FedaPay."));
    };
    document.body.appendChild(script);
  });

  return fedapayScriptPromise;
}

/** Paramètres du widget préparés par le serveur. */
type FedapayWidgetParams = {
  publicKey: string;
  amount: number;
  currency: "XOF";
  reference: string;
  description: string;
  environment: "live" | "sandbox";
  callbackUrl: string;
  metadata: { organizationId: string; planType: string };
};

/** Ouvre le widget FedaPay puis redirige vers la page de retour. */
async function openFedapayWidget(widget: FedapayWidgetParams): Promise<void> {
  await loadFedapayScript();

  const win = window as unknown as { FedaPay?: FedaPayGlobal };

  if (typeof win.FedaPay?.init !== "function") {
    throw new Error("Widget de paiement FedaPay indisponible.");
  }

  const checkout = win.FedaPay.init({
    public_key: widget.publicKey,
    // « live » → transactions réelles ; « sandbox » → démonstration.
    environment: widget.environment,
    locale: "fr",
    transaction: {
      amount: widget.amount,
      currency: { iso: widget.currency },
      description: widget.description,
      custom_metadata: {
        ...widget.metadata,
        reference: widget.reference,
      },
    },
  });

  try {
    checkout.open();
  } finally {
    // En fin de parcours (succès, annulation ou erreur), le webhook signé fera
    // foi ; on ramène l'utilisateur sur la page de facturation.
    window.location.href = widget.callbackUrl;
  }
}

// --------------------------------------
// Composant de paiement
// --------------------------------------

export function SubscriptionCheckout({
  plans,
  providerLabel,
  sandbox,
  configured,
}: Props) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function purchase(planType: CheckoutPlan["planType"], durationMonths: number) {
    setError(null);
    setPendingPlan(`${planType}:${durationMonths}`);

    startTransition(async () => {
      try {
        const result: InitiateSubscriptionActionResult =
          await initiateSubscriptionPaymentAction(planType, durationMonths);

        if (result.status === "error") {
          setError(result.message);
          return;
        }

        if (result.status === "success") {
          // Mode Live : le serveur a transmis l'URL de guichet FedaPay (token
          // généré par POST /v1/transactions/{id}/token ou champ `url` renvoyé
          // par FedaPay) — redirection du navigateur vers cette URL.
          if (!result.checkoutUrl) {
            setError(
              "La passerelle de paiement n'a pas retourné d'URL de paiement. Réessayez dans quelques instants."
            );
            return;
          }

          window.location.assign(result.checkoutUrl);
          return;
        }

        if (result.status === "fedapay_widget") {
          await openFedapayWidget(result.widget);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Une erreur est survenue lors du démarrage du paiement."
        );
      } finally {
        setPendingPlan(null);
      }
    });
  }

  return (
    <div>
      {!configured ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Le paiement en ligne n&apos;est pas encore disponible sur cette
          instance — contactez l&apos;équipe EduFlow pour activer votre
          abonnement.
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            Passerelle : {providerLabel}. Paiement sécurisé par Mobile Money
            (Orange Money, MTN MoMo, Moov Money, Wave…) ou carte bancaire.
          </p>
          {sandbox ? (
            <p
              role="note"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
            >
              Mode démo (sandbox) — aucune transaction réelle n&apos;est
              débitée, vous pouvez tester l&apos;ouverture du widget de
              paiement.
            </p>
          ) : (
            <p
              role="note"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
            >
              Mode Live — les paiements sont réellement débités via{" "}
              {providerLabel}.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.planType}
            className={
              plan.isCurrent
                ? "flex flex-col rounded-xl border border-emerald-300 bg-emerald-50/30 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/5"
                : "flex flex-col rounded-xl border bg-muted/20 p-5"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{plan.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {plan.tagline}
                </p>
              </div>
              {plan.isCurrent ? (
                <span className="shrink-0 rounded-full border border-emerald-200/60 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                  Offre actuelle
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-sky-200/60 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400">
                  {plan.priceKindLabel}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-1 flex-col gap-2">
              {plan.options.map((option) => {
                const loading =
                  pendingPlan === `${plan.planType}:${option.durationMonths}`;

                return (
                  <div
                    key={option.durationMonths}
                    className={
                      option.isPrimary
                        ? "flex items-center justify-between gap-3 rounded-lg border border-sky-300 bg-background p-3 dark:border-sky-500/40"
                        : "flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{option.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {option.periodLabel}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-lg font-semibold tracking-tight">
                        {option.priceText}
                      </p>
                      {plan.isCurrent ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled
                          className="opacity-50 cursor-not-allowed"
                        >
                          <ShieldCheckIcon className="size-4" />
                          Actif
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={!configured || isPending || loading}
                          onClick={() =>
                            purchase(plan.planType, option.durationMonths)
                          }
                        >
                          {loading ? (
                            <LoaderCircleIcon className="size-4 animate-spin" />
                          ) : sandbox ? (
                            <SmartphoneIcon className="size-4" />
                          ) : (
                            <CreditCardIcon className="size-4" />
                          )}
                          Payer
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span className="font-semibold">Paiement interrompu :</span>
          {error}
        </p>
      ) : null}

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
        Après confirmation du paiement par la passerelle, votre licence est
        générée et activée automatiquement (généralement en moins d&apos;une
        minute).
      </p>
    </div>
  );
}