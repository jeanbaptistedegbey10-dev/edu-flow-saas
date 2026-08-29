"use client";

import * as React from "react";
import { BanknoteIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";

import { getMemberSalaryHistory, type ExpenseDTO } from "@/actions/expenses";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation. Les dates de dépense sont stockées à minuit UTC.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("fr-FR");

function formatAmount(amount: number): string {
  return `${numberFormatter.format(amount)} FCFA`;
}

/** Membre dont on consulte l'historique des versements. */
export type SalaryHistoryMember = {
  id: string;
  firstName: string;
  lastName: string;
};

/**
 * Volet « Historique des versements / Salaires » d'un membre : liste toutes
 * les dépenses de catégorie « Salaires » dont il est le bénéficiaire, avec
 * le total cumulé. Les données sont chargées à l'ouverture du volet.
 */
export function MemberSalaryHistoryDialog({
  member,
  open,
  onOpenChange,
}: {
  member: SalaryHistoryMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [expenses, setExpenses] = React.useState<ExpenseDTO[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Chargement à l'ouverture du volet (annulable si fermeture rapide).
  React.useEffect(() => {
    if (!open || !member) {
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setExpenses([]);

    getMemberSalaryHistory(member.id)
      .then((result) => {
        if (!cancelled) setExpenses(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Impossible de charger l'historique des versements. Réessayez."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, member]);

  const totalAmount = React.useMemo(
    () => expenses.reduce((sum, expense) => sum + expense.amount, 0),
    [expenses]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Historique des versements — {member?.firstName} {member?.lastName}
          </DialogTitle>
          <DialogDescription>
            Salaires et rémunérations versés à ce membre et enregistrés comme
            dépenses de catégorie « Salaires ».
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Chargement de l&apos;historique…
            </p>
          </div>
        ) : error ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <TriangleAlertIcon className="size-4 shrink-0" />
            {error}
          </p>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <BanknoteIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Aucun versement enregistré</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Les salaires versés à ce membre apparaîtront ici dès qu&apos;une
              dépense de catégorie « Salaires » lui sera rattachée.
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Intitulé</TableHead>
                  <TableHead>Enregistré par</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {dateFormatter.format(expense.expenseDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-xs flex-col gap-0.5">
                        <span className="font-medium">{expense.title}</span>
                        {expense.notes ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {expense.notes}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {expense.createdBy.firstName} {expense.createdBy.lastName}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatAmount(expense.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {expenses.length} versement{expenses.length > 1 ? "s" : ""} au
                total
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatAmount(totalAmount)}
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}