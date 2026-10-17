"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  BadgeCheckIcon,
  InfoIcon,
  Loader2Icon,
  LockKeyholeIcon,
  MessageCircleIcon,
  PlusIcon,
  UserPlusIcon,
} from "lucide-react";

import type { ClassOptionDTO } from "@/actions/classes";
import { createStudentAction, type StudentFormState } from "@/actions/students";
import type { StudentStatus } from "@prisma/client";
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
// Les statuts sont strictement limités à trois options produit :
// Prospect, Inscrit, Abandonné (voir src/lib/student-status.ts).
import { CANONICAL_STUDENT_STATUS_OPTIONS } from "@/lib/student-status";
// Cycle de vie des classes : seules les classes encore ouvertes
// (PLANIFIED / ACTIVE / IN_PROGRESS) reçoivent de nouvelles inscriptions.
import { filterSelectableClasses } from "@/lib/class-status";
import { cn } from "@/lib/utils";

/** Valeur sentinelle pour les champs Select optionnels (Radix interdit ""). */
const NONE_VALUE = "__none__";

/** Choix de paiement des frais d'inscription (statut « Inscrit » uniquement). */
type RegistrationFeePaymentChoice = "" | "PAYE" | "PAYE_HORS_SYSTEME";

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
  defaultStatus = "PROSPECT",
  trigger,
}: {
  /** Classes / cohortes disponibles pour l'affectation. */
  classes: ClassOptionDTO[];
  /** Frais d'inscription par défaut de l'organisation (FCFA). */
  registrationFee: number;
  /**
   * Statut présélectionné à l'ouverture de la modale (défaut : « Prospect »).
   * Utilisé par les raccourcis du tableau de bord (« Nouvel apprenant » →
   * ENROLLED, « Ajouter un prospect » → PROSPECT).
   */
  defaultStatus?: StudentStatus;
  /**
   * Bouton déclencheur personnalisé (raccourcis du tableau de bord). Absent :
   * le bouton par défaut « Nouvel étudiant » est rendu (page Étudiants).
   */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  // Clé de session du dialogue : incrémentée à chaque fermeture pour
  // remonter un contenu frais à la prochaine ouverture (réinitialise
  // `useActionState` + tous les champs, y compris le panneau WhatsApp).
  const [dialogKey, setDialogKey] = React.useState(0);

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
  // Statut sélectionné (contrôlé) : conditionne l'affichage du champ obligatoire
  // « Frais d'inscription » (visible uniquement pour le statut « Inscrit »).
  // Initialisé — puis réinitialisé après succès — au statut par défaut du
  // contexte d'appel (`defaultStatus`).
  const [statusValue, setStatusValue] =
    React.useState<StudentStatus>(defaultStatus);
  // Statut de paiement des frais d'inscription : « Payé » (recette créée dans
  // le système) ou « Payé hors système » (aucune écriture comptable).
  const [registrationFeePayment, setRegistrationFeePayment] =
    React.useState<RegistrationFeePaymentChoice>("");
  // Panneau de confirmation WhatsApp post-inscription : masqué après clic
  // « Passer » pour retrouver le formulaire (sans fermer la modale).
  const [shareDismissed, setShareDismissed] = React.useState(false);

    // useActionState conserve l'état du formulaire (y compris les saisies
  // utilisateur) entre les re-renders : les inputs non contrôlés conservent
  // leurs valeurs tant que la modale reste ouverte, et le state ne se met à
  // jour qu'avec le résultat de l'action serveur (erreurs détaillées incluses).
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

      // En cas d'erreur, la modale reste ouverte et les saisies utilisateur
      // sont préservées (inputs non contrôlés + state React stable). En cas
      // de succès, la modale reste OUVERTE sur le panneau de confirmation
      // WhatsApp (aucune fermeture auto) : l'utilisateur partage le reçu puis
      // ferme manuellement.
      if (result.status === "error") {
        setShareDismissed(false);
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};
  const errorMessage =
    state.status === "error" && state.message ? state.message : undefined;

  // Confirmation post-inscription : résumé + partage WhatsApp rapide
  // (`https://wa.me/?text=...`). Remplace l'ancien e-mail automatique
  // (Resend / React-Email supprimé) : l'entreprise envoie le reçu au candidat
  // en un clic, sans quitter le parcours d'inscription.
  const whatsappShareUrl =
    state.status === "success" ? state.whatsappShareUrl : undefined;
  const whatsappShareText =
    state.status === "success" ? state.whatsappShareText : undefined;
  const successMessage =
    state.status === "success" && state.message ? state.message : undefined;
  const showSharePanel = Boolean(
    state.status === "success" && whatsappShareUrl && !shareDismissed
  );

  const resetFormFields = React.useCallback(() => {
    setSelectedClassId(NONE_VALUE);
    setDiscountType("FIXED");
    setTotalCost("");
    setDiscount("");
    setLegacyExcluded(true);
    setLegacyPaidAmountInput("");
    setStatusValue(defaultStatus);
    setRegistrationFeePayment("");
    setIsSelfFinanced(false);
    setShareDismissed(false);
  }, [defaultStatus]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetFormFields();
      setDialogKey((k) => k + 1);
    }
  };

  const handleCloseAfterShare = () => {
    setOpen(false);
    resetFormFields();
  };

  const selectedClass = classes.find((klass) => klass.id === selectedClassId);
  const classFeeLocked = selectedClass !== null;

  // Classes éligibles à une nouvelle inscription : on exclut les classes
  // clôturées (COMPLETED) et archivées (ARCHIVED) — seules les classes
  // planifiées ou en cours (PLANIFIED / ACTIVE / IN_PROGRESS) restent
  // ouvertes aux inscriptions (voir `SELECTABLE_CLASS_STATUSES`).
  const selectableClasses = React.useMemo(
    () => filterSelectableClasses(classes),
    [classes]
  );

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

  // Les frais d'inscription sont facturés UNIQUEMENT au statut « Inscrit » :
  // le champ « Frais d'inscription (15 000 FCFA) » est alors obligatoire.
  const requiresRegistrationFee =
    statusValue === "ENROLLED" && registrationFee > 0;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PlusIcon data-icon="inline-start" />
            Nouvel étudiant
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un étudiant</DialogTitle>
          <DialogDescription>
            Renseignez les informations du nouvel étudiant. Le code étudiant est
            généré automatiquement.
          </DialogDescription>
        </DialogHeader>

        {showSharePanel && whatsappShareUrl ? (
          <div className="grid gap-4 py-2" role="status">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <BadgeCheckIcon
                className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <div className="grid gap-1">
                <p className="font-medium text-emerald-900 dark:text-emerald-100">
                  {successMessage ?? "Étudiant créé avec succès."}
                </p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
                  Aucun e-mail automatique n&apos;est envoyé. Partagez le reçu
                  ou le message de confirmation directement au candidat via
                  WhatsApp.
                </p>
              </div>
            </div>

            {whatsappShareText ? (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Résumé de l&apos;inscription
                </p>
                <p className="rounded-lg border bg-muted/50 p-3 text-sm whitespace-pre-line">
                  {whatsappShareText}
                </p>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShareDismissed(true)}
              >
                Passer
              </Button>
              <Button type="button" variant="outline" onClick={handleCloseAfterShare}>
                Fermer
              </Button>
              <Button type="button" asChild>
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircleIcon data-icon="inline-start" />
                  Partager via WhatsApp
                </a>
              </Button>
            </div>
          </div>
        ) : (
        <form
          key={dialogKey}
          action={formAction}
          className="grid max-h-[70vh] gap-4 overflow-y-auto pr-2"
        >
          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
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
              <Select
                name="status"
                value={statusValue}
                onValueChange={(value) => setStatusValue(value as StudentStatus)}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Sélectionner un statut" />
                </SelectTrigger>
                <SelectContent>
                  {CANONICAL_STUDENT_STATUS_OPTIONS.map((option) => (
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
            <Label htmlFor="dateOfBirth">Date de naissance</Label>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              aria-invalid={Boolean(fieldErrors.dateOfBirth)}
            />
            <FieldError message={fieldErrors.dateOfBirth} />
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
                  {selectableClasses.map((klass) => (
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
              {selectableClasses.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {classes.length === 0 ? (
                    <>
                      Aucune classe disponible : créez-en une depuis la page
                      « Classes » pour regrouper vos étudiants par cohorte et
                      créneau horaire.
                    </>
                  ) : (
                    <>
                      Aucune classe ouverte : seules les classes planifiées ou
                      en cours reçoivent de nouvelles inscriptions.
                      Réactivez ou recréez une classe depuis la page
                      « Classes ».
                    </>
                  )}
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

            {/* Frais d'inscription : champ OBLIGATOIRE dès que le statut est
                « Inscrit » — « Payé » crée une recette officielle dans le
                système (comptabilité / trésorerie), « Payé hors système »
                marque les frais comme réglés SANS écriture en caisse. */}
            {requiresRegistrationFee ? (
              <div className="grid gap-2 rounded-md border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/5">
                <Label htmlFor="registrationFeePayment">
                  Frais d&apos;inscription (
                  <span className="tabular-nums">
                    {registrationFee.toLocaleString("fr-FR")} FCFA
                  </span>
                  ) *
                </Label>
                <Select
                  name="registrationFeePayment"
                  value={registrationFeePayment}
                  onValueChange={(value) =>
                    setRegistrationFeePayment(
                      value as RegistrationFeePaymentChoice
                    )
                  }
                >
                  <SelectTrigger
                    id="registrationFeePayment"
                    className="w-full"
                    aria-invalid={Boolean(fieldErrors.registrationFeePayment)}
                  >
                    <SelectValue placeholder="-- Sélectionner le statut du paiement --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAYE">Payé</SelectItem>
                    <SelectItem value="PAYE_HORS_SYSTEME">
                      Payé hors système
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.registrationFeePayment} />
                {registrationFeePayment === "PAYE" ? (
                  <p className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                    <BadgeCheckIcon className="mt-0.5 size-3.5 shrink-0" />
                    Une recette officielle de{" "}
                    <strong className="font-semibold tabular-nums">
                      {registrationFee.toLocaleString("fr-FR")} FCFA
                    </strong>{" "}
                    sera créée dans le système (comptabilité et trésorerie).
                  </p>
                ) : registrationFeePayment === "PAYE_HORS_SYSTEME" ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                    Les frais seront marqués comme réglés sur la fiche de
                    l&apos;étudiant, sans aucune écriture dans le journal de
                    caisse.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sélection obligatoire : indiquez si les frais d&apos;inscription
                    ont été encaissés dans le système ou hors système.
                  </p>
                )}
              </div>
            ) : registrationFee > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Frais d&apos;inscription (
                  <strong className="font-semibold tabular-nums">
                    {registrationFee.toLocaleString("fr-FR")} FCFA
                  </strong>
                  ) applicables uniquement au statut « Inscrit » — aucun frais
                  ne sera facturé ici.
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
        )}
      </DialogContent>
    </Dialog>
  );
}