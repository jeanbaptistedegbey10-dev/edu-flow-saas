"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Building2Icon,
  CalendarIcon,
  CropIcon,
  GlobeIcon,
  ImagePlusIcon,
  LandmarkIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SaveIcon,
  Trash2Icon,
  UsersRoundIcon,
} from "lucide-react";

import {
  updateOrganizationAction,
  type OrganizationFormState,
  type OrganizationInfoDTO,
  type OrganizationMemberDTO,
} from "@/actions/organization";
import {
  LOGO_MAX_VALUE_LENGTH,
  LogoCropperDialog,
} from "@/components/organization/logo-cropper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getRoleBadgeClass, getRoleLabel } from "@/lib/role";
import { CERTIFICATE_TEMPLATE_VARIABLES } from "@/lib/certificate-shared";
import {
  CERTIFICATE_TEMPLATES,
  CERTIFICATE_TEMPLATE_DESCRIPTIONS,
  CERTIFICATE_TEMPLATE_LABELS,
  normalizeCertificateTemplate,
} from "@/lib/certificate-template";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const INITIAL_FORM_STATE: OrganizationFormState = { status: "idle" };

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/** Initiales affichées dans l'avatar rond des membres. */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

// --------------------------------------
// Logo de l'organisation
// --------------------------------------

/** Taille maximale du fichier source accepté à l'upload (octets). */
const LOGO_MAX_INPUT_BYTES = 4 * 1024 * 1024;

/**
 * Lit un fichier SVG et le convertit en data URL. Les SVG ne passent pas
 * par le rogneur (dessin canvas peu fiable) : ils sont conservés tels
 * quels, comme les URLs http(s) saisies manuellement.
 */
async function readSvgFileAsDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

/**
 * Champ « Logo » du formulaire : aperçu instantané, saisie d'URL externe ou
 * import d'un fichier local (redimensionné puis encodé en data URL avant
 * envoi). La valeur finale transite par le champ caché `logoUrl`.
 */
function LogoField({
  defaultValue,
  error,
}: {
  defaultValue: string | null;
  error?: string;
}) {
  const [value, setValue] = React.useState(defaultValue ?? "");
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  /** Source transmise au rogneur ; `null` = modale fermée. */
  const [cropSource, setCropSource] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** Object URL courant ouvert pour le rogneur (à révoquer en fermant). */
  const cropObjectUrlRef = React.useRef<string | null>(null);

  /** Ouvre le rogneur sur une image (object URL ou data URL). */
  const openCropper = (source: string) => {
    const previous = cropObjectUrlRef.current;
    if (previous && previous !== source) {
      URL.revokeObjectURL(previous);
    }
    cropObjectUrlRef.current = source.startsWith("blob:") ? source : null;
    setCropSource(source);
  };

  /** Ferme le rogneur sans appliquer de recadrage. */
  const closeCropper = React.useCallback(() => {
    if (cropObjectUrlRef.current) {
      URL.revokeObjectURL(cropObjectUrlRef.current);
      cropObjectUrlRef.current = null;
    }
    setCropSource(null);
  }, []);

  /** Recadrage validé : contrôle du poids puis mise à jour de la valeur. */
  const handleCroppedDataUrl = (dataUrl: string) => {
    closeCropper();

    if (dataUrl.length > LOGO_MAX_VALUE_LENGTH) {
      setLocalError(
        "L’image reste trop volumineuse après recadrage. Essayez un cadrage plus resserré ou un visuel plus simple."
      );
      return;
    }

    setLocalError(null);
    setValue(dataUrl);
  };

  // Nettoyage de l'object URL si le composant est démonté modale ouverte.
  React.useEffect(() => {
    return () => {
      if (cropObjectUrlRef.current) {
        URL.revokeObjectURL(cropObjectUrlRef.current);
        cropObjectUrlRef.current = null;
      }
    };
  }, []);

  /**
   * Import d'un fichier local : validation du type et du poids, puis SVG
   * converti directement en data URL ou ouverture du rogneur interactif
   * pour les images matricielles (PNG, JPEG, WebP, GIF).
   */
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setLocalError(null);
    setIsProcessing(true);

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Le fichier sélectionné n'est pas une image.");
      }

      if (file.size > LOGO_MAX_INPUT_BYTES) {
        throw new Error(
          "L'image dépasse 4 Mo. Choisissez un fichier plus léger."
        );
      }

      if (file.type === "image/svg+xml") {
        const dataUrl = await readSvgFileAsDataUrl(file);

        if (dataUrl.length > LOGO_MAX_VALUE_LENGTH) {
          setLocalError(
            "Le fichier SVG est trop volumineux. Essayez un visuel plus simple."
          );
          return;
        }

        setValue(dataUrl);
        return;
      }

      openCropper(URL.createObjectURL(file));
    } catch (cause) {
      setLocalError(
        cause instanceof Error
          ? cause.message
          : "Import du logo impossible."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor="organization-logo-url">Logo de l’entreprise</Label>

      <input type="hidden" name="logoUrl" value={value} />

      <div className="flex flex-wrap items-start gap-4">
        {/* Aperçu */}
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL arbitraire (data: ou http(s)) non couverte par next/image sans config dédiée.
            <img
              src={value}
              alt="Aperçu du logo"
              className="size-full object-contain"
            />
          ) : (
            <Building2Icon className="size-8 text-muted-foreground/50" />
          )}
        </div>

        <div className="grid min-w-0 flex-1 gap-2">
          <Input
            id="organization-logo-url"
            type="url"
            placeholder="https://exemple.com/logo.png"
            value={
              value.startsWith("data:") ? "" : value
            }
            onChange={(event) => {
              setLocalError(null);
              setValue(event.target.value.trim());
            }}
            aria-invalid={Boolean(error || localError)}
            disabled={isProcessing}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => inputRef.current?.click()}
            >
              {isProcessing ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ImagePlusIcon data-icon="inline-start" />
              )}
              {isProcessing ? "Traitement..." : "Importer un fichier"}
            </Button>

            {/* Rogner à nouveau un logo déjà importé (data URL matricielle). */}
            {value.startsWith("data:image/") &&
            !value.startsWith("data:image/svg+xml") ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openCropper(value)}
              >
                <CropIcon data-icon="inline-start" />
                Rogner
              </Button>
            ) : null}

            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setLocalError(null);
                  setValue("");
                }}
              >
                <Trash2Icon data-icon="inline-start" />
                Retirer
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Collez une URL d’image ou importez un fichier (PNG, JPEG, WebP,
            GIF ou SVG) : les images importées passent par un rogneur
            interactif (cadrage libre avec poignées ajustables, PNG
            transparent) avant enregistrement. Ce logo s’affiche dans
            l’en-tête du tableau de bord et sur tous les reçus et factures
            imprimables.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={handleFileChange}
      />

      <LogoCropperDialog
        imageSrc={cropSource}
        onApplied={handleCroppedDataUrl}
        onClose={closeCropper}
      />

      <FieldError message={error ?? localError ?? undefined} />
    </div>
  );
}

