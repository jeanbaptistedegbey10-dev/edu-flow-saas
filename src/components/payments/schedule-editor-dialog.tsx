"use client";

import * as React from "react";
import {
  CalendarClockIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";

import type { ScheduleTemplateItemInput } from "@/lib/actions/schedules";
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
import { cn } from "@/lib/utils";

// Formatage déterministe (locale fixe) pour éviter tout écart d'hydratation.
const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function formatAmount(value: number): string {
  return `${amountFormatter.format(value)} FCFA`;
}

/** Tranche éditable dans le formulaire. */
type DraftItem = ScheduleTemplateItemInput & { key: string };

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

function toDrafts(
  items: ScheduleTemplateItemInput[],
  intervalDays: number
): DraftItem[] {
  return items.map((item, idx) => ({
    key: nextKey(),
    amount: item.amount,
    // Premier offset par défaut 0 (échéance au démarrage), puis intervalle.
    offsetDays: item.offsetDays ?? idx * intervalDays,
  }));
}

/** Répartit également un montant sur `count` tranches (entiers, somme exacte). */
function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const out = Array.from({ length: count }, () => base);
  out[count - 1] += Math.round(total - base * count);
  return out;
}

export type ScheduleEditorSubmit = {
  intervalDays: number;
  items: ScheduleTemplateItemInput[];
};

/**
 * Modale réutilisable d'édition d'un échéancier (modèle de cours ou de
 * procédure voyage). Permet :
 *   - de modifier le NOMBRE de tranches (ajout / suppression) ;
 *   - d'AJUSTER le montant de chaque tranche (avec vérification que la somme
 *     égale le montant total de référence) ;
 *   - d'AJUSTER le délai (offsetDays) de chaque tranche ou l'intervalle global.
 *
 * Le composant est contrôlé par le parent (`open` + `onOpenChange`) et isole sa
 * logique dans un sous-composant `key`-é pour repartir d'un état neuf à chaque
 * ouverture.
 */
export function ScheduleEditorDialog({
  open,
  onOpenChange,
  title,
  description,
  /** Montant total de référence (prix du cours / coût de la procédure). */
  totalAmount,
  initialItems,
  initialIntervalDays,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  totalAmount: number;
  initialItems: ScheduleTemplateItemInput[];
  initialIntervalDays: number;
  onSave: (payload: ScheduleEditorSubmit) => Promise<{ ok: boolean; message?: string }>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open ? (
          <ScheduleEditorForm
            key={`${title}-${initialItems.length}-${initialIntervalDays}`}
            title={title}
            description={description}
            totalAmount={totalAmount}
            initialItems={initialItems}
            initialIntervalDays={initialIntervalDays}
            onSave={onSave}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}


function ScheduleEditorForm({
  title,
  description,
  totalAmount,
  initialItems,
  initialIntervalDays,
  onSave,
  onDone,
}: {
  title: string;
  description: string;
  totalAmount: number;
  initialItems: ScheduleTemplateItemInput[];
  initialIntervalDays: number;
  onSave: (payload: ScheduleEditorSubmit) => Promise<{ ok: boolean; message?: string }>;
  onDone: () => void;
}) {
  const [items, setItems] = React.useState<DraftItem[]>(() =>
    toDrafts(initialItems, initialIntervalDays)
  );
  const [intervalDays, setIntervalDays] = React.useState<number>(initialIntervalDays);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sum = Math.round(items.reduce((s, i) => s + (Number(i.amount) || 0), 0) * 100) / 100;
  const diff = Math.round((sum - totalAmount) * 100) / 100;
  const isBalanced = Math.abs(diff) <= 1;

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function addItem() {
    if (items.length >= 12) return;
    setItems((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          key: nextKey(),
          amount: 0,
          offsetDays: (last?.offsetDays ?? 0) + Math.max(intervalDays, 1),
        },
      ];
    });
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.key !== key)));
  }

  /** Répartit également le montant total sur le nombre actuel de tranches. */
  function rebalanceEvenly() {
    const parts = splitEvenly(totalAmount, items.length);
    setItems((prev) => prev.map((it, idx) => ({ ...it, amount: parts[idx] ?? it.amount })));
  }

  /** Réapplique l'intervalle global à toutes les échéances (J+0, J+n, J+2n…). */
  function applyInterval() {
    setItems((prev) =>
      prev.map((it, idx) => ({ ...it, offsetDays: idx * Math.max(intervalDays, 0) }))
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (items.length < 1 || items.length > 12) {
      setError("Le nombre de tranches doit être compris entre 1 et 12.");
      return;
    }
    if (!isBalanced) {
      setError(
        `La somme des tranches (${formatAmount(sum)}) doit égaler le montant total (${formatAmount(totalAmount)}).`
      );
      return;
    }
    if (items.some((i) => (Number(i.amount) || 0) <= 0)) {
      setError("Chaque tranche doit avoir un montant strictement positif.");
      return;
    }

    setPending(true);
    try {
      const result = await onSave({
        intervalDays,
        items: items.map((i) => ({
          amount: Math.round((Number(i.amount) || 0) * 100) / 100,
          offsetDays: Math.max(0, Math.round(Number(i.offsetDays) || 0)),
        })),
      });
      if (result.ok) {
        onDone();
      } else {
        setError(result.message ?? "Une erreur est survenue.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4" />
          {title}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        {/* Montant total de référence (lecture seule) */}
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Montant total à échéancer</span>
          <span className="font-semibold tabular-nums">{formatAmount(totalAmount)}</span>
        </div>

        {/* Intervalle global */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="schedule-interval">Intervalle entre tranches (jours)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="schedule-interval"
                type="number"
                min={0}
                step={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
              />
              <Button type="button" variant="outline" size="sm" onClick={applyInterval}>
                Appliquer
              </Button>
            </div>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" size="sm" onClick={rebalanceEvenly}>
              Répartir équitablement
            </Button>
          </div>
        </div>

        {/* Liste des tranches */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Tranches ({items.length})</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={items.length >= 12}
            >
              <PlusIcon data-icon="inline-start" />
              Ajouter une tranche
            </Button>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-2">
            {items.map((item, idx) => (
              <div
                key={item.key}
                className="grid grid-cols-[1.5rem_1fr_7rem_2.5rem] items-center gap-2"
              >
                <span className="text-center text-sm font-medium text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="flex items-center gap-1.5">
                  <Input
                    aria-label={`Montant de la tranche ${idx + 1}`}
                    type="number"
                    min={0}
                    step={1}
                    value={item.amount}
                    onChange={(e) =>
                      updateItem(item.key, { amount: Number(e.target.value) })
                    }
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">FCFA</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">J+</span>
                  <Input
                    aria-label={`Délai de la tranche ${idx + 1} (jours)`}
                    type="number"
                    min={0}
                    step={1}
                    value={item.offsetDays}
                    onChange={(e) =>
                      updateItem(item.key, { offsetDays: Number(e.target.value) })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Supprimer la tranche ${idx + 1}`}
                  onClick={() => removeItem(item.key)}
                  disabled={items.length <= 1}
                >
                  <Trash2Icon className="size-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Bilan de la somme */}
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
            isBalanced
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
          )}
        >
          <span>Somme des tranches</span>
          <span className="font-semibold tabular-nums">
            {formatAmount(sum)}
            {isBalanced ? " ✓" : ` (écart ${diff > 0 ? "+" : ""}${diff})`}
          </span>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Annuler
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending || !isBalanced}>
          {pending ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {pending ? "Enregistrement..." : "Enregistrer l'échéancier"}
        </Button>
      </DialogFooter>
    </form>
  );
}

