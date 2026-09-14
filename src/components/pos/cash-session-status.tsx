"use client";

import * as React from "react";
import {
  BanknoteIcon,
  CheckCircle2Icon,
  Loader2Icon,
  LockIcon,
  WalletIcon,
  XCircleIcon,
} from "lucide-react";

import {
  closeCashSession,
  getCashSessionSummary,
  openCashSession,
  type CashSessionDTO,
  type CashSessionSummaryDTO,
} from "@/lib/actions/cash-register";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getPaymentMethodLabel,
  PAYMENT_METHOD_ORDER,
} from "@/lib/payment-status";

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function formatAmount(value: number): string {
  return `${amountFormatter.format(value)} FCFA`;
}

export function CashSessionBanner({
  session,
  onSessionChange,
}: {
  session: CashSessionDTO | null;
  onSessionChange: () => void;
}) {
  const [isOpening, setIsOpening] = React.useState(false);
  const [openAmount, setOpenAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const handleOpen = async () => {
    setError(null);
    const amount = Number(openAmount);
    if (isNaN(amount) || amount < 0) {
      setError("Veuillez saisir un montant valide.");
      return;
    }
    setIsOpening(true);
    const result = await openCashSession(amount);
    setIsOpening(false);
    if (result.ok) {
      setOpenAmount("");
      onSessionChange();
    } else {
      setError(result.message);
    }
  };

  if (session) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <div className="flex items-center gap-2">
          <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium text-emerald-700 dark:text-emerald-300">
            Caisse ouverte
          </span>
          <span className="text-emerald-600/70 dark:text-emerald-400/70">
            — Fond de caisse : {formatAmount(session.initialAmount)} — Solde
            théorique : {formatAmount(session.theoreticalBalance)}
          </span>
        </div>
        <CloseCashSessionDialog onClosed={onSessionChange} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/20 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <LockIcon className="size-4 text-amber-600 dark:text-amber-400" />
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Veuillez ouvrir la caisse pour encaisser
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <WalletIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="number"
              min={0}
              step={500}
              placeholder="Fond de caisse (FCFA)"
              value={openAmount}
              onChange={(e) => setOpenAmount(e.target.value)}
              className="h-8 w-48 pl-8"
              disabled={isOpening}
            />
          </div>
          <Button size="sm" onClick={handleOpen} disabled={isOpening || !openAmount}>
            {isOpening ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <BanknoteIcon className="size-3.5" />
            )}
            Ouvrir la caisse
          </Button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  );
}

function CloseCashSessionDialog({ onClosed }: { onClosed: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [summary, setSummary] = React.useState<CashSessionSummaryDTO | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [countedAmount, setCountedAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isClosing, setIsClosing] = React.useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    const result = await getCashSessionSummary();
    setLoading(false);
    if (result.ok) setSummary(result.summary);
    else setError(result.message);
  };

  React.useEffect(() => {
    if (open) {
      fetchSummary();
      setCountedAmount("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  const handleClose = async () => {
    setError(null);
    const amount = Number(countedAmount);
    if (isNaN(amount) || amount < 0) {
      setError("Veuillez saisir le montant compté.");
      return;
    }
    setIsClosing(true);
    const result = await closeCashSession(amount, notes || undefined);
    setIsClosing(false);
    if (result.ok) {
      setOpen(false);
      onClosed();
    } else {
      setError(result.message);
    }
  };

  const totalIncoming = summary
    ? PAYMENT_METHOD_ORDER.reduce((s, m) => s + (summary.salesByMethod[m] ?? 0) + (summary.paymentsByMethod[m] ?? 0), 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <XCircleIcon className="size-3.5" />
          Clôturer la caisse
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Clôturer la caisse</DialogTitle>
          <DialogDescription>Résumé de la journée et saisie du montant réel compté.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : summary ? (
          <div className="grid gap-4">
            <div className="rounded-lg bg-muted/40 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Encaissements par moyen</h4>
              <div className="grid grid-cols-2 gap-1 text-sm">
                {PAYMENT_METHOD_ORDER.map((method) => {
                  const total = (summary.salesByMethod[method] ?? 0) + (summary.paymentsByMethod[method] ?? 0);
                  return (
                    <div key={method} className="flex justify-between">
                      <span className="text-muted-foreground">{getPaymentMethodLabel(method)}</span>
                      <span className="tabular-nums font-medium">{formatAmount(total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fond de caisse initial</dt>
                <dd className="tabular-nums font-medium">{formatAmount(summary.session.initialAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total encaissements</dt>
                <dd className="tabular-nums font-medium text-emerald-600">+ {formatAmount(totalIncoming)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total dépenses</dt>
                <dd className="tabular-nums font-medium text-red-600">− {formatAmount(summary.expensesTotal)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <dt className="font-semibold">Solde théorique</dt>
                <dd className="text-lg font-bold tabular-nums">{formatAmount(summary.session.initialAmount + totalIncoming - summary.expensesTotal)}</dd>
              </div>
            </dl>
            <div className="grid gap-2">
              <Label htmlFor="counted-amount">Montant réel compté (FCFA) *</Label>
              <Input id="counted-amount" type="number" min={0} step={500} placeholder="Montant compté en caisse" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="close-notes">Notes (optionnel)</Label>
              <Input id="close-notes" placeholder="Commentaires de clôture..." value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={255} />
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isClosing}>Annuler</Button>
          <Button onClick={handleClose} disabled={isClosing || loading}>
            {isClosing ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckCircle2Icon className="size-3.5" />}
            {isClosing ? "Clôture..." : "Confirmer la clôture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}