"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCardIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  XCircleIcon,
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
// L'action renvoie les paramètres de la collecte (clé publique, montant,
// référence, metadata) calculés côté serveur ; le composant ouvre ensuite le
// WIDGET MODAL / POP-UP INLINE FedaPay PAR-DESSUS la page courante, via
// `FedaPay.init({ public_key, environment: "live" })` puis `widget.open()`.
//
// Il n'y a PLUS de redirection d'URL : `checkout.fedapay.com` n'est jamais
// utilisé, l'utilisateur reste sur la page de facturation pendant tout le
// parcours. La fermeture du dialogue est notifiée par le callback
// `onComplete` du SDK, qui distingue le paiement confirmé
// (`FedaPay.CHECKOUT_COMPLETED`) de la fermeture / annulation
// (`FedaPay.DIALOG_DISMISSED`).
//
// Aucune clé secrète ne transite ici : seule la clé publique
// `NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY` est utilisée par le widget FedaPay. La
// validation finale (licence + organisation + facture) est réalisée côté
// serveur par le webhook signé `/api/webhooks/payment`.

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
// `FedaPay.init({ public_key, environment, transaction, onComplete })` renvoie
// un widget modal à ouvrir via `widget.open()` — il s'affiche PAR-DESSUS la
// page courante, sans navigation.
//
// L'option `environment` est fixée à « live » : la clé publique
// `NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY` désigne le compte FedaPay de production et
// les paiements sont réellement encaissés. Le SDK notifie la fermeture du
// dialogue via `onComplete({ reason, transaction })`, où `reason` vaut
// `FedaPay.CHECKOUT_COMPLETED` (paiement confirmé) ou
// `FedaPay.DIALOG_DISMISSED` (fermeture / annulation par l'utilisateur).

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

/**
 * Raisons de fermeture du dialogue FedaPay, telles que documentées par
 * l'SDK (https://docs.fedapay.com — Checkout.js, option `onComplete`).
 * Le callback reçoit `{ reason, transaction }`.
 */
const FedaPayDialogDismissed = "dialog_dismissed";

type FedaPayCompletion = {
  reason?: number | string;
  transaction?: Record<string, unknown> | null;
};

type FedaPayGlobal = {
  init: (options: Record<string, unknown>) => FedaPayCheckoutWidget;
  DIALOG_DISMISSED?: number | string;
  CHECKOUT_COMPLETED?: number | string;
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

/**
 * Paramètres du widget préparés par le serveur (`FedapayWidgetPayment`).
 *
 * Deux différences volontaires avec le type serveur, le composant étant le seul
 * point d'usage de l'intégration :
 * - aucun `callbackUrl` : le widget est modal, l'utilisateur ne quitte jamais
 *   la page — la fin du parcours est notifiée par `onComplete` ;
 * - `environment` y est toujours « live » (voir `openFedapayWidget`).
 */
type FedapayWidgetParams = {
  publicKey: string;
  amount: number;
  currency: "XOF";
  reference: string;
  description: string;
  environment: "live" | "sandbox";
  metadata: { organizationId: string; planType: string };
};

/**
 * Résultat de l'ouverture du widget : l'utilisateur a-t-il confirmé le
 * paiement ou a-t-il fermé / annulé la modale ?
 */
type FedapayWidgetOutcome =
  | { status: "completed" }
  | { status: "dismissed" };

/**
 * Ouvre le widget FedaPay EN MODALITÉ, par-dessus la page courante (aucune
 * redirection d'URL, aucun changement de page). Le SDK notifie la fermeture
 * via le callback `onComplete` : on distingue alors le paiement confirmé
 * (`CHECKOUT_COMPLETED`) d'une fermeture / annulation par l'utilisateur
 * (`DIALOG_DISMISSED`).
 *
 * La confirmation serveur fait toujours foi (webhook signé) : ce retour n'est
 * qu'un retour d'expérience immédiat côté interface.
 */
async function openFedapayWidget(
  widget: FedapayWidgetParams,
  onOutcome: (outcome: FedapayWidgetOutcome) => void
): Promise<void> {
  await loadFedapayScript();

  const win = window as unknown as { FedaPay?: FedaPayGlobal };

  if (typeof win.FedaPay?.init !== "function") {
    throw new Error("Widget de paiement FedaPay indisponible.");
  }

  const dismissedReason = win.FedaPay.DIALOG_DISMISSED ?? FedaPayDialogDismissed;

  const checkout = win.FedaPay.init({
    public_key: widget.publicKey,
    // Environnement « live » : transactions réelles via la clé publique
    // NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY.
    environment: "live",
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
    // Appelé par le SDK à la fermeture du dialogue (succès OU annulation).
    onComplete: (completion: FedaPayCompletion) => {
      const reason = completion?.reason;

      const dismissed =
        reason === dismissedReason || reason === FedaPayDialogDismissed;

      onOutcome(
        dismissed
          ? { status: "dismissed" }
          : { status: "completed" }
      );
    },
  });

  try {
    checkout.open();
  } catch (error) {
    // Si l'ouverture du dialogue échoue, on considère l'annulation, pour éviter
    // tout état « en attente » fantôme côté interface.
    onOutcome({ status: "dismissed" });
    throw error;
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
  // Message d'annulation : affiché si l'utilisateur ferme la modale FedaPay
  // ou clique sur « Annuler le paiement ». Distinct de `error` (rouge) pour
  // ne jamais laisser croire à un échec de débit ni à un paiement « en
  // attente ».
  const [cancelled, setCancelled] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function purchase(planType: CheckoutPlan["planType"], durationMonths: number) {
    setError(null);
    setCancelled(false);
    setPendingPlan(`${planType}:${durationMonths}`);

    startTransition(async () => {
      try {
        const result: InitiateSubscriptionActionResult =
          await initiateSubscriptionPaymentAction(planType, durationMonths);

        if (result.status === "error") {
          setError(result.message);
          return;
        }

        // Widget modal FedaPay : s'ouvre PAR-DESSUS la page courante, sans
        // redirection d'URL. Le SDK notifie la fermeture via `onComplete`.
        await openFedapayWidget(result.widget, (outcome) => {
          if (outcome.status === "dismissed") {
            // Fermeture / annulation par l'utilisateur : AUCUNE somme
            // débitée. On réinitialise l'état local — pas d'attente, pas de
            // « paiement en cours de réception ».
            setCancelled(true);
            setError(null);
            return;
          }

          // Paiement confirmé par l'utilisateur : la confirmation serveur
          // arrive par le webhook signé, qui active la licence.
          setCancelled(false);
          setError(null);
          router.refresh();
        });
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

      {cancelled ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground"
        >
          <XCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Paiement annulé.</span> Aucune
            somme n&apos;a été débitée.
          </span>
        </p>
      ) : null}

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