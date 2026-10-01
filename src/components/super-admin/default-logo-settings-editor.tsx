"use client";

import * as React from "react";
import {
  CropIcon,
  ImagePlusIcon,
  Loader2Icon,
  RotateCcwIcon,
  SaveIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  updateDefaultOrganizationLogoAction,
  type UpdateDefaultLogoFormState,
} from "@/actions/super-admin";
import {
  LOGO_MAX_VALUE_LENGTH,
  LogoCropperDialog,
} from "@/components/organization/logo-cropper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: UpdateDefaultLogoFormState = { status: "idle" };

const SUCCESS_ALERT_CLASS =
  "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";

const ERROR_ALERT_CLASS =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400";

const INFO_ALERT_CLASS =
  "rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300";

/** Taille maximale du fichier source accepté à l'import (octets). */
const LOGO_MAX_INPUT_BYTES = 4 * 1024 * 1024;

/** Types MIME acceptés à l'import (contrôle réel via `file.type`). */
const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

/**
 * Éditeur du logo appliqué par défaut aux nouvelles organisations
 * (back-office Super-Admin → « Paramètres de la plateforme »).
 *
 * Le formulaire est piloté par `useActionState` vers la Server Action
 * `updateDefaultOrganizationLogoAction`. La valeur finale transite par un champ
 * caché `defaultLogoUrl` : une data URL issue d'un import est donc transmise
 * telle quelle, sans conversion serveur.
 */
export function DefaultLogoSettingsEditor({
  configuredValue,
  effectiveValue,
  fallbackValue,
  isCustomized,
}: {
  /** Valeur enregistrée en base (vide si aucune configuration). */
  configuredValue: string;
  /** Valeur réellement appliquée (configuration valide, sinon repli). */
  effectiveValue: string;
  /** Logo EduFlow utilisé par défaut. */
  fallbackValue: string;
  /** `true` si une valeur personnalisée est active. */
  isCustomized: boolean;
}) {
  const [state, formAction, isPending] = React.useActionState(
    updateDefaultOrganizationLogoAction,
    INITIAL_STATE
  );

  const [value, setValue] = React.useState(configuredValue);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  /** Source transmise au rogneur ; `null` = modale fermée. */
  const [cropSource, setCropSource] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** Object URL courant ouvert pour le rogneur (à révoquer en fermant). */
  const cropObjectUrlRef = React.useRef<string | null>(null);

  // Resynchronise le champ avec la valeur renvoyée par le serveur après
  // enregistrement (ou réinitialisation). Ajustement PENDANT le rendu —
  // pattern React « ajuster l'état quand une prop change », déjà utilisé par
  // `LogoCropperDialog` — plutôt qu'un effet, qui déclencherait un rendu en
  // cascade.
  const [lastConfiguredValue, setLastConfiguredValue] =
    React.useState(configuredValue);

  if (configuredValue !== lastConfiguredValue) {
    setLastConfiguredValue(configuredValue);
    setValue(configuredValue);
  }

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
        "L'image reste trop volumineuse après recadrage. Essayez un cadrage plus serré."
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
   * Import d'un fichier local : contrôle du type MIME et du poids, puis
   * ouverture du rogneur interactif pour produire un PNG allégé.
   */
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    // Permet de réimporter le même fichier consécutivement.
    event.target.value = "";
    if (!file) return;

    setLocalError(null);
    setIsProcessing(true);

    try {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setLocalError("Format non pris en charge (PNG, JPEG, GIF, WebP ou SVG).");
        return;
      }

      if (file.size > LOGO_MAX_INPUT_BYTES) {
        setLocalError("L'image dépasse 4 Mo. Choisissez un fichier plus léger.");
        return;
      }

      openCropper(URL.createObjectURL(file));
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : "Import du logo impossible."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /** Aperçu affiché : valeur saisie, sinon logo effectivement appliqué. */
  const previewSource = value || effectiveValue || fallbackValue;

  return (
    <form action={formAction} className="space-y-6">
      {state.status === "success" && state.message ? (
        <p role="status" className={SUCCESS_ALERT_CLASS}>
          {state.message}
        </p>
      ) : null}

      {state.status === "error" && state.message ? (
        <p role="alert" className={ERROR_ALERT_CLASS}>
          {state.message}
        </p>
      ) : null}

      <div className={INFO_ALERT_CLASS}>
        <strong>Portée :</strong> ce logo est appliqué automatiquement à chaque
        nouvelle organisation (inscription Google et injection du jeu de
        démonstration). Les organisations existantes conservent leur logo
        actuel ; chaque administrateur peut le remplacer depuis son tableau de
        bord.
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        {/* Aperçu du logo actuellement appliqué */}
        <div className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL arbitraire (data: ou http(s)) non couverte par next/image sans config dédiée. */}
          <img
            src={previewSource}
            alt="Aperçu du logo par défaut"
            className="size-full object-contain p-2"
          />
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="default-logo-url">Logo par défaut</Label>
            {isCustomized ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <ShieldCheckIcon className="size-3" />
                Personnalisé
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Logo EduFlow par défaut ({fallbackValue})
              </span>
            )}
          </div>

          {/* Valeur transmise au serveur : data URL d'un import, ou URL saisie. */}
          <input type="hidden" name="defaultLogoUrl" value={value} />

          <Input
            id="default-logo-url"
            type="url"
            placeholder="https://exemple.com/logo.png"
            value={value.startsWith("data:") ? "" : value}
            onChange={(event) => {
              setLocalError(null);
              setValue(event.target.value.trim());
            }}
            aria-invalid={Boolean(localError)}
            disabled={isProcessing || isPending}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isProcessing || isPending}
              onClick={() => inputRef.current?.click()}
            >
              {isProcessing ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ImagePlusIcon data-icon="inline-start" />
              )}
              {isProcessing ? "Traitement..." : "Importer un fichier"}
            </Button>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Rogner à nouveau un logo déjà importé (data URL matricielle). */}
            {value.startsWith("data:image/") &&
            !value.startsWith("data:image/svg+xml") ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => openCropper(value)}
              >
                <CropIcon data-icon="inline-start" />
                Rogner
              </Button>
            ) : null}

            {/* Revenir au logo EduFlow sans enregistrer (champ vidé). */}
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={isPending}
                onClick={() => {
                  setLocalError(null);
                  setValue("");
                }}
              >
                <RotateCcwIcon data-icon="inline-start" />
                Retablir le logo EduFlow
              </Button>
            ) : null}
          </div>

          {localError ? (
            <p role="alert" className="text-sm text-destructive">
              {localError}
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Laissez le champ vide (ou cliquez sur « Retablir le logo EduFlow »
            puis enregistrez) pour utiliser à nouveau le logo par défaut de la
            plateforme.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending || isProcessing}>
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SaveIcon className="size-4" />
          )}
          Enregistrer
        </Button>
      </div>

      <LogoCropperDialog
        imageSrc={cropSource}
        onApplied={handleCroppedDataUrl}
        onClose={closeCropper}
      />
    </form>
  );
}
