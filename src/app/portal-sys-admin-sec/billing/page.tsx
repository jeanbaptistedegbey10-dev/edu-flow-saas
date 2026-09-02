import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  BanknoteIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  Clock3Icon,
  ReceiptTextIcon,
  type LucideIcon,
} from "lucide-react";

import {
  listInvoicesForSuperAdmin,
  type SuperAdminInvoiceStats,
} from "@/actions/super-admin";
import { getSuperAdminContext } from "@/lib/super-admin";
import { PLAN_TYPE_LABELS } from "@/lib/plan-labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Factures & Paiements SaaS | Back-office EduFlow",
  description:
    "Revenus SaaS, paiements et factures de toutes les organisations de la plateforme.",
  robots: { index: false, follow: false },
};

function formatDateTime(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function formatXOF(amount: number): string {
  return (
    new Intl.NumberFormat("fr-FR", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(amount) + " FCFA"
  );
}

/** Libellé robuste d'un type de plan (retombe sur la valeur brute). */
function planLabel(planType: string): string {
  return (PLAN_TYPE_LABELS as Record<string, string>)[planType] ?? planType;
}

function invoiceStatusInfo(status: string): { label: string; className: string } {
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
          "inline-flex rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400",
      };
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted/50">
        <Icon className={`size-5 ${tone}`} />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

/**
 * Vue « Factures & Paiements SaaS » du back-office : revenus agrégés des
 * abonnements et liste transversale des factures de toutes les organisations.
 */
export default async function SuperAdminBillingPage() {
  // Défense en profondeur : le layout redirige déjà, on revalide ici.
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const { invoices, stats } = await listInvoicesForSuperAdmin();

  const statCards: {
    label: string;
    value: string | number;
    icon: LucideIcon;
    tone: string;
  }[] = [
    {
      label: "Revenu SaaS (XOF)",
      value: formatXOF(stats.revenueXOF),
      icon: BanknoteIcon,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Paiements reçus",
      value: stats.completed,
      icon: CheckCircle2Icon,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "En attente",
      value: stats.pending,
      icon: Clock3Icon,
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Échoués",
      value: stats.failed,
      icon: CircleAlertIcon,
      tone: "text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Factures &amp; Paiements SaaS
          </h1>
          <p className="text-sm text-muted-foreground">
            Abonnements en ligne (KKiapay / Fedapay) de toutes les
            organisations de la plateforme.
          </p>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
          <ReceiptTextIcon className="size-5" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="rounded-xl border bg-background shadow-sm">
        <div className="border-b p-4">
          <h2 className="font-semibold tracking-tight">
            Historique des paiements
          </h2>
          <p className="text-sm text-muted-foreground">
            {invoices.length} facture{invoices.length > 1 ? "s" : ""}
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Moyen de paiement</TableHead>
              <TableHead>Référence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  Aucune facture SaaS enregistrée pour le moment.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => {
                const status = invoiceStatusInfo(invoice.status);

                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(invoice.paidAt ?? invoice.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {invoice.organizationName}
                    </TableCell>
                    <TableCell>{planLabel(invoice.planType)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatXOF(invoice.amount)}
                    </TableCell>
                    <TableCell>
                      <span className={status.className}>{status.label}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {invoice.paymentProvider ? (
                        <>
                          <span className="capitalize">
                            {invoice.paymentProvider}
                          </span>
                          {invoice.paymentMethod ? (
                            <>
                              {" "}
                              ·{" "}
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
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}