function OrganizationEditForm({ organization }: { organization: OrganizationInfoDTO }) {
  const [state, formAction, pending] = useActionState(
    updateOrganizationAction,
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      {state.message ? (
        <p
          role="alert"
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            state.status === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {state.message}
        </p>
      ) : null}

      {/* Identité visuelle : logo affiché dans le header et les reçus */}
      <div className="rounded-lg border bg-muted/20 p-4">
        <LogoField
          defaultValue={organization.logoUrl}
          error={fieldErrors.logoUrl}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="name">Nom de l’organisation *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={organization.name}
            maxLength={120}
            required
            aria-invalid={Boolean(fieldErrors.name)}
          />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={organization.email ?? ""}
            placeholder="contact@exemple.com"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={organization.phone ?? ""}
            placeholder="+229 00 00 00 00"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          <FieldError message={fieldErrors.phone} />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="address">Adresse</Label>
          <Input
            id="address"
            name="address"
            defaultValue={organization.address ?? ""}
            placeholder="Quartier, rue..."
            aria-invalid={Boolean(fieldErrors.address)}
          />
          <FieldError message={fieldErrors.address} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="city">Ville</Label>
          <Input
            id="city"
            name="city"
            defaultValue={organization.city ?? ""}
            placeholder="Cotonou"
            aria-invalid={Boolean(fieldErrors.city)}
          />
          <FieldError message={fieldErrors.city} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="website">Site web</Label>
          <Input
            id="website"
            name="website"
            defaultValue={organization.website ?? ""}
            placeholder="https://www.exemple.com"
            aria-invalid={Boolean(fieldErrors.website)}
          />
          <FieldError message={fieldErrors.website} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="rccm">N° RCCM</Label>
          <Input
            id="rccm"
            name="rccm"
            defaultValue={organization.rccm ?? ""}
            placeholder="RB/COT/24 A 12345"
            aria-invalid={Boolean(fieldErrors.rccm)}
          />
          <FieldError message={fieldErrors.rccm} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ifu">N° IFU / NIF</Label>
          <Input
            id="ifu"
            name="ifu"
            defaultValue={organization.ifu ?? ""}
            placeholder="3102412345678"
            aria-invalid={Boolean(fieldErrors.ifu)}
          />
          <FieldError message={fieldErrors.ifu} />
        </div>
      </div>

      {/* Paramétrage financier : frais d'inscription uniques */}
      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Paramètres financiers
        </legend>

        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="defaultRegistrationFee">
            Frais d’inscription par défaut (FCFA)
          </Label>
          <Input
            id="defaultRegistrationFee"
            name="defaultRegistrationFee"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            defaultValue={organization.defaultRegistrationFee}
            placeholder="Ex : 15000"
            aria-invalid={Boolean(fieldErrors.defaultRegistrationFee)}
          />
          <FieldError message={fieldErrors.defaultRegistrationFee} />
          <p className="text-xs text-muted-foreground">
            Montant facturé une seule fois lors de l’inscription d’un nouvel
            étudiant (une réinscription au sein du centre ne le facture pas à
            nouveau). Une recette correspondante est générée automatiquement.
          </p>
        </div>

        {/* Solde initial / solde de départ de la caisse (trésorerie) */}
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="initialCashBalance">
            Solde initial / Solde de départ (FCFA)
          </Label>
          <Input
            id="initialCashBalance"
            name="initialCashBalance"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            defaultValue={organization.initialCashBalance}
            placeholder="Ex : 250000"
            aria-invalid={Boolean(fieldErrors.initialCashBalance)}
          />
          <FieldError message={fieldErrors.initialCashBalance} />
          <p className="text-xs text-muted-foreground">
            Caisse disponible au moment de l’adoption du logiciel. Intégré au
            calcul de la trésorerie :{" "}
            <span className="font-medium">
              Solde total = Solde initial + Encaissements − Dépenses
            </span>{" "}
            (page « Trésorerie »).
          </p>
        </div>
      </fieldset>

      <p className="text-xs text-muted-foreground">
        Le logo, les mentions légales (RCCM, IFU / NIF), l’adresse et le site
        web sont repris automatiquement sur les reçus imprimables et leurs
        exports PDF.
      </p>

      {/* Politique de frais d'inscription */}
      <div className="space-y-3 pt-4 border-t">
        <div>
          <Label className="text-sm font-medium">
            Politique de frais d&apos;inscription
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            Quand les frais d&apos;inscription sont-ils factur&eacute;s ?
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-muted/40">
            <input
              type="radio"
              name="registrationFeePolicy"
              value="ONCE_PER_STUDENT"
              defaultChecked={organization.registrationFeePolicy === "ONCE_PER_STUDENT"}
              className="mt-0.5 shrink-0 accent-primary"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">
                Frais d&apos;inscription pay&eacute;s une seule fois par &eacute;tudiant
              </span>
              <span className="text-xs text-muted-foreground">
                Les frais sont factur&eacute;s uniquement &agrave; la premi&egrave;re inscription. Aucun nouveau frais pour les inscriptions suivantes.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-muted/40">
            <input
              type="radio"
              name="registrationFeePolicy"
              value="EVERY_NEW_ENROLLMENT"
              defaultChecked={organization.registrationFeePolicy === "EVERY_NEW_ENROLLMENT"}
              className="mt-0.5 shrink-0 accent-primary"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">
                Frais d&apos;inscription pay&eacute;s &agrave; chaque nouveau cours / nouvelle classe
              </span>
              <span className="text-xs text-muted-foreground">
                Les frais sont factur&eacute;s automatiquement &agrave; chaque nouvelle inscription dans un cours ou une classe diff&eacute;rente.
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Modèle graphique par défaut des certificats (Étape 3/3) */}
      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Certificats
        </legend>
        <div className="grid gap-2 sm:max-w-md">
          <Label htmlFor="certificateTemplate">Modèle de certificat par défaut</Label>
          <select
            id="certificateTemplate"
            name="certificateTemplate"
            defaultValue={normalizeCertificateTemplate(
              organization.certificateTemplate
            )}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
          >
            {CERTIFICATE_TEMPLATES.map((key) => (
              <option key={key} value={key}>
                {CERTIFICATE_TEMPLATE_LABELS[key]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {
              CERTIFICATE_TEMPLATE_DESCRIPTIONS[
                normalizeCertificateTemplate(organization.certificateTemplate)
              ]
            }
          </p>
          <p className="text-xs text-muted-foreground">
            Appliqué à l&apos;aperçu et à l&apos;impression des certificats
            (format A4 paysage, une seule page). Le logo, les mentions légales
            et le QR code de vérification y figurent automatiquement.
          </p>
        </div>

        <div className="mt-4 grid gap-2">
          <Label htmlFor="certificateTextTemplate">
            Texte personnalisé du certificat (optionnel)
          </Label>
          <Textarea
            id="certificateTextTemplate"
            name="certificateTextTemplate"
            rows={5}
            maxLength={2000}
            defaultValue={organization.certificateTextTemplate ?? ""}
            placeholder="Laissez vide pour utiliser le texte standard, ou rédigez le vôtre en insérant des variables, par exemple :
« Nous certifions que {{studentName}} (matricule {{matricule}}) a validé la formation {{courseName}} et atteint le niveau {{level}} ce {{date}}. »"
            aria-invalid={Boolean(fieldErrors.certificateTextTemplate)}
          />
          <FieldError message={fieldErrors.certificateTextTemplate} />
          <p className="text-xs text-muted-foreground">
            Laissez ce champ vide pour conserver la mise en page standard. En
            le remplissant, votre texte remplace le corps du certificat. Vous
            pouvez insérer les variables suivantes, remplacées automatiquement
            à la génération et automatiquement mises en gras pour bien
            ressortir au milieu du paragraphe :
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {CERTIFICATE_TEMPLATE_VARIABLES.map((variable) => (
              <li key={variable.token}>
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                  title={variable.label}
                >
                  {`{{${variable.token}}}`}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {pending ? "Enregistrement..." : "Enregistrer les modifications"}
        </Button>
      </div>
    </form>
  );
}

export function OrganizationView({
  organization,
  members,
}: {
  organization: OrganizationInfoDTO;
  members: OrganizationMemberDTO[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Organisation</h2>
          <p className="text-base text-muted-foreground">
            Consultez et gérez les informations de votre organisation et de
            ses membres.
          </p>
        </div>
      </div>

      {/* Carte d'identité de l'organisation */}
      <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
            {organization.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL arbitraire (data: ou http(s)) non couverte par next/image sans config dédiée.
              <img
                src={organization.logoUrl}
                alt={`Logo ${organization.name}`}
                className="size-full object-contain"
              />
            ) : (
              <Building2Icon className="size-7" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold tracking-tight">
              {organization.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {organization.slug} · membre
              {organization.memberCount > 1 ? "s" : ""} :{" "}
              {organization.memberCount}
            </p>
          </div>

          <div className="grid gap-1.5 text-sm text-muted-foreground sm:text-right">
            {organization.email ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <MailIcon className="size-4 shrink-0" aria-hidden="true" />
                {organization.email}
              </span>
            ) : null}
            {organization.phone ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <PhoneIcon className="size-4 shrink-0" aria-hidden="true" />
                {organization.phone}
              </span>
            ) : null}
            {organization.address || organization.city ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <MapPinIcon className="size-4 shrink-0" aria-hidden="true" />
                {[organization.address, organization.city]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            ) : null}
            {organization.website ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <GlobeIcon className="size-4 shrink-0" aria-hidden="true" />
                {organization.website}
              </span>
            ) : null}
            {organization.rccm ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <LandmarkIcon className="size-4 shrink-0" aria-hidden="true" />
                RCCM : {organization.rccm}
              </span>
            ) : null}
            {organization.ifu ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <LandmarkIcon className="size-4 shrink-0" aria-hidden="true" />
                IFU / NIF : {organization.ifu}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground">
          <CalendarIcon className="size-3.5" aria-hidden="true" />
          Organisation créée le{" "}
          {dateFormatter.format(organization.createdAt)}
        </div>
      </div>

      {/* Édition des informations */}
      <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-200">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Informations générales</h3>
          <p className="text-xs text-muted-foreground">
            Mettez à jour les coordonnées visibles par vos équipes.
          </p>
        </div>
        <div className="p-4 md:p-5">
          <OrganizationEditForm organization={organization} />
        </div>
      </div>

      {/* Liste des membres */}
      <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-200">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Membres de l’équipe</h3>
            <p className="text-xs text-muted-foreground">
              {members.length} membre{members.length > 1 ? "s" : ""} rattaché
              {members.length > 1 ? "s" : ""} à l’organisation.
            </p>
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <UsersRoundIcon className="size-5" />
          </div>
        </div>

        {members.length > 0 ? (
          <ul className="divide-y">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {getInitials(member.firstName, member.lastName)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 truncate text-sm font-medium">
                    {member.firstName} {member.lastName}
                    {!member.isActive ? (
                      <span
                        className={cn(
                          BADGE_BASE_CLASSES,
                          "border border-border bg-muted text-foreground dark:text-muted-foreground"
                        )}
                      >
                        Inactif
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </p>
                </div>

                <span
                  className={cn(
                    BADGE_BASE_CLASSES,
                    getRoleBadgeClass(member.role)
                  )}
                >
                  {getRoleLabel(member.role)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <UsersRoundIcon className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Aucun membre pour le moment</p>
          </div>
        )}
      </div>
    </div>
  );
}