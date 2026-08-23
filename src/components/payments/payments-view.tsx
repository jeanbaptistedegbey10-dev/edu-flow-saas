"use client";

import * as React from "react";
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  DownloadIcon,
  HourglassIcon,
  PrinterIcon,
  SearchIcon,
  TrendingDownIcon,
  WalletCardsIcon,
} from "lucide-react";

import type {
  FinancialStatsDTO,
  OrganizationProfileDTO,
  PaymentDTO,
  StudentOptionDTO,
} from "@/actions/payments";
import { AddPaymentDialog } from "@/components/payments/add-payment-dialog";
import { PaymentReceiptDialog } from "@/components/payments/payment-receipt-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPaymentMethodLabel,
  getPaymentStatusBadgeClass,
  getPaymentStatusLabel,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_ORDER,
} from "@/lib/payment-status";
import { exportToCsv, type CsvColumn } from "@/lib/export";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function formatAmount(value: number): string {
  return `${amountFormatter.format(value)} FCFA`;
}

// Formatage « court » (jj/mm/aaaa) dédié aux fichiers CSV exportés.
const csvDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** Colonnes du fichier CSV d'export des règlements. */
const PAYMENT_CSV_COLUMNS: readonly CsvColumn<PaymentDTO>[] = [
  { header: "Référence", value: (payment) => payment.reference ?? "" },
  { header: "Code étudiant", value: (payment) => payment.student.studentCode },
  {
    header: "Étudiant",
    value: (payment) =>
      `${payment.student.firstName} ${payment.student.lastName}`,
  },
  { header: "Montant (FCFA)", value: (payment) => payment.amount },
  {
    header: "Moyen de paiement",
    value: (payment) => getPaymentMethodLabel(payment.paymentMethod),
  },
  {
    header: "Statut",
    value: (payment) => getPaymentStatusLabel(payment.status),
  },
  {
    header: "Date de paiement",
    value: (payment) => csvDateFormatter.format(payment.paidAt),
  },
  { header: "Description", value: (payment) => payment.description ?? "" },
];

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

type MethodFilter = "ALL" | (typeof PAYMENT_METHOD_ORDER)[number];
type StatusFilter = "ALL" | (typeof PAYMENT_STATUS_ORDER)[number];

const METHOD_FILTER_OPTIONS: readonly { value: MethodFilter; label: string }[] = [
  { value: "ALL", label: "Tous les moyens" },
  ...PAYMENT_METHOD_ORDER.map((method) => ({
    value: method as MethodFilter,
    label: PAYMENT_METHOD_LABELS[method],
  })),
];

const STATUS_FILTER_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Tous les statuts" },
  ...PAYMENT_STATUS_ORDER.map((status) => ({
    value: status as StatusFilter,
    label: PAYMENT_STATUS_LABELS[status],
  })),
];

// --------------------------------------
// Sous-composants internes
// --------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// --------------------------------------
// Vue principale
// --------------------------------------

