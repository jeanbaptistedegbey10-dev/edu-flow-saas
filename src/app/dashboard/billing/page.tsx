import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BadgeCheckIcon,
  CalendarClockIcon,
  CreditCardIcon,
  KeyRoundIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  getRecentInvoices,
} from "@/actions/billing";
import { getOrganizationInfo } from "@/actions/organization";
import { LicenseActivationForm } from "@/components/dashboard/billing/license-form";
import {
  SubscriptionCheckout,
  type CheckoutPlan,
} from "@/components/dashboard/billing/subscription-checkout";
import { ReferralProgram } from "@/components/dashboard/billing/referral-program";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PLAN_STATUS_LABELS,
  PLAN_TYPE_LABELS,
  RESTRICTION_REASON_MESSAGES,
  getLicenseStateForCurrentUser,
  type LicenseRestrictionReason,
} from "@/lib/license-check";
import {
  formatXOF,
  getPaymentConfigWithDb,
  getPricingCatalogForOrganization,
  type PricingCatalogEntry,
} from "@/lib/payment";
import { getCurrentOrganizationId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Abonnement & licence | EduFlow",
  description:
    "Consultez l'état de votre abonnement SaaS ou de votre licence.",
};

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
  }).format(value);
}

function formatDateTime(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

/** Libellé robuste d'un type de plan (retombe sur la valeur brute). */
function planLabel(planType: string): string {
  return (PLAN_TYPE_LABELS as Record<string, string>)[planType] ?? planType;
}

/**
 * Masque une clé de licence pour un affichage lecture seule :
 * conserve le préfixe `EDU-` et les 4 derniers caractères, remplace le
 * reste par des `X` (ex : `EDU-XXXX-XXXX-1234`).
 */
function maskLicenseKey(key: string): string {
  const trimmed = key.trim().toUpperCase();
  if (trimmed.length <= 8) return trimmed;
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}-XXXX-XXXX-${suffix}`;
}

/** Libellé + style de badge de statut de facture. */
function invoiceStatusInfo(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "COMPLETED":
      return {
        label: "Payé",
        className:
          "inline-flex rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
      };
    case "PENDING":
      return {
        label: "En attente",
        className:
          "inline-flex rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
      };
    case "FAILED":
      return {
        label: "Échoué",
        className:
          "inline-flex rounded-full border border-red-200/60 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
      };
    default:
      return {
        label: status,
        className:
          "inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground",
      };
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; payment?: string }>;
}) {
  const params = await searchParams;
  const reasonRaw = params.reason;
  const reason: LicenseRestrictionReason | null =
    reasonRaw === "TRIAL_EXPIRED" ||
    reasonRaw === "LICENSE_EXPIRED" ||
    reasonRaw === "PLAN_INACTIVE"
      ? reasonRaw
      : null;

  // Retour d'une tentative de paiement : la confirmation du webhook est
  // asynchrone — l'abonnement est activé dès réception de la notification.
  const paymentPending = params.payment === "pending";

  const license = await getLicenseStateForCurrentUser();
  const organization = await getOrganizationInfo().catch(() => null);
  const invoices = await getRecentInvoices(10).catch(() => null);

  if (!license) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="rounded-xl border bg-background p-8 text-center text-muted-foreground shadow-sm">
          Session invalide — veuillez vous reconnecter.
        </div>
      </main>
    );
  }

  // Grille tarifaire DYNAMIQUE (modèle hybride Acquisition + Renouvellement) :
  // le statut du client — aucune facture COMPLETED = acquisition (prix
  // initial), sinon renouvellement (12 ou 6 mois) — détermine les prix
  // affichés. Le composant client ne reçoit que des chaînes déjà formatées.
  const gateway = await getPaymentConfigWithDb();
  const gatewayConfigured = Boolean(gateway.publicKey && gateway.secretKey && gateway.webhookSecret);
  const gatewayIsActive = gateway.provider === "fedapay" ? gateway.activeGateways.fedapay : gateway.activeGateways.kkiapay;

  const organizationId = await getCurrentOrganizationId();
  const catalog = await getPricingCatalogForOrganization(organizationId).catch(
    () => [] as PricingCatalogEntry[]
  );

  const isInitialClient = catalog[0]?.isInitial ?? true;

  const checkoutPlans: CheckoutPlan[] = catalog.map((entry) => ({
    planType: entry.planType,
    label: entry.label,
    tagline: entry.tagline,
    priceKindLabel: entry.isInitial ? "Tarif acquisition" : "Renouvellement",
    isCurrent: entry.isCurrent,
    options: entry.isInitial
      ? [
          {
            durationMonths: 12,
            name: "1ʳᵉ année — licence + logiciel",
            priceText: formatXOF(entry.initialPrice),
            periodLabel: "Couvre 12 mois",
            isPrimary: true,
          },
        ]
      : [
          {
            durationMonths: 12,
            name: "Renouvellement 12 mois",
            priceText: formatXOF(entry.renewalAnnualPrice),
            periodLabel: "Couvre 12 mois",
            isPrimary: true,
          },
          {
            durationMonths: 6,
            name: "Renouvellement 6 mois",
            priceText: formatXOF(entry.renewalHalfYearPrice),
            periodLabel: "Couvre 6 mois",
            isPrimary: false,
          },
        ],
  }));

  const warningMessage = reason ? RESTRICTION_REASON_MESSAGES[reason] : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Abonnement &amp; licence
          </h1>
          <p className="text-sm text-muted-foreground">
            {organization?.name ?? "Votre organisation"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <ArrowLeftIcon className="size-4" />
            Tableau de bord
          </Link>
        </Button>
      </div>

      {warningMessage ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Accès en écriture désactivé</p>
            <p className="mt-0.5">{warningMessage}</p>
          </div>
        </div>
      ) : null}

      {paymentPending ? (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900"
        >
          <BadgeCheckIcon className="mt-0.5 size-5 shrink-0 text-sky-600" />
          <div>
            <p className="font-semibold">Paiement en cours de confirmation</p>
            <p className="mt-0.5">
              Votre abonnement sera activé automatiquement à réception de la
              notification de la passerelle. Actualisez cette page dans
              quelques instants.
            </p>
          </div>
        </div>
      ) : null}

      <section className="mb-6 rounded-xl border bg-background p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BadgeCheckIcon className="size-5 text-emerald-600" />
          <h2 className="font-semibold tracking-tight">Plan actuel</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Type de plan
            </p>
            <p className="mt-1 text-lg font-semibold">
              {PLAN_TYPE_LABELS[license.planType]}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Statut
            </p>
            <p className="mt-1 text-lg font-semibold">
              {PLAN_STATUS_LABELS[license.planStatus]}
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
            <CalendarClockIcon className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fin de la période d&apos;essai
              </p>
              <p className="mt-1 font-medium">{formatDate(license.trialEndsAt)}</p>
              {license.trialDaysLeft !== null ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {license.trialDaysLeft} jour
                  {license.trialDaysLeft > 1 ? "s" : ""} restant
                  {license.trialDaysLeft > 1 ? "s" : ""}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
            <KeyRoundIcon className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Licence
              </p>
              <p className="mt-1 font-medium">
                {license.hasLicenseKey ? "Clé enregistrée" : "Aucune clé"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Expire le {formatDate(license.licenseEndsAt)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-xl border bg-background p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <CreditCardIcon className="size-5 text-sky-600" />
          <h2 className="font-semibold tracking-tight">
            Payer en ligne — Mobile Money / Carte
          </h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Souscrivez ou renouvelez votre abonnement sans contact humain.
          {license.canWrite
            ? " Votre licence est active : vous pouvez prolonger votre période à tout moment."
            : " Votre accès en écriture sera rétabli automatiquement dès la confirmation du paiement."}
        </p>
        <p className="mb-4 text-sm">
          <span className="font-medium">Statut client : </span>
          {isInitialClient ? (
            <>
              première souscription — le{" "}
              <span className="font-medium text-sky-700 dark:text-sky-400">
                tarif initial (1ʳᵉ année)
              </span>{" "}
              s&apos;applique automatiquement.
            </>
          ) : (
            <>
              client existant — les{" "}
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                tarifs de renouvellement
              </span>{" "}
              (12 ou 6 mois) s&apos;appliquent automatiquement.
            </>
          )}
        </p>
        <SubscriptionCheckout
          plans={checkoutPlans}
          providerLabel={gateway.provider === "fedapay" ? "FedaPay" : "KKiaPay"}
          sandbox={gateway.sandbox}
          configured={gatewayConfigured && gatewayIsActive}
        />
      </section>

      {invoices && invoices.length > 0 ? (
        <section className="mb-6 rounded-xl border bg-background p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ReceiptTextIcon className="size-5 text-muted-foreground" />
            <h2 className="font-semibold tracking-tight">
              Historique des paiements
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Moyen</TableHead>
                <TableHead>Référence</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const status = invoiceStatusInfo(invoice.status);

                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(invoice.paidAt ?? invoice.createdAt)}
                    </TableCell>
                    <TableCell>{planLabel(invoice.planType)}</TableCell>
                    <TableCell className="font-medium">
                      {formatXOF(invoice.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.paymentProvider ? (
                        <>
                          <span className="capitalize">
                            {invoice.paymentProvider}
                          </span>
                          {invoice.paymentMethod ? (
                            <>
                              {" "}·{" "}
                              <span className="capitalize">
                                {invoice.paymentMethod.replaceAll("_", " ")}
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {invoice.transactionReference ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className={status.className}>{status.label}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {license.hasLicenseKey && license.licenseKey ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheckIcon className="size-5 text-emerald-600" />
            <h2 className="font-semibold tracking-tight">Licence active</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Clé de licence
              </p>
              <p className="mt-1 font-mono text-sm font-semibold tracking-wide">
                {maskLicenseKey(license.licenseKey)}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Type d&apos;abonnement
              </p>
              <p className="mt-1 text-lg font-semibold">
                {PLAN_TYPE_LABELS[license.planType]}
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border bg-background p-4 sm:col-span-2">
              <CalendarClockIcon className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Expire le
                </p>
                <p className="mt-1 font-medium">
                  {license.licenseEndsAt
                    ? formatDate(license.licenseEndsAt)
                    : "Licence perpétuelle (aucune expiration)"}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border bg-background p-5 shadow-sm">
          <h2 className="font-semibold tracking-tight">Activer une licence</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vous avez reçu une clé de licence de la part de l&apos;équipe
            EduFlow ? Collez-la ci-dessous pour activer immédiatement votre
            abonnement — la vérification (signature et expiration) est
            effectuée localement, sans appel réseau.
          </p>
          <div className="mt-4 max-w-md">
            <LicenseActivationForm />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Si votre organisation est en lecture seule, les fonctionnalités de
            création et de modification sont désactivées tant que
            l&apos;abonnement n&apos;est pas renouvelé.
          </p>
        </section>
      )}

      {/* Programme de Parrainage */}
      <ReferralProgram />
    </main>
  );
}