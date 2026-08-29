"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, ReceiptTextIcon } from "lucide-react";

import {
  updateExpenseAction,
  type ExpenseDTO,
  type ExpenseFormState,
  type StaffMemberDTO,
} from "@/actions/expenses";
import { EXPENSE_CATEGORIES, isSalaryCategory } from "@/lib/expense-categories";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_FORM_STATE: ExpenseFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/** Convertit une date UTC en valeur `YYYY-MM-DD` pour `<input type="date">`. */
function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function EditExpenseDialog({
  expense,
  members,
  open,
  onOpenChange,
}: {
  expense: ExpenseDTO | null;
  /** Membres actifs de l'organisation (bénéficiaires potentiels de salaires). */
  members: StaffMemberDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prevState: ExpenseFormState, formData: FormData) => {
      const result = await updateExpenseAction(_prevState, formData);

      if (result.status === "success") {
        onOpenChange(false);
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  // Catégorie suivie : pilote l'affichage du menu « Bénéficiaire », requis
  // uniquement pour les versements de salaire / rémunération.
  const [category, setCategory] = React.useState(expense?.category ?? "");

  // Réinitialise la catégorie suivie lorsque la dépense éditée change.
  React.useEffect(() => {
    setCategory(expense?.category ?? "");
  }, [expense]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier la dépense</DialogTitle>
          <DialogDescription>
            Mettez à jour les informations de la dépense sélectionnée.
          </DialogDescription>
        </DialogHeader>

        {expense ? (
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="id" value={expense.id} />

            {state.message && state.status === "error" && !state.fieldErrors ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.message}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="edit-title">Intitulé *</Label>
              <Input
                id="edit-title"
                name="title"
                defaultValue={expense.title}
                placeholder="Ex : Loyer du local"
                maxLength={150}
                required
                aria-invalid={Boolean(fieldErrors.title)}
              />
              <FieldError message={fieldErrors.title} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Catégorie *</Label>
                <Select
                  name="category"
                  defaultValue={expense.category}
                  onValueChange={setCategory}
                >
                  <SelectTrigger
                    id="edit-category"
                    className="w-full"
                    aria-invalid={Boolean(fieldErrors.category)}
                  >
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.category} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-expenseDate">Date *</Label>
                <Input
                  id="edit-expenseDate"
                  name="expenseDate"
                  type="date"
                  defaultValue={toDateInputValue(expense.expenseDate)}
                  required
                  aria-invalid={Boolean(fieldErrors.expenseDate)}
                />
                <FieldError message={fieldErrors.expenseDate} />
              </div>
            </div>

            {isSalaryCategory(category) ? (
              <div className="grid gap-2">
                <Label htmlFor="edit-recipientId">Membre bénéficiaire *</Label>
                <Select
                  name="recipientId"
                  defaultValue={expense.recipient?.id ?? undefined}
                >
                  <SelectTrigger
                    id="edit-recipientId"
                    className="w-full"
                    aria-invalid={Boolean(fieldErrors.recipientId)}
                  >
                    <SelectValue placeholder="Sélectionner le membre" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Le versement sera rattaché à ce membre dans son historique
                  des salaires.
                </p>
                <FieldError message={fieldErrors.recipientId} />
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="edit-amount">Montant (FCFA) *</Label>
              <Input
                id="edit-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={expense.amount}
                placeholder="Ex : 250000"
                required
                aria-invalid={Boolean(fieldErrors.amount)}
              />
              <FieldError message={fieldErrors.amount} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Input
                id="edit-notes"
                name="notes"
                defaultValue={expense.notes ?? ""}
                placeholder="Ex : Facture n° 2026-0081"
                maxLength={500}
                aria-invalid={Boolean(fieldErrors.notes)}
              />
              <FieldError message={fieldErrors.notes} />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2Icon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <ReceiptTextIcon data-icon="inline-start" />
                )}
                {pending ? "Enregistrement..." : "Enregistrer les modifications"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}