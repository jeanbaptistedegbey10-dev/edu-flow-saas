"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, PlusIcon, ReceiptTextIcon } from "lucide-react";

import {
  createExpenseAction,
  type ExpenseFormState,
} from "@/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
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
  DialogTrigger,
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

export function AddExpenseDialog() {
  const [open, setOpen] = React.useState(false);

  // Enveloppe l'action serveur pour fermer la modale dès que la création réussit.
  const [state, formAction, pending] = useActionState(
    async (_prevState: ExpenseFormState, formData: FormData) => {
      const result = await createExpenseAction(_prevState, formData);

      if (result.status === "success") {
        setOpen(false);
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nouvelle dépense
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enregistrer une dépense</DialogTitle>
          <DialogDescription>
            Saisissez les informations de la dépense engagée par votre
            organisation.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {state.message && state.status === "error" && !state.fieldErrors ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="title">Intitulé *</Label>
            <Input
              id="title"
              name="title"
              placeholder="Ex : Loyer du local"
              maxLength={150}
              required
              aria-invalid={Boolean(fieldErrors.title)}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="category">Catégorie *</Label>
              <Select name="category">
                <SelectTrigger
                  id="category"
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
              <Label htmlFor="expenseDate">Date *</Label>
              <Input
                id="expenseDate"
                name="expenseDate"
                type="date"
                required
                aria-invalid={Boolean(fieldErrors.expenseDate)}
              />
              <FieldError message={fieldErrors.expenseDate} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">Montant (FCFA) *</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Ex : 250000"
              required
              aria-invalid={Boolean(fieldErrors.amount)}
            />
            <FieldError message={fieldErrors.amount} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              name="notes"
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
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ReceiptTextIcon data-icon="inline-start" />
              )}
              {pending ? "Enregistrement..." : "Enregistrer la dépense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}