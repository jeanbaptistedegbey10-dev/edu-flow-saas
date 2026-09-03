"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CoinsIcon,
  FileTextIcon,
  LandmarkIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShoppingCartIcon,
  WalletCardsIcon,
} from "lucide-react";

import type { CashFlowDTO } from "@/actions/analytics";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("fr-FR");

function formatAmount(amount: number): string {
  return `${numberFormatter.format(amount)} FCFA`;
}

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Style moderne des badges ponctuels. */
const TINTED_BADGE_CLASSES =
  "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400";

/**
 * Vue dédiée « Trésorerie & caisse » (/dashboard/tresorerie) :
 * - solde initial (configurable dans les paramètres de l'organisation) ;
 * - encaissements et dépenses du mois + totaux globaux ;
 * - solde total de caisse selon la formule
 *   « Solde initial + Encaissements − Dépenses ».
 */
export function TreasuryView({ cashFlow }: { cashFlow: CashFlowDTO }) {
  const cashBalanceValue = formatAmount(cashFlow.cashBalance);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <LandmarkIcon className="size-5 text-muted-foreground" />
            Trésorerie &amp; caisse
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue consolidée de la caisse du centre. Le solde total intègre le
            solde initial configuré dans les paramètres de l&apos;organisation.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/organization">
            <SettingsIcon data-icon="inline-start" />
            Paramétrer le solde initial
          </Link>
        </Button>
      </div>

      {/* Cartes de trésorerie */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Solde initial (départ)"
          value={formatAmount(cashFlow.initialCashBalance)}
          icon={<CoinsIcon />}
          iconClasses="bg-indigo-500/10 text-indigo-700 ring-1 ring-indigo-500/20 ring-inset dark:text-indigo-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              Configurable
            </span>
          }
          hint="Montant d'ouverture saisi à l'adoption du logiciel"
        />

        <KpiCard
          label="Total encaissé (mois)"
          value={formatAmount(cashFlow.collectedThisMonth)}
          icon={<WalletCardsIcon />}
          iconClasses="bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              Paiements + POS
            </span>
          }
          hint={`Total global encaissé : ${formatAmount(cashFlow.collectedTotal)}`}
        />

        <KpiCard
          label="Total dépenses (mois)"
          value={formatAmount(cashFlow.expensesThisMonth)}
          icon={<FileTextIcon />}
          iconClasses="bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 ring-inset dark:text-amber-400"
          badge={
            <span className={cn(BADGE_BASE_CLASSES, TINTED_BADGE_CLASSES)}>
              Dépenses du mois
            </span>
          }
          hint={`Total global dépensé : ${formatAmount(cashFlow.expensesTotal)}`}
        />

        <KpiCard
          label="Solde total caisse"
          value={cashBalanceValue}
          icon={<LandmarkIcon />}
          iconClasses="bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 ring-inset dark:text-violet-400"
          badge={
            <span
              className={cn(
                BADGE_BASE_CLASSES,
                cashFlow.cashBalance >= 0
                  ? TINTED_BADGE_CLASSES
                  : "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
              )}
            >
              {cashFlow.cashBalance >= 0 ? "Caisse positive" : "Déficit"}
            </span>
          }
          hint="Solde initial + encaissements − dépenses"
        />
      </div>

      {/* Explication de la formule + raccourcis */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm lg:col-span-2 dark:border-slate-800">
          <h3 className="text-sm font-semibold">Mode de calcul</h3>
          <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
            Solde total caisse = Solde initial (
            {formatAmount(cashFlow.initialCashBalance)}) + Total encaissé (
            {formatAmount(cashFlow.collectedTotal)}) − Total dépenses (
            {formatAmount(cashFlow.expensesTotal)}) ={" "}
            <strong className="text-foreground">
              {formatAmount(cashFlow.cashBalance)}
            </strong>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Les encaissements couvrent les règlements scolaires, les
            procédures de voyage et les ventes comptoir (POS) confirmés. Les
            paiements antérieurs hors système (avant l&apos;adoption) ne sont
            jamais comptabilisés dans la caisse.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
          <h3 className="text-sm font-semibold">Aller plus loin</h3>
          <div className="mt-3 grid gap-2">
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/dashboard/payments">
                <ReceiptTextIcon data-icon="inline-start" />
                Journal des paiements
                <ArrowRightIcon data-icon="inline-end" className="ml-auto" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/dashboard/expenses">
                <FileTextIcon data-icon="inline-start" />
                Dépenses du centre
                <ArrowRightIcon data-icon="inline-end" className="ml-auto" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/dashboard/pos">
                <ShoppingCartIcon data-icon="inline-start" />
                Caisse / POS
                <ArrowRightIcon data-icon="inline-end" className="ml-auto" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