export function PaymentsView({
  payments,
  stats,
  students,
  organization,
}: {
  payments: PaymentDTO[];
  stats: FinancialStatsDTO;
  students: StudentOptionDTO[];
  organization: OrganizationProfileDTO;
}) {
  const [search, setSearch] = React.useState("");
  const [methodFilter, setMethodFilter] = React.useState<MethodFilter>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [receiptPayment, setReceiptPayment] =
    React.useState<PaymentDTO | null>(null);

  /** Recherche instantanée par étudiant (nom, code) ou référence + filtres. */
  const filteredPayments = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return payments.filter((payment) => {
      if (methodFilter !== "ALL" && payment.paymentMethod !== methodFilter) {
        return false;
      }

      if (statusFilter !== "ALL" && payment.status !== statusFilter) {
        return false;
      }

      if (!query) return true;

      const fullName =
        `${payment.student.firstName} ${payment.student.lastName}`.toLowerCase();

      return (
        fullName.includes(query) ||
        payment.student.firstName.toLowerCase().includes(query) ||
        payment.student.lastName.toLowerCase().includes(query) ||
        payment.student.studentCode.toLowerCase().includes(query) ||
        (payment.reference?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [payments, search, methodFilter, statusFilter]);

  /**
   * Exporte les règlements actuellement filtrés à l'écran (recherche +
   * filtres moyen/statut actifs) vers un fichier CSV compatible Excel.
   */
  const handleExportCsv = () => {
    const today = csvDateFormatter.format(new Date()).replace(/\//g, "-");

    exportToCsv(`paiements-${today}`, filteredPayments, PAYMENT_CSV_COLUMNS);
  };

  const hasPayments = payments.length > 0;
  const hasResults = filteredPayments.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Paiements</h2>
          <p className="text-sm text-muted-foreground">
            Suivez les encaissements et les règlements en attente de vos
            étudiants.
          </p>
        </div>
        <AddPaymentDialog students={students} />
      </div>

      {/* Cartes d'indicateurs (KPI) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={BanknoteIcon}
          label="Total encaissé"
          value={formatAmount(stats.totalCollected)}
        />
        <StatCard
          icon={HourglassIcon}
          label="Montant en attente"
          value={formatAmount(stats.pendingAmount)}
        />
        <StatCard
          icon={ArrowLeftRightIcon}
          label="Transactions"
          value={amountFormatter.format(stats.transactionCount)}
        />
        <StatCard
          icon={TrendingDownIcon}
          label="Dépenses du mois"
          value={formatAmount(stats.monthlyExpenses)}
        />
      </div>

      {/* Carte : barre d'outils + tableau */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Recherche instantanée */}
          <div className="relative w-full lg:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par étudiant ou référence..."
              aria-label="Rechercher un paiement"
              className="pl-8"
            />
          </div>

          {/* Filtres : moyen de paiement + statut */}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={methodFilter}
              onValueChange={(value) => setMethodFilter(value as MethodFilter)}
            >
              <SelectTrigger
                size="sm"
                aria-label="Filtrer par moyen de paiement"
                className="w-full sm:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {METHOD_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger
                size="sm"
                aria-label="Filtrer par statut"
                className="w-full sm:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!hasResults}
            >
              <DownloadIcon data-icon="inline-start" />
              Exporter (CSV)
            </Button>

            {(methodFilter !== "ALL" || statusFilter !== "ALL") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMethodFilter("ALL");
                  setStatusFilter("ALL");
                }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        {hasPayments ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Étudiant</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Moyen de paiement</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {payment.student.firstName}{" "}
                          {payment.student.lastName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {payment.student.studentCode}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatAmount(payment.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getPaymentMethodLabel(payment.paymentMethod)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          BADGE_BASE_CLASSES,
                          getPaymentStatusBadgeClass(payment.status)
                        )}
                      >
                        {getPaymentStatusLabel(payment.status)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground">
                      {payment.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateFormatter.format(payment.paidAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Imprimer / Reçu PDF"
                        title="Imprimer / Reçu PDF"
                        onClick={() => setReceiptPayment(payment)}
                      >
                        <PrinterIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {!hasResults ? (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                <SearchIcon className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">Aucun résultat trouvé</p>
                <p className="text-sm text-muted-foreground">
                  Essayez un autre terme de recherche ou changez de filtres.
                </p>
              </div>
            ) : (
              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                {filteredPayments.length} paiement
                {filteredPayments.length > 1 ? "s" : ""} sur {payments.length}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <WalletCardsIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Aucun paiement pour le moment</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Enregistrez votre premier règlement avec le bouton « Nouveau
              paiement ».
            </p>
          </div>
        )}
      </div>

      {/* Modale d'aperçu + impression du reçu de paiement */}
      <PaymentReceiptDialog
        payment={receiptPayment}
        organization={organization}
        open={receiptPayment !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptPayment(null);
        }}
      />
    </div>
  );
}
