import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BadgeCheckIcon,
  CalendarClockIcon,
  KeyRoundIcon,
} from "lucide-react";

import { getOrganizationInfo } from "@/actions/organization";
import { Button } from "@/components/ui/button";
import {
  PLAN_STATUS_LABELS,
  PLAN_TYPE_LABELS,
  RESTRICTION_REASON_MESSAGES,
  getLicenseStateForCurrentUser,
  type LicenseRestrictionReason,
} from "@/lib/license-check";

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

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const reasonRaw = params.reason;
  const reason: LicenseRestrictionReason | null =
    reasonRaw === "TRIAL_EXPIRED" ||
    reasonRaw === "LICENSE_EXPIRED" ||
    reasonRaw === "PLAN_INACTIVE"
      ? reasonRaw
      : null;

  const license = await getLicenseStateForCurrentUser();
  const organization = await getOrganizationInfo().catch(() => null);

  if (!license) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-xl border bg-background p-8 text-center text-muted-foreground shadow-sm">
          Session invalide — veuillez vous reconnecter.
        </div>
      </main>
    );
  }

  const warningMessage = reason
    ? RESTRICTION_REASON_MESSAGES[reason]
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
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
              <p className="mt-1 font-medium">
                {formatDate(license.trialEndsAt)}
              </p>
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

      <section className="rounded-xl border bg-background p-5 shadow-sm">
        <h2 className="font-semibold tracking-tight">Prolonger votre accès</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pour passer de l&apos;essai gratuit à un abonnement SaaS ou à une
          licence, contactez notre équipe commerciale.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Votre organisation est actuellement en lecture seule : les
          fonctionnalités de création et de modification sont désactivées tant
          que l&apos;abonnement n&apos;est pas renouvelé.
        </p>
      </section>
    </main>
  );
}
