"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  BanknoteIcon,
  Loader2Icon,
  PlusIcon,
  WalletCardsIcon,
} from "lucide-react";

import {
  createPaymentAction,
  type PaymentFormState,
  type StudentOptionDTO,
} from "@/actions/payments";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
} from "@/lib/payment-status";

/** Statuts proposés à l'enregistrement d'un règlement. */
const STATUS_OPTIONS = [
  { value: "COMPLETED", label: "Payé" },
  { value: "PENDING", label: "En attente" },
] as const;

const INITIAL_FORM_STATE: PaymentFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function AddPaymentDialog({
  students,
}: {
  students: StudentOptionDTO[];
}) {
  const [open, setOpen] = React.useState(false);

  // Enveloppe l'action serveur pour fermer la modale dès que l'enregistrement réussit.
  const [state, formAction, pending] = useActionState(
    async (_prevState: PaymentFormState, formData: FormData) => {
      const result = await createPaymentAction(_prevState, formData);

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
          Nouveau paiement
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enregistrer un règlement</DialogTitle>
          <DialogDescription>
            Sélectionnez l’étudiant concerné et saisissez les détails du
            règlement (montant, moyen de paiement, référence de transaction).
          </DialogDescription>
        </DialogHeader>

        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-8 text-center">
            <WalletCardsIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Aucun étudiant disponible</p>
            <p className="text-sm text-muted-foreground">
              Ajoutez d’abord au moins un étudiant avant d’enregistrer un
              paiement.
            </p>
          </div>
        ) : (
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
              <Label htmlFor="studentId">Étudiant *</Label>
              <Select name="studentId">
                <SelectTrigger
                  id="studentId"
                  className="w-full"
                  aria-invalid={Boolean(fieldErrors.studentId)}
                >
                  <SelectValue placeholder="Sélectionner un étudiant" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.firstName} {student.lastName} (
                      {student.studentCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.studentId} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="amount">Montant (FCFA) *</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="any"
                  placeholder="Ex : 150000"
                  required
                  aria-invalid={Boolean(fieldErrors.amount)}
                />
                <FieldError message={fieldErrors.amount} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="paymentMethod">Moyen de paiement *</Label>
                <Select name="paymentMethod" defaultValue="CASH">
                  <SelectTrigger
                    id="paymentMethod"
                    className="w-full"
                    aria-invalid={Boolean(fieldErrors.paymentMethod)}
                  >
                    <SelectValue placeholder="Sélectionner un moyen" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_ORDER.map((method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.paymentMethod} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="status">Statut</Label>
                <Select name="status" defaultValue="COMPLETED">
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue placeholder="Sélectionner un statut" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.status} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="reference">Référence</Label>
                <Input
                  id="reference"
                  name="reference"
                  placeholder="Ex : TXN-MOMO-88231, n° de virement..."
                  maxLength={100}
                  aria-invalid={Boolean(fieldErrors.reference)}
                />
                <FieldError message={fieldErrors.reference} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                placeholder="Ex : Acompte frais d'inscription (optionnel)"
                maxLength={255}
                aria-invalid={Boolean(fieldErrors.description)}
              />
              <FieldError message={fieldErrors.description} />
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
                  <BanknoteIcon data-icon="inline-start" />
                )}
                {pending ? "Enregistrement..." : "Enregistrer le paiement"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}