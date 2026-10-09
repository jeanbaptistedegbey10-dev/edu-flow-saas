"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheckIcon,
  BanknoteIcon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  TriangleAlertIcon,
  WalletCardsIcon,
  WalletIcon,
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
  PAYMENT_AMOUNT_EPSILON,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
} from "@/lib/payment-status";
import { cn } from "@/lib/utils";

/** Statuts proposés à l'enregistrement d'un règlement. */
const STATUS_OPTIONS = [
  { value: "COMPLETED", label: "Payé" },
  { value: "PENDING", label: "En attente" },
] as const;

const INITIAL_FORM_STATE: PaymentFormState = { status: "idle" };

// Formatage déterministe des montants (fr-FR, sans décimales) — mêmes règles
// que le module voyage pour des soldes affichés à l'identique.
const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function formatAmount(value: number): string {
  return `${amountFormatter.format(Math.round(value))} FCFA`;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Récapitulatif financier de l'étudiant sélectionné, calqué sur le bloc
 * « FinanceSummary » du dossier de voyage : Total dû → Déjà réglé → Reste à
 * payer. La ligne « Paiements antérieurs » n'apparaît que si un héritage hors
 * système est déduit, afin que l'égalité Total dû − Réglé − Hérité = Reste
 * demeure exacte.
 */
function StudentFinanceSummary({ student }: { student: StudentOptionDTO }) {
  const remaining = student.remainingAmount;
  const isFullyPaid = remaining !== null && remaining <= PAYMENT_AMOUNT_EPSILON;

  return (
    <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <WalletIcon className="size-3.5 text-primary" />
        Récapitulatif de scolarité
      </div>

      <dl className="grid gap-1 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Total dû</dt>
          <dd className="font-medium tabular-nums">
            {student.netAmount !== null ? formatAmount(student.netAmount) : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Déjà réglé</dt>
          <dd className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatAmount(student.paidAmount)}
          </dd>
        </div>
        {student.legacyCredit > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Paiements antérieurs</dt>
            <dd className="font-medium tabular-nums">
              {formatAmount(student.legacyCredit)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t pt-1">
          <dt
            className={cn(
              "font-semibold",
              isFullyPaid
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            Reste à payer
          </dt>
          <dd
            className={cn(
              "font-bold tabular-nums",
              isFullyPaid
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {remaining !== null ? formatAmount(remaining) : "—"}
          </dd>
        </div>
      </dl>

      {student.netAmount === null ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          Aucun coût de scolarité n’est défini pour cet étudiant : le montant
          n’est pas plafonné.
        </p>
      ) : null}
    </div>
  );
}

export function AddPaymentDialog({
  students,
}: {
  students: StudentOptionDTO[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // Étudiant sélectionné (piloté) : conditionne l'affichage du récap et le
  // plafonnement du montant saisi.
  const [selectedStudentId, setSelectedStudentId] = React.useState("");
  // Montant contrôlé pour valider en temps réel « montant ≤ reste à payer ».
  const [amount, setAmount] = React.useState("");

  // Enveloppe l'action serveur pour rafraîchir les soldes après un encaissement
  // réussi (re-validation de /dashboard/payments) et préparer une nouvelle saisie.
  const [state, formAction, pending] = useActionState(
    async (_prevState: PaymentFormState, formData: FormData) => {
      const result = await createPaymentAction(_prevState, formData);

      if (result.status === "success") {
        // Remise à zéro du montant : le récap se met à jour en direct via
        // `router.refresh()` (mise à jour dynamique des soldes après paiement).
        setAmount("");
        router.refresh();
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  const selectedStudent = React.useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  const remaining = selectedStudent?.remainingAmount ?? null;
  const isFullyPaid = remaining !== null && remaining <= PAYMENT_AMOUNT_EPSILON;

  const parsedAmount = Number(amount.replace(",", "."));
  const hasAmount = amount.trim() !== "" && Number.isFinite(parsedAmount);

  // Dépassement du solde restant — même tolérance flottante que le serveur.
  const amountExceedsRemaining =
    remaining !== null &&
    hasAmount &&
    parsedAmount > remaining + PAYMENT_AMOUNT_EPSILON;

  // Montant invalide : hors plafond OU non strictement positif.
  const isAmountInvalid =
    amountExceedsRemaining || (hasAmount && parsedAmount <= 0);

  // Soumission bloquée si : aucun étudiant, solde nul, ou montant hors plafond.
  const isSubmitBlocked =
    !selectedStudentId || isFullyPaid || isAmountInvalid;

  // Réinitialise l'état local à la fermeture pour une prochaine saisie propre.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelectedStudentId("");
      setAmount("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nouveau paiement
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enregistrer un règlement</DialogTitle>
          <DialogDescription>
            Sélectionnez l’étudiant concerné puis saisissez les détails du
            règlement. Le montant est plafonné au solde restant de sa scolarité.
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
            {state.message && state.status === "error" ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.message}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="studentId">Étudiant *</Label>
              <Select
                name="studentId"
                value={selectedStudentId}
                onValueChange={(value) => {
                  setSelectedStudentId(value);
                  setAmount("");
                }}
              >
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

            {/* Récapitulatif financier — affiché dès qu'un étudiant est choisi. */}
            {selectedStudent ? (
              <StudentFinanceSummary student={selectedStudent} />
            ) : null}

            {/* Scolarité entièrement réglée : aucune saisie possible. */}
            {isFullyPaid ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-md border border-emerald-200/60 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
              >
                <BadgeCheckIcon className="mt-0.5 size-4 shrink-0" />
                Cette scolarité est entièrement réglée : il ne reste aucun
                montant à encaisser.
              </p>
            ) : null}

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
                  max={
                    !isFullyPaid && remaining !== null
                      ? Math.round(remaining)
                      : undefined
                  }
                  placeholder={
                    remaining !== null && !isFullyPaid
                      ? `Max ${formatAmount(remaining)}`
                      : "Ex : 150000"
                  }
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={isFullyPaid}
                  required
                  aria-invalid={Boolean(fieldErrors.amount) || isAmountInvalid}
                />
                {amountExceedsRemaining ? (
                  <p
                    role="alert"
                    className="flex items-start gap-1.5 text-xs font-medium text-destructive"
                  >
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                    Le montant dépasse le reste à payer (
                    {formatAmount(remaining ?? 0)}).
                  </p>
                ) : null}
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
                <Label htmlFor="paidAt">Date du règlement</Label>
                <Input
                  id="paidAt"
                  name="paidAt"
                  type="date"
                  aria-invalid={Boolean(fieldErrors.paidAt)}
                />
                <FieldError message={fieldErrors.paidAt} />
                <p className="text-xs text-muted-foreground">
                  Par défaut : aujourd'hui. Activez « Paiement hors système »
                  pour saisir une date passée.
                </p>
              </div>
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

            {/* Paiement hors système / Antérieur */}
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <div className="mt-0.5 flex h-5 min-w-[20px] items-center justify-center">
                <input
                  type="checkbox"
                  id="isOutOfSystem"
                  name="isOutOfSystem"
                  className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="isOutOfSystem" className="font-medium">
                  Paiement hors système / Antérieur
                </Label>
                <p className="text-xs text-muted-foreground">
                  Saisie un règlement antérieur ou externe : met à jour le
                  solde débiteur de l'étudiant sans impacter le fond de caisse
                  physique du jour.
                </p>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending || isSubmitBlocked}>
                {pending ? (
                  <Loader2Icon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
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