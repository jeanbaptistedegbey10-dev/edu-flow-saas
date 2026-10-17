"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  BadgeCheckIcon,
  CheckCircle2Icon,
  InfoIcon,
  Loader2Icon,
  LockKeyholeIcon,
  SaveIcon,
} from "lucide-react";

import type { ClassOptionDTO } from "@/actions/classes";
import {
  updateStudentAction,
  type StudentDTO,
  type StudentFormState,
} from "@/actions/students";
// Conversion Date → valeur `yyyy-mm-dd` pour les `<input type="date">`.
import { toAttestationDateInputValue } from "@/lib/report-card";
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
// Les statuts sont strictement limités à trois options produit :
// Prospect, Inscrit, Abandonné (voir src/lib/student-status.ts).
import {
  CANONICAL_STUDENT_STATUS_OPTIONS,
  getStudentStatusLabel,
} from "@/lib/student-status";
import { cn } from "@/lib/utils";

/** Valeur sentinelle pour les champs Select optionnels (Radix interdit ""). */
const NONE_VALUE = "__none__";

const INITIAL_FORM_STATE: StudentFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'édition isolé par entité (`key={student.id}` côté parent)
 * afin de réinitialiser l'état du formulaire à chaque ouverture.
 *
 * Sert également de formulaire de réinscription : l'affectation à une
 * nouvelle classe / cohorte (ex : passage A1 → A2) crée une nouvelle ligne
 * d'historique sans facturer à nouveau les frais d'inscription.
 */
