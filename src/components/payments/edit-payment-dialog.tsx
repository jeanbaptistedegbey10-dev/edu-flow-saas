"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";

import {
  updatePaymentAction,
  type PaymentDTO,
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
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_ORDER,
} from "@/lib/payment-status";

const INITIAL_FORM_STATE: PaymentFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'édition isolé par entité (`key={payment.id}` côté parent)
 * afin de réinitialiser l'état du formulaire à chaque ouverture.
 */
function EditPaymentForm({
  payment,
  students,
  onSuccess,
}: {
  payment: PaymentDTO;
  students: StudentOptionDTO[];
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prevState: PaymentFormState, formData: FormData) => {
      const result = await updatePaymentAction(_prevState, formData);

      if (result.status === "success") {
        onSuccess();
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifier le règlement</DialogTitle>
        <DialogDescription>
          Mettez à jour les détails du paiement de {payment.student.firstName}{" "}
          {payment.student.lastName}.
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="id" value={payment.id} />

        {state.message && state.status === "error" && !state.fieldErrors ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="edit-studentId">Étudiant *</Label>
          <Select name="studentId" defaultValue={payment.student.id}>
            <SelectTrigger
              id="edit-studentId"
              className="w-full"
              aria-invalid={Boolean(fieldErrors.studentId)}
            >
              <SelectValue placeholder="Sélectionner un étudiant" />
            </SelectTrigger>
            <SelectContent>
              {students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.firstName} {student.lastName} ({student.studentCode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={fieldErrors.studentId} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-amount">Montant (FCFA) *</Label>
            <Input
              id="edit-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              defaultValue={payment.amount}
              required
              aria-invalid={Boolean(fieldErrors.amount)}
            />
            <FieldError message={fieldErrors.amount} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-paymentMethod">Moyen de paiement *</Label>
            <Select
              name="paymentMethod"
              defaultValue={payment.paymentMethod}
            >
              <SelectTrigger
                id="edit-paymentMethod"
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
            <Label htmlFor="edit-status">Statut</Label>
            <Select name="status" defaultValue={payment.status}>
              <SelectTrigger id="edit-status" className="w-full">
                <SelectValue placeholder="Sélectionner un statut" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {PAYMENT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.status} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-paidAt">Date du règlement</Label>
            <Input
              id="edit-paidAt"
              name="paidAt"
              type="date"
              defaultValue={payment.paidAt.toISOString().split("T")[0]}
              aria-invalid={Boolean(fieldErrors.paidAt)}
            />
            <FieldError message={fieldErrors.paidAt} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-reference">Référence</Label>
          <Input
            id="edit-reference"
            name="reference"
            defaultValue={payment.reference ?? ""}
            maxLength={100}
            aria-invalid={Boolean(fieldErrors.reference)}
          />
          <FieldError message={fieldErrors.reference} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-description">Description</Label>
          <Input
            id="edit-description"
            name="description"
            defaultValue={payment.description ?? ""}
            maxLength={255}
            aria-invalid={Boolean(fieldErrors.description)}
          />
          <FieldError message={fieldErrors.description} />
        </div>

        {/* Règlement hors système / antérieur */}
        <div className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            id="edit-isOutOfSystem"
            name="isOutOfSystem"
            defaultChecked={payment.isOutOfSystem}
            className="mt-0.5 size-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <div className="grid gap-1">
            <Label htmlFor="edit-isOutOfSystem" className="font-medium">
              Paiement hors système / Antérieur
            </Label>
            <p className="text-xs text-muted-foreground">
              Règlement saisi après coup ou encaissé hors système : il met à jour
              le solde débiteur de l&apos;étudiant, sans impacter le fond de
              caisse physique du jour.
            </p>
          </div>
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
              <SaveIcon data-icon="inline-start" />
            )}
            {pending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * Modale d'édition pré-remplie d'un règlement.
 * Contrôlée par la vue parente (`open` + `onOpenChange`).
 */
export function EditPaymentDialog({
  payment,
  students,
  open,
  onOpenChange,
}: {
  payment: PaymentDTO | null;
  students: StudentOptionDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {payment ? (
          <EditPaymentForm
            key={payment.id}
            payment={payment}
            students={students}
            onSuccess={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}