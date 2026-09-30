"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClockIcon,
  ArrowLeftIcon,
  BadgeCheckIcon,
  CheckIcon,
  FileTextIcon,
  Loader2Icon,
  MapPinIcon,
  PrinterIcon,
  Trash2Icon,
  Undo2Icon,
  UserRoundXIcon,
  WalletIcon,
} from "lucide-react";

import type { OrganizationProfileDTO } from "@/actions/payments";
import type { DocumentDTO } from "@/actions/documents";
import {
  addTravelInstallmentAction,
  deleteTravelInstallmentAction,
  setTravelCurrentStageAction,
  unverifyStepAction,
  updateTravelDeadlineAction,
  type TravelPaymentDTO,
  type TravelProcedureDetailDTO,
} from "@/actions/travels";
import { DocumentsTab } from "@/components/documents/documents-tab";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildTravelInstallmentReceiptDocument,
  printHtmlDocument,
} from "@/lib/receipt";
import { getPaymentMethodLabel } from "@/lib/payment-status";
import { cn } from "@/lib/utils";

/** Date du jour au format « YYYY-MM-DD » (UTC) — borne maximale des sélecteurs. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Formatage déterministe (locale + fuseau fixes).
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const PAYMENT_METHOD_OPTIONS = [
  "CASH",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CREDIT_CARD",
  "CHECK",
] as const;

/** Convertit une Date en valeur « YYYY-MM-DD » pour un input date. */
function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// --------------------------------------
// Sous-composants
// --------------------------------------

