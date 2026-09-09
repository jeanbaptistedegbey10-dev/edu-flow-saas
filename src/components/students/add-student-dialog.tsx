"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  BadgeCheckIcon,
  InfoIcon,
  Loader2Icon,
  LockKeyholeIcon,
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
import { cn } from "@/lib/utils";

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

  // Champs financiers : le Net à Payer est recalculé en direct, sans jamais
  // être saisissable. La sélection d'une classe verrouille le coût total sur
  // les frais de scolarité configurés pour cette classe (frais de classe ou
  // prix du cours porteur).
  const [selectedClassId, setSelectedClassId] =
    React.useState<string>(NONE_VALUE);
  const [discountType, setDiscountType] =
    React.useState<"FIXED" | "PERCENTAGE">("FIXED");
  const [totalCost, setTotalCost] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  // Étudiant « hérité » : dès que des paiements antérieurs sont saisis ou que
  // la case « Ne pas inclure dans le journal de caisse actuel » est cochée,
  // les frais d'inscription (15 000 FCFA) sont réputés réglés hors système —
  // aucune écriture ne doit être générée dans la caisse live.
  const [legacyExcluded, setLegacyExcluded] = React.useState(true);
  const [legacyPaidAmountInput, setLegacyPaidAmountInput] =
    React.useState("");
  // Autonomie de l'étudiant : si coché, les champs de contact parent deviennent
  // facultatifs (l'étudiant s'assume financièrement lui-même).
  const [isSelfFinanced, setIsSelfFinanced] = React.useState(false);

  const selectedClass = classes.find((klass) => klass.id === selectedClassId);
  const classFeeLocked = selectedClass !== null;

  /** Réaction à la sélection d'une classe : pré-remplit et verrouille les frais. */
  const handleClassChange = (value: string) => {
    setSelectedClassId(value);

    if (value !== NONE_VALUE) {
      const klass = classes.find((item) => item.id === value);
      if (klass?.tuitionFee != null) {
        setTotalCost(String(klass.tuitionFee));
      }
    }
  };

  const netAmount = React.useMemo(() => {
    const cost = Number(totalCost.replace(",", "."));
    if (!totalCost || Number.isNaN(cost)) return null;

    const rawReduction = discount ? Number(discount.replace(",", ".")) : 0;
    const reduction = Number.isNaN(rawReduction) ? 0 : rawReduction;

    if (discountType === "PERCENTAGE") {
      return Math.max(
        0,
        Math.round(cost * (1 - (Math.min(100, reduction) / 100)))
      );
    }

    return Math.max(0, cost - reduction);
  }, [totalCost, discount, discountType]);

  // Frais d'inscription : pour un étudiant hérité (paiements antérieurs > 0
  // ou case d'exclusion cochée), ils sont réputés réglés hors système et ne
  // génèrent AUCUNE écriture dans la caisse live.
  const legacyBypass = React.useMemo(() => {
    if (legacyExcluded) return true;
    const raw = Number(legacyPaidAmountInput.replace(",", "."));
    return !Number.isNaN(raw) && raw > 0;
  }, [legacyExcluded, legacyPaidAmountInput]);

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
        setSelectedClassId(NONE_VALUE);
        setDiscountType("FIXED");
        setTotalCost("");
        setDiscount("");
        setLegacyExcluded(true);
        setLegacyPaidAmountInput("");
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

        <form
          action={formAction}
          className="grid max-h-[70vh] gap-4 overflow-y-auto pr-2"
        >
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
              <Select
                name="classId"
                value={selectedClassId}
                onValueChange={handleClassChange}
              >
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
              {selectedClass ? (
                <p className="text-xs text-muted-foreground">
                  Frais de scolarité appliqués :{" "}
                  <strong className="font-semibold tabular-nums">
                    {selectedClass.tuitionFee?.toLocaleString("fr-FR") ?? "—"}{" "}
                    FCFA
                  </strong>{" "}
                  (coût total verrouillé sur cette classe).
                </p>
              ) : null}
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
                  readOnly={classFeeLocked}
                  value={
                    classFeeLocked && selectedClass?.tuitionFee != null
                      ? String(selectedClass.tuitionFee)
                      : totalCost
                  }
                  onChange={(event) => setTotalCost(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.totalCost)}
                  className={cn(
                    classFeeLocked &&
                      "cursor-not-allowed bg-muted/50 focus-visible:ring-0"
                  )}
                />
                <FieldError message={fieldErrors.totalCost} />
                {classFeeLocked ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <LockKeyholeIcon className="size-3 shrink-0" />
                    Montant imposé par la classe — choisissez «&nbsp;Aucune
                    classe&nbsp;» pour le modifier.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="discountType">Type de réduction</Label>
                <Select
                  name="discountType"
                  value={discountType}
                  onValueChange={(value) =>
                    setDiscountType(value as "FIXED" | "PERCENTAGE")
                  }
                >
                  <SelectTrigger id="discountType" className="w-full">
                    <SelectValue placeholder="Type de réduction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Montant fixe (FCFA)</SelectItem>
                    <SelectItem value="PERCENTAGE">
                      Pourcentage (%)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="discount">
                  Réduction{" "}
                  {discountType === "PERCENTAGE" ? "(%)" : "(FCFA)"}
                </Label>
                <Input
                  id="discount"
                  name="discount"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder={discountType === "PERCENTAGE" ? "Ex : 10" : "Ex : 25000"}
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.discount)}
                />
                <FieldError message={fieldErrors.discount} />
              </div>
            </div>

            {/* Paiements antérieurs hors système (avant adoption du logiciel) */}
            <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
              <div className="grid gap-2">
                <Label htmlFor="legacyPaidAmount">
                  Paiements antérieurs hors système (FCFA)
                </Label>
                <Input
                  id="legacyPaidAmount"
                  name="legacyPaidAmount"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="Ex : 100000"
                  value={legacyPaidAmountInput}
                  onChange={(event) =>
                    setLegacyPaidAmountInput(event.target.value)
                  }
                  aria-invalid={Boolean(fieldErrors.legacyPaidAmount)}
                />
                <FieldError message={fieldErrors.legacyPaidAmount} />
                <p className="text-xs text-muted-foreground">
                  Montant déjà réglé par l&apos;étudiant avant l&apos;adoption
                  d&apos;EduFlow. Il est déduit du reste à payer, mais ne
                  génère aucune recette dans le journal de caisse actuel.
                </p>
              </div>
              {/* Sentinelle : la case est rendue → absence = décochée */}
              <input type="hidden" name="legacyCheckboxRendered" value="1" />
              <label className="flex items-start gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  name="excludeLegacyFromCashJournal"
                  checked={legacyExcluded}
                  onChange={(event) => setLegacyExcluded(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-indigo-600"
                />
                Ne pas inclure dans le journal de caisse actuel
              </label>
            </div>

            {discountType === "PERCENTAGE" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                La réduction est calculée en pourcentage du coût total
                (réduction = coût total × pourcentage).
              </p>
            ) : null}

            {/* Statut des frais d'inscription : encaissement live (étudiant
                saisi dans EduFlow) ou réputés réglés hors système (hérités). */}
            {registrationFee > 0 ? (
              legacyBypass ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                  <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Frais d&rsquo;inscription (
                    <strong className="font-semibold tabular-nums">
                      {registrationFee.toLocaleString("fr-FR")} FCFA
                    </strong>
                    ) : considérés comme réglés hors système. Aucun montant ne
                    sera ajouté à la caisse live.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
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
              )
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

          {/* Autonomie de l'étudiant / contact parent */}
          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Responsable financier
            </legend>

            <div className="grid gap-3">
              <label className="flex items-start gap-3 rounded-md border border-muted bg-muted/30 p-3">
                <input
                  type="checkbox"
                  name="isSelfFinanced"
                  checked={isSelfFinanced}
                  onChange={(event) => setIsSelfFinanced(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-indigo-600"
                />
                <div>
                  <span className="text-sm font-medium">
                    L'étudiant est autonome / s'assume lui-même
                  </span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Si coché, les champs de contact parent deviennent facultatifs.
                  </p>
                </div>
              </label>

              {!isSelfFinanced ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="parentName">Nom du parent / tuteur *</Label>
                    <Input
                      id="parentName"
                      name="parentName"
                      placeholder="Ex : Monsieur Traoré"
                      aria-invalid={Boolean(fieldErrors.parentName)}
                    />
                    <FieldError message={fieldErrors.parentName} />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="parentRelation">Lien avec l'étudiant</Label>
                    <Select name="parentRelation" defaultValue="">
                      <SelectTrigger id="parentRelation" className="w-full">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Père">Père</SelectItem>
                        <SelectItem value="Mère">Mère</SelectItem>
                        <SelectItem value="Tuteur">Tuteur</SelectItem>
                        <SelectItem value="Garant">Garant</SelectItem>
                        <SelectItem value="Autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError message={fieldErrors.parentRelation} />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="parentPhone1">
                      Téléphone principal du parent *
                    </Label>
                    <Input
                      id="parentPhone1"
                      name="parentPhone1"
                      type="tel"
                      placeholder="Ex : +225 05 00 00 00 10"
                      autoComplete="tel"
                      aria-invalid={Boolean(fieldErrors.parentPhone1)}
                    />
                    <FieldError message={fieldErrors.parentPhone1} />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="parentPhone2">
                      Téléphone secondaire (optionnel)
                    </Label>
                    <Input
                      id="parentPhone2"
                      name="parentPhone2"
                      type="tel"
                      placeholder="Ex : +225 05 00 00 00 11"
                      autoComplete="tel"
                      aria-invalid={Boolean(fieldErrors.parentPhone2)}
                    />
                    <FieldError message={fieldErrors.parentPhone2} />
                  </div>
                </div>
              ) : null}
            </div>
          </fieldset>

          <DialogFooter className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background pt-3">
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