function EditStudentForm({
  student,
  classes,
  registrationFee,
  canEditStatus = false,
  onSuccess,
}: {
  student: StudentDTO;
  /** Classes / cohortes disponibles pour l'affectation. */
  classes: ClassOptionDTO[];
  /** Frais d'inscription par défaut de l'organisation (FCFA). */
  registrationFee: number;
  onSuccess: () => void;
  /** Autorise le positionnement d'un statut (modale admin d'édition). */
  canEditStatus?: boolean;
}) {
  // Champs financiers contrôlés : le Net à Payer est recalculé en direct
  // (réduction fixe ou en pourcentage), sans jamais être saisissable.
  // Changer de classe verrouille le coût total sur les frais de scolarité
  // configurés pour cette classe (frais de classe ou prix du cours porteur).
  const [selectedClassId, setSelectedClassId] = React.useState<string>(
    student.currentClassId ?? NONE_VALUE
  );
  const [discountType, setDiscountType] = React.useState<"FIXED" | "PERCENTAGE">(
    student.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED"
  );
  const [totalCost, setTotalCost] = React.useState(
    student.totalCost !== null ? String(student.totalCost) : ""
  );
  const [discount, setDiscount] = React.useState(
    student.discount !== null ? String(student.discount) : ""
  );
  // Étudiant « hérité » : paiements antérieurs saisis OU case « Ne pas inclure
  // dans le journal de caisse actuel » cochée → les frais d'inscription
  // (15 000 FCFA) sont réputés réglés hors système — ils ne doivent JAMAIS être
  // injectés dans la caisse live.
  const [legacyExcluded, setLegacyExcluded] = React.useState(
    !student.legacyAmountInCashJournal
  );
  const [legacyPaidAmountInput, setLegacyPaidAmountInput] = React.useState(
    student.legacyPaidAmount > 0 ? String(student.legacyPaidAmount) : ""
  );
  // Autonomie de l'étudiant : si coché, les champs de contact parent deviennent
  // facultatifs (l'étudiant s'assume financièrement lui-même).
  const [isSelfFinanced, setIsSelfFinanced] = React.useState(
    student.isSelfFinanced
  );

  const selectedClass = classes.find((klass) => klass.id === selectedClassId);
  const classFeeLocked = selectedClass !== null;

  // Options de statut : les QUATRE statuts canoniques (Prospect, Inscrit,
  // Diplômé / Terminé, Abandonné), complétés par le statut historique de
  // l'étudiant lorsque celui-ci date d'avant l'harmonisation — ainsi la valeur
  // existante est toujours affichée et ne peut pas être perdue à
  // l'enregistrement.
  const statusOptions = React.useMemo(() => {
    const options = CANONICAL_STUDENT_STATUS_OPTIONS.map((option) => ({
      ...option,
    }));
    // Statut historique (famille des 6 anciens statuts) : conditionné au flag
    // `canEditStatus` pour qu'il n'apparaisse que dans les formulaires où la
    // famille est autorisée à positionner un statut (modale admin d'édition)
    // et pas dans les formulaires visuels historiques (fiches PDF, historique
    // du carnet de bord) où seul l'affichage est autorisé.
    if (canEditStatus && !options.some((option) => option.value === student.status)) {
      options.push({
        value: student.status,
        label: `${getStudentStatusLabel(student.status)} (statut historique)`,
      });
    }
    return options;
  }, [canEditStatus, student.status]);

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

  const legacyBypass = React.useMemo(() => {
    if (legacyExcluded) return true;
    const raw = Number(legacyPaidAmountInput.replace(",", "."));
    return !Number.isNaN(raw) && raw > 0;
  }, [legacyExcluded, legacyPaidAmountInput]);

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

      const result = await updateStudentAction(_prevState, formData);

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
        <DialogTitle>Modifier l’étudiant</DialogTitle>
        <DialogDescription>
          Mettez à jour les informations de {student.firstName}{" "}
          {student.lastName} ({student.studentCode}). Le code étudiant reste
          inchangé.
        </DialogDescription>
      </DialogHeader>

      <form
        action={formAction}
        className="grid max-h-[70vh] gap-4 overflow-y-auto pr-2"
      >
        <input type="hidden" name="id" value={student.id} />

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
            <Label htmlFor="edit-firstName">Prénom *</Label>
            <Input
              id="edit-firstName"
              name="firstName"
              defaultValue={student.firstName}
              autoComplete="given-name"
              required
              aria-invalid={Boolean(fieldErrors.firstName)}
            />
            <FieldError message={fieldErrors.firstName} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-lastName">Nom *</Label>
            <Input
              id="edit-lastName"
              name="lastName"
              defaultValue={student.lastName}
              autoComplete="family-name"
              required
              aria-invalid={Boolean(fieldErrors.lastName)}
            />
            <FieldError message={fieldErrors.lastName} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-email">Email</Label>
          <Input
            id="edit-email"
            name="email"
            type="email"
            defaultValue={student.email ?? ""}
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-phone">Téléphone *</Label>
            <Input
              id="edit-phone"
              name="phone"
              type="tel"
              defaultValue={student.phone}
              autoComplete="tel"
              required
              aria-invalid={Boolean(fieldErrors.phone)}
            />
            <FieldError message={fieldErrors.phone} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-status">Statut</Label>
            <Select name="status" defaultValue={student.status}>
              <SelectTrigger id="edit-status" className="w-full">
                <SelectValue placeholder="Sélectionner un statut" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.status} />
          </div>
        </div>

        {/* Date de naissance (facultative) — pré-remplit la variable
            {{birthDate}} des attestations et des certificats. */}
        <div className="grid gap-2">
          <Label htmlFor="edit-dateOfBirth">Date de naissance</Label>
          <Input
            id="edit-dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={toAttestationDateInputValue(student.dateOfBirth)}
            aria-invalid={Boolean(fieldErrors.dateOfBirth)}
          />
          <FieldError message={fieldErrors.dateOfBirth} />
        </div>

        {/* Classe / cohorte active + réinscription */}
        <fieldset className="rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Classe / Cohorte
          </legend>

          <div className="grid gap-2">
            <Label htmlFor="edit-classId">Classe active</Label>
            <Select
              name="classId"
              value={selectedClassId}
              onValueChange={handleClassChange}
            >
              <SelectTrigger id="edit-classId" className="w-full">
                <SelectValue placeholder="Aucune classe" />
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
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <LockKeyholeIcon className="size-3 shrink-0" />
                Frais appliqués :{" "}
                <strong className="font-semibold tabular-nums">
                  {selectedClass.tuitionFee?.toLocaleString("fr-FR") ?? "—"}{" "}
                  FCFA
                </strong>{" "}
                (coût total verrouillé sur cette classe).
              </p>
            ) : null}

            {/* Statut des frais d'inscription : réputés réglés hors système pour
                un étudiant hérité, encaissés à l'enregistrement sinon. */}
            {registrationFee > 0 && legacyBypass ? (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                Frais d&rsquo;inscription (
                <strong className="font-semibold tabular-nums">
                  {registrationFee.toLocaleString("fr-FR")} FCFA
                </strong>
                ) : considérés comme réglés hors système. Aucun montant ne sera
                ajouté à la caisse live.
              </p>
            ) : student.hasPaidRegistrationFee ? (
              <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" />
                Frais d&rsquo;inscription déjà réglés : une réinscription dans
                une nouvelle classe est gratuite (0 FCFA facturé).
              </p>
            ) : registrationFee > 0 ? (
              <p className="flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                <BadgeCheckIcon className="mt-0.5 size-3.5 shrink-0" />
                Frais d&rsquo;inscription uniques ({registrationFee.toLocaleString("fr-FR")}{" "}
                FCFA) seront ajoutés au coût total et encaissés à
                l&rsquo;enregistrement.
              </p>
            ) : null}

            {classes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aucune classe disponible : créez-en une depuis la page
                « Classes ».
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
              <Label htmlFor="edit-totalCost">Coût total (FCFA)</Label>
              <Input
                id="edit-totalCost"
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
              <Label htmlFor="edit-discountType">Type de réduction</Label>
              <Select
                name="discountType"
                value={discountType}
                onValueChange={(value) =>
                  setDiscountType(value as "FIXED" | "PERCENTAGE")
                }
              >
                <SelectTrigger id="edit-discountType" className="w-full">
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
              <Label htmlFor="edit-discount">
                Réduction{" "}
                {discountType === "PERCENTAGE" ? "(%)" : "(FCFA)"}
              </Label>
              <Input
                id="edit-discount"
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
              <Label htmlFor="edit-legacyPaidAmount">
                Paiements antérieurs hors système (FCFA)
              </Label>
              <Input
                id="edit-legacyPaidAmount"
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
                d&apos;EduFlow. Déduit du reste à payer, sans impact sur le
                journal de caisse actuel.
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
                  <Label htmlFor="edit-parentName">
                    Nom du parent / tuteur *
                  </Label>
                  <Input
                    id="edit-parentName"
                    name="parentName"
                    placeholder="Ex : Monsieur Traoré"
                    defaultValue={student.parentName ?? ""}
                    aria-invalid={Boolean(fieldErrors.parentName)}
                  />
                  <FieldError message={fieldErrors.parentName} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-parentRelation">
                    Lien avec l'étudiant
                  </Label>
                  <Select name="parentRelation" defaultValue={student.parentRelation ?? ""}>
                    <SelectTrigger id="edit-parentRelation" className="w-full">
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
                  <Label htmlFor="edit-parentPhone1">
                    Téléphone principal du parent *
                  </Label>
                  <Input
                    id="edit-parentPhone1"
                    name="parentPhone1"
                    type="tel"
                    placeholder="Ex : +225 05 00 00 00 10"
                    autoComplete="tel"
                    defaultValue={student.parentPhone1 ?? ""}
                    aria-invalid={Boolean(fieldErrors.parentPhone1)}
                  />
                  <FieldError message={fieldErrors.parentPhone1} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-parentPhone2">
                    Téléphone secondaire (optionnel)
                  </Label>
                  <Input
                    id="edit-parentPhone2"
                    name="parentPhone2"
                    type="tel"
                    placeholder="Ex : +225 05 00 00 00 11"
                    autoComplete="tel"
                    defaultValue={student.parentPhone2 ?? ""}
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
 * Modale d'édition pré-remplie d'un étudiant.
 * Contrôlée par la vue parente (`open` + `onOpenChange`) ; le contenu est
 * remonté à chaque changement d'entité grâce à la clé React.
 */
export function EditStudentDialog({
  student,
  classes,
  registrationFee,
  open,
  onOpenChange,
  canEditStatus = false,
}: {
  student: StudentDTO | null;
  /** Classes / cohortes disponibles pour l'affectation. */
  classes: ClassOptionDTO[];
  /** Frais d'inscription par défaut de l'organisation (FCFA). */
  registrationFee: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Autorise le positionnement d'un statut (modale admin d'édition). */
  canEditStatus?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {student ? (
          <EditStudentForm
            key={student.id}
            student={student}
            classes={classes}
            registrationFee={registrationFee}
            canEditStatus={canEditStatus}
            onSuccess={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}