"use client";

import * as React from "react";
import { ReceiptTextIcon, SearchIcon, WalletIcon } from "lucide-react";

import {
  deleteExpenseAction,
  type ExpenseDTO,
  type StaffMemberDTO,
} from "@/actions/expenses";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { EditExpenseDialog } from "@/components/expenses/edit-expense-dialog";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { Input } from "@/components/ui/input";
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

const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  Loyer: "border border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400",
  Salaires: "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  "Électricité": "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  Internet: "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Fournitures: "border border-orange-200/60 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400",
  Marketing: "border border-pink-200/60 bg-pink-50 text-pink-700 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-400",
  Transport: "border border-teal-200/60 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-400",
  "Équipement": "border border-indigo-200/60 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400",
};

const DEFAULT_BADGE_CLASSES =
  "border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400";

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

function getCategoryBadgeClass(category: string): string {
  return CATEGORY_BADGE_CLASSES[category] ?? DEFAULT_BADGE_CLASSES;
}

function formatAmount(amount: number): string {
  return `${numberFormatter.format(amount)} FCFA`;
}

export function ExpensesView({
  expenses,
  members,
}: {
  expenses: ExpenseDTO[];
  /** Membres actifs de l'organisation (bénéficiaires potentiels de salaires). */
  members: StaffMemberDTO[];
}) {
  const [search, setSearch] = React.useState("");
  const [editingExpense, setEditingExpense] =
    React.useState<ExpenseDTO | null>(null);

  const filteredExpenses = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return expenses;

    return expenses.filter((expense) => {
      return (
        expense.title.toLowerCase().includes(query) ||
        expense.category.toLowerCase().includes(query) ||
        (expense.notes?.toLowerCase().includes(query) ?? false) ||
        (expense.recipient
          ? `${expense.recipient.firstName} ${expense.recipient.lastName}`
              .toLowerCase()
              .includes(query)
          : false) ||
        `${expense.createdBy.firstName} ${expense.createdBy.lastName}`
          .toLowerCase()
          .includes(query)
      );
    });
  }, [expenses, search]);

  const totalAmount = React.useMemo(
    () => expenses.reduce((sum, expense) => sum + expense.amount, 0),
    [expenses]
  );

  const hasExpenses = expenses.length > 0;
  const hasResults = filteredExpenses.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dépenses</h2>
          <p className="text-base text-muted-foreground">
            Suivez et gérez les dépenses de votre organisation.
          </p>
        </div>
        <AddExpenseDialog members={members} />
      </div>

      {/* Cartes de synthèse */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Total des dépenses
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight md:text-[1.75rem] md:leading-8">
                {formatAmount(totalAmount)}
              </p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 shadow-sm ring-1 ring-rose-500/20 ring-inset [&_svg]:size-5 dark:text-rose-400">
              <ReceiptTextIcon />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {expenses.length} dépense{expenses.length > 1 ? "s" : ""}{" "}
              enregistrée{expenses.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Dépense moyenne
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight md:text-[1.75rem] md:leading-8">
                {expenses.length > 0
                  ? formatAmount(totalAmount / expenses.length)
                  : "—"}
              </p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 shadow-sm ring-1 ring-sky-500/20 ring-inset [&_svg]:size-5 dark:text-sky-400">
              <WalletIcon />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-5 py-3">
            <span className="text-xs text-muted-foreground">
              Montant moyen par dépense
            </span>
          </div>
        </div>
      </div>

      {/* Carte : liste des dépenses */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par intitulé, catégorie, membre..."
              aria-label="Rechercher une dépense"
              className="pl-8"
            />
          </div>
        </div>

        {hasExpenses ? (
          hasResults ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Intitulé</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Bénéficiaire</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Enregistré par</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => (
                  <TableRow key={expense.id}>
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
                    <TableCell>
                      <span
                        className={`${BADGE_BASE_CLASSES} ${getCategoryBadgeClass(expense.category)}`}
                      >
                        {expense.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {expense.recipient
                        ? `${expense.recipient.firstName} ${expense.recipient.lastName}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatAmount(expense.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateFormatter.format(expense.expenseDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {expense.createdBy.firstName} {expense.createdBy.lastName}
                    </TableCell>
                    <TableCell className="text-right">
                      <EntityActionsMenu
                        entityName={`la dépense « ${expense.title} »`}
                        onEdit={() => setEditingExpense(expense)}
                        onDelete={() => deleteExpenseAction(expense.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
              <SearchIcon className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Aucun résultat trouvé</p>
              <p className="text-sm text-muted-foreground">
                Essayez un autre terme de recherche.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ReceiptTextIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Aucune dépense pour le moment</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Enregistrez votre première dépense avec le bouton « Nouvelle
              dépense » pour suivre vos charges.
            </p>
          </div>
        )}

        {hasExpenses && hasResults ? (
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            {filteredExpenses.length} dépense
            {filteredExpenses.length > 1 ? "s" : ""} sur {expenses.length}
          </div>
        ) : null}
      </div>

      {/* Modale d'édition pré-remplie */}
      <EditExpenseDialog
        expense={editingExpense}
        members={members}
        open={editingExpense !== null}
        onOpenChange={(open) => {
          if (!open) setEditingExpense(null);
        }}
      />
    </div>
  );
}