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

/** Offre commerciale pré-formatée par la page serveur (aucun import serveur ici). */
export type CheckoutPlan = {
  planType: "SAAS_MONTHLY" | "SAAS_YEARLY";
  label: string;
  priceText: string;
  periodLabel: string;
  tagline: string;
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

  function purchase(planType: CheckoutPlan["planType"]) {
    setError(null);
    setPendingPlan(planType);

    startTransition(async () => {
      try {
        const result: InitiateSubscriptionActionResult =
          await initiateSubscriptionPaymentAction(planType);

        if (result.status === "error") {
          setError(result.message);
          return;
        }

        if (result.status === "success") {
          // Fedapay : page de checkout de l'agrégateur.
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
        <p className="mb-4 text-sm text-muted-foreground">
          Passerelle : {providerLabel}
          {sandbox ? " · Mode test (sandbox)" : ""}. Paiement sécurisé par
          Mobile Money (Orange Money, MTN MoMo, Moov Money, Wave…) ou carte
          bancaire.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const loading = pendingPlan === plan.planType;

          return (
            <div
              key={plan.planType}
              className="flex flex-col rounded-xl border bg-muted/20 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{plan.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {plan.tagline}
                  </p>
                </div>
                <p className="text-right">
                  <span className="text-xl font-semibold tracking-tight">
                    {plan.priceText}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {plan.periodLabel}
                  </span>
                </p>
              </div>

              <Button
                type="button"
                size="lg"
                className="mt-4 w-full"
                disabled={!configured || isPending || loading}
                onClick={() => purchase(plan.planType)}
              >
                {loading ? (
                  <>
                    <LoaderCircleIcon className="size-4 animate-spin" />
                    Préparation du paiement…
                  </>
                ) : (
                  <>
                    {provider === "kkiapay" ? (
                      <SmartphoneIcon className="size-4" />
                    ) : (
                      <CreditCardIcon className="size-4" />
                    )}
                    Payer avec Mobile Money / Carte
                  </>
                )}
              </Button>
            </div>
          );
        })}
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