/** Barre de progression animée (identique à la vue liste). */
function ProgressBar({ percent }: { percent: number }) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progression : ${percent} %`}
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-700 ease-out"
        style={{ width: `${mounted ? percent : 0}%` }}
      />
    </div>
  );
}

/**
 * Stepper vertical des étapes du workflow :
 * Vert = Validé · Indigo = En cours · Slate = À venir.
 * L'étape en cours expose la validation et la saisie d'échéance.
 */
function StageTimeline({
  detail,
  onStageResult,
}: {
  detail: TravelProcedureDetailDTO;
  onStageResult: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pendingOrder, setPendingOrder] = React.useState<number | null>(null);
  const [pendingUnverifyOrder, setPendingUnverifyOrder] = React.useState<
    number | null
  >(null);
  const [isSavingDeadline, setIsSavingDeadline] = React.useState(false);
  const deadlineInputRef = React.useRef<HTMLInputElement>(null);

  const totalStages = detail.stages.length;
  const percent =
    totalStages > 0
      ? Math.min(
          100,
          Math.round((Math.min(detail.currentStageOrder, totalStages) / totalStages) * 100)
        )
      : 0;

  const handleValidate = async (stageOrder: number) => {
    setPendingOrder(stageOrder);
    try {
      const result = await setTravelCurrentStageAction(detail.id, stageOrder);
      onStageResult(result.ok ? null : result.message);
      if (result.ok) router.refresh();
    } finally {
      setPendingOrder(null);
    }
  };

  /**
   * Annule la validation d'une étape déjà validée : l'étape visée redevient
   * « En cours » (IN_PROGRESS) et les suivantes « À venir » (PENDING).
   */
  const handleUnverify = async (stageOrder: number) => {
    setPendingUnverifyOrder(stageOrder);
    try {
      const result = await unverifyStepAction({
        procedureId: detail.id,
        stepOrder: stageOrder,
      });
      onStageResult(result.ok ? null : result.message);
      if (result.ok) router.refresh();
    } finally {
      setPendingUnverifyOrder(null);
    }
  };

  const handleSaveDeadline = async () => {
    const value = deadlineInputRef.current?.value ?? "";
    if (!value) return;
    setIsSavingDeadline(true);
    try {
      const result = await updateTravelDeadlineAction(detail.id, value);
      onStageResult(result.ok ? null : result.message);
      if (result.ok) router.refresh();
    } finally {
      setIsSavingDeadline(false);
    }
  };

  if (totalStages === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Aucun modèle de procédure associé à ce dossier — le suivi par étapes
        n’est pas disponible.
      </p>
    );
  }

  return (
    <section aria-label="Étapes de la procédure" className="flex flex-col gap-4">
      {/* Progression globale */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Progression de la procédure
          </span>
          <span className="font-bold tabular-nums">
            {percent}%
            <span className="ml-1 font-normal text-muted-foreground">
              ({Math.min(detail.currentStageOrder, totalStages)}/{totalStages}{" "}
              étapes validées)
            </span>
          </span>
        </div>
        <ProgressBar percent={percent} />
      </div>

      {/* Jalons verticaux */}
      <ol className="flex flex-col">
        {detail.stages.map((stage, index) => {
          const isValidated = index < detail.currentStageOrder;
          const isCurrent = index === detail.currentStageOrder;
          const isUpcoming = index > detail.currentStageOrder;

          return (
            <li key={stage.id} className="flex gap-3">
              {/* Colonne jalon */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    isValidated && "border-emerald-500 bg-emerald-500 text-white",
                    isCurrent &&
                      "border-indigo-500 bg-indigo-500 text-white ring-4 ring-indigo-500/20",
                    isUpcoming &&
                      "border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500"
                  )}
                >
                  {isValidated ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    index + 1
                  )}
                </span>
                {index < totalStages - 1 ? (
                  <span
                    className={cn(
                      "w-0.5 flex-1 rounded-full",
                      isValidated ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"
                    )}
                    style={{ minHeight: "24px" }}
                  />
                ) : null}
              </div>

              {/* Contenu de l'étape */}
              <div
                className={cn(
                  "mb-4 w-full rounded-lg border p-3 pb-4",
                  isCurrent
                    ? "border-indigo-300 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-500/5"
                    : "border-transparent bg-muted/30"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3
                    className={cn(
                      "text-sm font-semibold",
                      isUpcoming && "text-muted-foreground"
                    )}
                  >
                    {index + 1}. {stage.title}
                  </h3>

                  <div className="flex items-center gap-1.5">
                    {isValidated ? (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                          <CheckIcon className="size-3" />
                          Validé
                        </span>
                        {/* Annulation de validation (retour arrière) :
                            l'étape redevient « En cours » et les suivantes
                            « À venir ». */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                          title={`Annuler la validation de l'étape ${index + 1}`}
                          aria-label={`Annuler la validation de l'étape ${index + 1}`}
                          disabled={
                            pendingOrder !== null ||
                            pendingUnverifyOrder !== null
                          }
                          onClick={() => handleUnverify(index + 1)}
                        >
                          {pendingUnverifyOrder === index + 1 ? (
                            <Loader2Icon
                              data-icon="inline-start"
                              className="animate-spin"
                            />
                          ) : (
                            <Undo2Icon data-icon="inline-start" />
                          )}
                          Annuler la validation
                        </Button>
                      </>
                    ) : null}
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200/60 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400">
                        En cours
                      </span>
                    ) : null}
                    {isUpcoming ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400">
                        À venir
                      </span>
                    ) : null}

                    {/* Retour arrière possible sur l'étape précédente validée */}
                    {isCurrent && index > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={
                          pendingOrder !== null || pendingUnverifyOrder !== null
                        }
                        onClick={() => handleValidate(index)}
                      >
                        Revenir
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Documents requis */}
                {stage.requiredDocuments.length > 0 ? (
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {stage.requiredDocuments.map((document) => (
                      <li
                        key={document}
                        className="flex items-start gap-1.5 text-xs text-muted-foreground"
                      >
                        <FileTextIcon className="mt-0.5 size-3 shrink-0" />
                        {document}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/* Actions de l'étape en cours : validation + échéance */}
                {isCurrent ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        pendingOrder !== null || pendingUnverifyOrder !== null
                      }
                      onClick={() => handleValidate(index + 1)}
                    >
                      {pendingOrder !== null ? (
                        <Loader2Icon data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <BadgeCheckIcon data-icon="inline-start" />
                      )}
                      Valider cette étape
                    </Button>

                    <div className="flex items-end gap-1.5">
                      <div className="grid gap-1">
                        <Label
                          htmlFor="stage-deadline"
                          className="flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          <AlarmClockIcon className="size-3" />
                          Date limite (ex : rendez-vous ambassade)
                        </Label>
                        <Input
                          id="stage-deadline"
                          type="date"
                          key={detail.currentStageDeadline?.toISOString() ?? "none"}
                          defaultValue={toDateInputValue(detail.currentStageDeadline)}
                          ref={deadlineInputRef}
                          className="h-9 w-48"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isSavingDeadline}
                        onClick={handleSaveDeadline}
                      >
                        {isSavingDeadline ? (
                          <Loader2Icon data-icon="inline-start" className="animate-spin" />
                        ) : null}
                        OK
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Bloc synthèse financière : coût, réduction, net, encaissé, reste. */
function FinanceSummary({
  detail,
}: {
  detail: TravelProcedureDetailDTO;
}) {
  const rows = [
    { label: "Coût total", value: detail.totalCost },
    { label: "Réduction accordée", value: -detail.discount },
    { label: "Net à payer", value: detail.netAmount, strong: true },
    { label: "Total encaissé", value: detail.paidAmount, positive: true },
    {
      label: "Reste à payer",
      value: detail.remainingAmount,
      strong: true,
      warning: detail.remainingAmount > 0,
    },
  ];

  return (
    <dl className="divide-y rounded-xl border bg-card">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 px-4 py-2.5"
        >
          <dt
            className={cn(
              "text-sm",
              row.strong ? "font-semibold" : "text-muted-foreground"
            )}
          >
            {row.label}
          </dt>
          <dd
            className={cn(
              "text-sm tabular-nums",
              row.strong && "font-bold",
              row.positive && "font-semibold text-emerald-600 dark:text-emerald-400",
              row.warning && "font-semibold text-amber-600 dark:text-amber-400"
            )}
          >
            {row.value < 0 ? "− " : ""}
            {amountFormatter.format(Math.abs(row.value))} FCFA
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Formulaire d'enregistrement d'une tranche + historique des règlements. */
function InstallmentsPanel({
  detail,
  organization,
  onError,
}: {
  detail: TravelProcedureDetailDTO;
  organization: OrganizationProfileDTO;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<string>("CASH");
  const [reference, setReference] = React.useState("");
  const [isOutOfSystem, setIsOutOfSystem] = React.useState(false);
  /** Date effective du règlement (vide ⇒ aujourd'hui). */
  const [paidAt, setPaidAt] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  /** Total encaissé incluant la tranche donnée (paiements antérieurs ou égaux). */
  const paidIncluding = (payment: TravelPaymentDTO): number => {
    return detail.payments
      .filter(
        (p) =>
          p.paidAt.getTime() <= payment.paidAt.getTime() || p.id === payment.id
      )
      .reduce((sum, p) => sum + p.amount, 0);
  };

  const printReceipt = (payment: TravelPaymentDTO) => {
    const paidAmount = paidIncluding(payment);

    // Historique chronologique de tous les versements effectués à ce jour
    // (tranche courante incluse) : alimente le tableau récapitulatif du reçu.
    const history = detail.payments
      .filter(
        (p) =>
          p.paidAt.getTime() <= payment.paidAt.getTime() || p.id === payment.id
      )
      .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
      .map((p) => ({
        paidAt: p.paidAt,
        paymentMethod: p.paymentMethod,
        label: p.reference ?? p.description,
        amount: p.amount,
      }));

    const html = buildTravelInstallmentReceiptDocument(
      {
        candidateName: detail.candidateName,
        candidateDetail: detail.candidateCode ?? detail.candidatePhone,
        destination: detail.destination,
        workflowTitle: detail.workflowTitle,
        totalCost: detail.totalCost,
        discount: detail.discount,
        netAmount: detail.netAmount,
        paidAmount,
        remainingAmount: Math.max(detail.netAmount - paidAmount, 0),
        installment: {
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          reference: payment.reference,
          paidAt: payment.paidAt,
        },
        history,
      },
      organization
    );

    printHtmlDocument(html);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onError(null);

    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      onError("Le montant de la tranche doit être supérieur à 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addTravelInstallmentAction(detail.id, {
        amount: parsedAmount,
        paymentMethod: method,
        reference: reference || null,
        isOutOfSystem,
        paidAt: paidAt || null,
      });

      if (!result.ok) {
        onError(result.message);
        return;
      }

      // Réinitialise le formulaire puis imprime immédiatement le reçu.
      setAmount("");
      setReference("");
      setPaidAt("");
      setIsOutOfSystem(false);
      router.refresh();
      printReceipt(result.payment);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (paymentId: string) => {
    setDeletingId(paymentId);
    try {
      const result = await deleteTravelInstallmentAction(paymentId);
      onError(result.ok ? null : result.message);
      if (result.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-label="Échelonnement financier" className="flex flex-col gap-4">
      {/* Formulaire nouvelle tranche */}
      <form onSubmit={handleSubmit} className="grid gap-3 rounded-xl border bg-card p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <WalletIcon className="size-4 text-primary" />
          Enregistrer un règlement par tranche
        </h3>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="installment-amount" className="text-xs">
              Montant (FCFA)
            </Label>
            <Input
              id="installment-amount"
              inputMode="numeric"
              placeholder={String(Math.max(detail.remainingAmount, 0))}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="installment-method" className="text-xs">
              Moyen de paiement
            </Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="installment-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {getPaymentMethodLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="installment-reference" className="text-xs">
              Référence (optionnel)
            </Label>
            <Input
              id="installment-reference"
              placeholder="N° transaction"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={100}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="installment-paid-at" className="text-xs">
              Date du règlement
            </Label>
            <Input
              id="installment-paid-at"
              type="date"
              value={paidAt}
              max={todayIso()}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </div>
        </div>

        {/* Règlement hors système / antérieur */}
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-3">
          <input
            type="checkbox"
            id="installment-out-of-system"
            checked={isOutOfSystem}
            onChange={(event) => setIsOutOfSystem(event.target.checked)}
            className="mt-0.5 size-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <div className="grid gap-1">
            <Label htmlFor="installment-out-of-system" className="font-medium">
              Paiement hors système / Antérieur
            </Label>
            <p className="text-xs text-muted-foreground">
              Règlement encaissé hors système ou saisi après coup : il met à jour
              le solde débiteur du dossier (reste à payer), sans impacter le fond
              de caisse physique du jour.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Reste à payer actuel :{" "}
            <strong className="tabular-nums">
              {amountFormatter.format(detail.remainingAmount)} FCFA
            </strong>
          </p>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <BadgeCheckIcon data-icon="inline-start" />
            )}
            {isSubmitting ? "Enregistrement..." : "Encaisser & imprimer"}
          </Button>
        </div>
      </form>

      {/* Historique des tranches */}
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Moyen</TableHead>
              <TableHead>Référence</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.payments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Aucun règlement enregistré pour ce dossier.
                </TableCell>
              </TableRow>
            ) : (
              detail.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dateFormatter.format(payment.paidAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getPaymentMethodLabel(payment.paymentMethod)}
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-muted-foreground">
                    {payment.reference ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {amountFormatter.format(payment.amount)} FCFA
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Imprimer le reçu de la tranche du ${dateFormatter.format(payment.paidAt)}`}
                        onClick={() => printReceipt(payment)}
                      >
                        <PrinterIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label="Supprimer cette tranche"
                        disabled={deletingId === payment.id}
                        onClick={() => handleDelete(payment.id)}
                      >
                        {deletingId === payment.id ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <Trash2Icon className="size-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

// --------------------------------------
// Vue principale
// --------------------------------------

export function TravelDetailView({
  detail,
  organization,
  documents,
}: {
  detail: TravelProcedureDetailDTO;
  organization: OrganizationProfileDTO;
  documents: DocumentDTO[];
}) {
  const [actionError, setActionError] = React.useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Fil d'Ariane + en-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard/travels"
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            Retour aux dossiers
          </Link>

          <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {detail.candidateName}
            {detail.isExternalCandidate ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <UserRoundXIcon className="size-3" />
                Candidat externe
              </span>
            ) : detail.candidateCode ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {detail.candidateCode}
              </span>
            ) : null}
          </h2>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="size-3.5" />
              {detail.destination}
            </span>
            {detail.targetProgram ? <span>{detail.targetProgram}</span> : null}
            {detail.workflowTitle ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {detail.workflowTitle}
              </span>
            ) : null}
            {detail.candidatePhone ? (
              <span>{detail.candidatePhone}</span>
            ) : null}
          </p>
        </div>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {actionError}
        </p>
      ) : null}

      {/* Deux colonnes : progression / finances */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="rounded-xl border bg-card p-4 md:p-6">
          <StageTimeline detail={detail} onStageResult={setActionError} />
        </div>

        <div className="flex flex-col gap-4">
          <FinanceSummary detail={detail} />
          <InstallmentsPanel
            detail={detail}
            organization={organization}
            onError={setActionError}
          />
        </div>
      </div>

      {/* Pièces jointes du dossier : liens externes / stockage externe */}
      <DocumentsTab
        owner={{ travelProcedureId: detail.id }}
        initialDocuments={documents}
        studentName={detail.candidateName}
      />
    </div>
  );
}