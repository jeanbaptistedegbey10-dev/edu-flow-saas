"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  BadgeCheckIcon,
  Loader2Icon,
  PlusIcon,
  UserPlusIcon,
} from "lucide-react";

import type { ClassOptionDTO } from "@/actions/classes";
import { createStudentAction, type StudentFormState } from "@/actions/students";
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

/** Valeur sentinelle pour les champs Select optionnels (Radix interdit ""). */
const NONE_VALUE = "__none__";

const STATUS_OPTIONS = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "ENROLLED", label: "Inscrit" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "COMPLETED", label: "Terminé" },
  { value: "SUSPENDED", label: "Suspendu" },
  { value: "DROPPED_OUT", label: "Abandon" },
] as const;

const INITIAL_FORM_STATE: StudentFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function AddStudentDialog({
  classes,
  registrationFee,
}: {
  /** Classes / cohortes disponibles pour l'affectation. */
  classes: ClassOptionDTO[];
  /** Frais d'inscription par défaut de l'organisation (FCFA). */
  registrationFee: number;
}) {
  const [open, setOpen] = React.useState(false);

  // Champs financiers : le Net à Payer est recalculé en direct
  // (netAmount = totalCost − discount), sans jamais être saisissable.
  const [totalCost, setTotalCost] = React.useState("");
  const [discount, setDiscount] = React.useState("");

  const netAmount = React.useMemo(() => {
    const cost = Number(totalCost.replace(",", "."));
    const reduction = discount ? Number(discount.replace(",", ".")) : 0;

    if (!totalCost || Number.isNaN(cost)) return null;

    return Math.max(0, cost - (Number.isNaN(reduction) ? 0 : reduction));
  }, [totalCost, discount]);

  // Enveloppe l'action serveur pour fermer la modale dès que la création réussit.
  const [state, formAction, pending] = useActionState(
    async (_prevState: StudentFormState, rawFormData: FormData) => {
      // Clone les entrées puis convertit la sentinelle « aucune classe »
      // en chaîne vide attendue par l'action serveur.
      const formData = new FormData();
      for (const [key, value] of rawFormData.entries()) {
        formData.append(key, value);
      }

      if (String(formData.get("classId") ?? "") === NONE_VALUE) {
        formData.set("classId", "");
      }

      const result = await createStudentAction(_prevState, formData);

      if (result.status === "success") {
        setOpen(false);
        setTotalCost("");
        setDiscount("");
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
          Nouvel étudiant
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un étudiant</DialogTitle>
          <DialogDescription>
            Renseignez les informations du nouvel étudiant. Le code étudiant est
            généré automatiquement.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="firstName">Prénom *</Label>
              <Input
                id="firstName"
                name="firstName"
                placeholder="Ex : Awa"
                autoComplete="given-name"
                required
                aria-invalid={Boolean(fieldErrors.firstName)}
              />
              <FieldError message={fieldErrors.firstName} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lastName">Nom *</Label>
              <Input
                id="lastName"
                name="lastName"
                placeholder="Ex : Traoré"
                autoComplete="family-name"
                required
                aria-invalid={Boolean(fieldErrors.lastName)}
              />
              <FieldError message={fieldErrors.lastName} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Ex : awa.traore@example.com"
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
            />
            <FieldError message={fieldErrors.email} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="phone">Téléphone *</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="Ex : +225 05 00 00 00 01"
                autoComplete="tel"
                required
                aria-invalid={Boolean(fieldErrors.phone)}
              />
              <FieldError message={fieldErrors.phone} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="status">Statut</Label>
              <Select name="status" defaultValue="PROSPECT">
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
          </div>

          {/* Affectation à une classe / cohorte */}
          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Classe / Cohorte
            </legend>

            <div className="grid gap-2">
              <Label htmlFor="classId">Classe</Label>
              <Select name="classId" defaultValue={NONE_VALUE}>
                <SelectTrigger id="classId" className="w-full">
                  <SelectValue placeholder="Aucune classe (facultatif)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>— Aucune classe —</SelectItem>
                  {classes.map((klass) => (
                    <SelectItem key={klass.id} value={klass.id}>
                      {klass.name} · {klass.schedule} ({klass.courseCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.classId} />
              {classes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucune classe disponible : créez-en une depuis la page
                  « Classes » pour regrouper vos étudiants par cohorte et
                  créneau horaire.
                </p>
              ) : null}
            </div>
          </fieldset>

          {/* Récapitulatif financier */}
          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Financement de la formation
            </legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="totalCost">Coût total (FCFA)</Label>
                <Input
                  id="totalCost"
                  name="totalCost"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="Ex : 400000"
                  value={totalCost}
                  onChange={(event) => setTotalCost(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.totalCost)}
                />
                <FieldError message={fieldErrors.totalCost} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="discount">Réduction (FCFA)</Label>
                <Input
                  id="discount"
                  name="discount"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="Ex : 25000"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.discount)}
                />
                <FieldError message={fieldErrors.discount} />
              </div>
            </div>

            {/* Annonce des frais d'inscription uniques */}
            {registrationFee > 0 ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                <BadgeCheckIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Frais d&rsquo;inscription uniques :{" "}
                  <strong className="font-semibold tabular-nums">
                    {registrationFee.toLocaleString("fr-FR")} FCFA
                  </strong>{" "}
                  seront ajoutés au coût total exigé et encaissés
                  automatiquement (recette « Frais d&rsquo;inscription ») lors
                  de la validation.
                </span>
              </div>
            ) : null}

            {/* Net à payer calculé automatiquement (lecture seule) */}
            <div className="mt-3 flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
              <span className="text-sm font-medium">Net à payer</span>
              <span className="text-sm font-bold tabular-nums">
                {netAmount !== null
                  ? `${netAmount.toLocaleString("fr-FR")} FCFA`
                  : "—"}
              </span>
            </div>
            <input type="hidden" name="netAmount" value={netAmount ?? ""} />
          </fieldset>

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
                <UserPlusIcon data-icon="inline-start" />
              )}
              {pending ? "Création..." : "Créer l'étudiant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}