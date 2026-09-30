"use client";

import * as React from "react";
import { HistoryIcon, PrinterIcon } from "lucide-react";

import type { StudentDetailDTO } from "@/actions/students";
import type { StudentFinancialSummaryDTO } from "@/lib/student-finance";
import type { OrganizationProfileDTO } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { printHtmlDocument } from "@/lib/receipt";
import { buildStudentStatementDocument } from "@/lib/student-statement";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function formatAmount(amount: number): string {
  return `${amountFormatter.format(Math.round(amount))} FCFA`;
}

function formatDate(date: Date): string {
  return dateFormatter.format(new Date(date));
}

/** Libellés + badges des types de transactions du relevé financier. */
const TRANSACTION_TYPE_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  TUITION: {
    label: "Scolarité",
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  BOOK: {
    label: "Livre",
    className: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  SERVICE: {
    label: "Service",
    className:
      "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  },
  OTHER: {
    label: "Autre",
    className:
      "bg-slate-50 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400",
  },
};

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/**
 * Onglet « Historique Financier » du relevé global étudiant (vue 360°) :
 * tableau chronologique de TOUS les mouvements monétaires de l'élève —
 * règlements de scolarité (table `Payment`) ET achats en caisse
 * (table `StudentTransaction` : livres, services, frais annexes) — avec
 * option d'impression du « Relevé Général de Compte Élève » (format PDF A4
 * propre pour les parents).
 */
export function StudentTransactionsTab({
  student,
  summary,
  organization,
}: {
  student: StudentDetailDTO;
  summary: StudentFinancialSummaryDTO;
  organization: OrganizationProfileDTO;
}) {
  /** Fusion chronologique (desc) scolarité + caisse. */
  const rows = React.useMemo(() => {
    const tuitionRows = student.payments
      .filter((payment) => !payment.isVoided)
      .map((payment) => ({
        key: `payment:${payment.id}`,
        date: payment.paidAt,
        type: "TUITION",
        description:
          payment.description ??
          `Règlement scolarité ${payment.reference ?? ""}`.trim(),
        amount: payment.amount,
        paymentMode: payment.paymentMethod,
      }));

    const posRows = (student.studentTransactions ?? []).map((tx) => ({
      key: `tx:${tx.id}`,
      date: tx.createdAt,
      type: tx.type,
      description: tx.description,
      amount: tx.amount,
      paymentMode: tx.paymentMode,
    }));

    return [...tuitionRows, ...posRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [student.payments, student.studentTransactions]);


  const handlePrint = () => {
    printHtmlDocument(
      buildStudentStatementDocument(student, summary, organization)
    );
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">
            Relevé général de compte élève
          </h3>
          <p className="text-xs text-muted-foreground">
            Tous les paiements : scolarité, livres, services et frais annexes.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handlePrint}
          disabled={rows.length === 0}
        >
          <PrinterIcon data-icon="inline-start" />
          Imprimer le relevé
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <HistoryIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Aucun mouvement enregistré</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Les règlements de scolarité et les achats en caisse (livres,
            services) de cet étudiant apparaîtront ici.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Désignation</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Mode de paiement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const badge =
                TRANSACTION_TYPE_BADGES[row.type] ??
                TRANSACTION_TYPE_BADGES.OTHER;
              return (
                <TableRow key={row.key}>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatDate(new Date(row.date))}
                  </TableCell>
                  <TableCell>
                    <span className={`${BADGE_BASE_CLASSES} ${badge.className}`}>
                      {badge.label}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">
                    {row.description}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatAmount(row.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.paymentMode}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
