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
// - Fedapay : redirection vers la page de checkout de l'agrégateur ;
// - Kkiapay : ouverture du widget officiel (cdn.kkiapay.me/k.js) côté navigateur.
//
// Aucune clé secrète ne transite ici : seule la clé publique est utilisée par
// le widget Kkiapay. La validation finale (licence + organisation + facture)
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
  provider: "fedapay" | "kkiapay";
  providerLabel: string;
  sandbox: boolean;
  configured: boolean;
};

// --------------------------------------
// Widget Kkiapay (chargement + ouverture)
// --------------------------------------

let kkiapayScriptPromise: Promise<void> | null = null;

function loadKkiapayWidgetScript(): Promise<void> {
  if (kkiapayScriptPromise) return kkiapayScriptPromise;

  kkiapayScriptPromise = new Promise<void>((resolve, reject) => {
    const win = window as unknown as { openKkiapayWidget?: unknown };

    if (typeof win.openKkiapayWidget === "function") {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.kkiapay.me/k.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      kkiapayScriptPromise = null;
      reject(new Error("Impossible de charger le widget de paiement Kkiapay."));
    };
    document.body.appendChild(script);
  });

  return kkiapayScriptPromise;
}

type KkiapayWidgetParams = {
  publicKey: string;
  amount: number;
  currency: "XOF";
  reference: string;
  sandbox: boolean;
  callbackUrl: string;
  metadata: { organizationId: string; planType: string };
};

/** Ouvre le widget Kkiapay puis redirige vers la page de retour. */
async function openKkiapayWidget(widget: KkiapayWidgetParams): Promise<void> {
  await loadKkiapayWidgetScript();

  const win = window as unknown as {
    openKkiapayWidget?: (opts: Record<string, unknown>) => Promise<unknown>;
  };

  if (typeof win.openKkiapayWidget !== "function") {
    throw new Error("Widget de paiement Kkiapay indisponible.");
  }

  try {
    await win.openKkiapayWidget({
      amount: widget.amount,
      key: widget.publicKey,
      sandbox: widget.sandbox,
      reference: widget.reference,
      position: "center",
      metadata: widget.metadata,
      callback_url: widget.callbackUrl,
    });
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
  provider,
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
          // Fedapay : le serveur a transmis l'URL de guichet (token généré
          // par POST /v1/transactions/{id}/token ou champ `url` renvoyé par
          // FedaPay) — redirection du navigateur vers cette URL.
          if (!result.checkoutUrl) {
            setError(
              "La passerelle de paiement n'a pas retourné d'URL de paiement. Réessayez dans quelques instants."
            );
            return;
          }

          window.location.assign(result.checkoutUrl);
          return;
        }

        if (result.status === "kkiapay_widget") {
          await openKkiapayWidget(result.widget);
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
          ) : null}
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
                          ) : provider === "kkiapay" ? (
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