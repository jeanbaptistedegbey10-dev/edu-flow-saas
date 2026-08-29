"use client";

import * as React from "react";
import ReactCrop, { type Crop, type PercentCrop } from "react-image-crop";
import { CropIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Feuille de style du composant (poignées, liseré de sélection, règle des
// tiers) — fournie par react-image-crop.
import "react-image-crop/dist/ReactCrop.css";

// --------------------------------------
// Rogneur d'image (cropper) du logo
// --------------------------------------

/**
 * Taille maximale de la valeur stockée en base (longueur de la data URL /
 * de l'URL) — alignée sur la validation serveur. Le rogneur réduit
 * automatiquement l'export pour rester sous cette limite.
 */
export const LOGO_MAX_VALUE_LENGTH = 500_000;

/**
 * Facteur de réduction multiplicative appliqué à l'export tant que la data
 * URL dépasse la limite de stockage : le ratio et la transparence sont
 * préservés, seules les dimensions baissent.
 */
const EXPORT_DOWNSCALE_FACTOR = 0.8;

/** Nombre maximal d'itérations de réduction de l'export (garde-fou). */
const EXPORT_MAX_ATTEMPTS = 24;

/** Cadrage initial : toute l'image est sélectionnée, poignées prêtes. */
const FULL_IMAGE_CROP: PercentCrop = {
  unit: "%",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

/**
 * Fond en damier derrière l'image : matérialise visuellement la
 * transparence du PNG exporté autour du logo.
 */
const TRANSPARENCY_CHECKER_STYLE: React.CSSProperties = {
  backgroundImage: [
    "linear-gradient(45deg, #e5e7eb 25%, transparent 25%)",
    "linear-gradient(-45deg, #e5e7eb 25%, transparent 25%)",
    "linear-gradient(45deg, transparent 75%, #e5e7eb 75%)",
    "linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
  ].join(", "),
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

/** Libellés français des poignées (accessibilité clavier / lecteur d'écran). */
const CROP_ARIA_LABELS = {
  cropArea: "Zone de recadrage du logo",
  nwDragHandle: "Poignée du coin supérieur gauche",
  nDragHandle: "Poignée du côté supérieur",
  neDragHandle: "Poignée du coin supérieur droit",
  eDragHandle: "Poignée du côté droit",
  seDragHandle: "Poignée du coin inférieur droit",
  sDragHandle: "Poignée du côté inférieur",
  swDragHandle: "Poignée du coin inférieur gauche",
  wDragHandle: "Poignée du côté gauche",
};

type LogoCropperDialogProps = {
  /**
   * Source de l'image à rogner (object URL du fichier importé ou data URL
   * d'un logo existant) ; `null` signifie modale fermée.
   */
  imageSrc: string | null;
  /** Recadrage validé : reçoit la data URL PNG produite. */
  onApplied: (dataUrl: string) => void;
  /** Modale fermée sans appliquer de recadrage. */
  onClose: () => void;
};

/**
 * Modale de recadrage du logo : cadrage totalement libre façon capture
 * d'écran. La bibliothèque react-image-crop fournit les poignées sur les
 * 4 coins et les 4 côtés, sans ratio imposé (`aspect` non défini) —
 * l'utilisateur ajuste le cadre au pixel près autour du symbole et du
 * texte de son logo pour éliminer tout l'espace vide. La validation
 * exporte, via canvas, un PNG aux dimensions exactes de la sélection,
 * transparence préservée.
 */
export function LogoCropperDialog({
  imageSrc,
  onApplied,
  onClose,
}: LogoCropperDialogProps) {
  // Dernière source valide : maintient le contenu affiché pendant
  // l'animation de fermeture (imageSrc repasse à null immédiatement).
  // Synchronisation pendant le rendu — pattern React « ajuster l'état
  // quand une prop change » — plutôt que via un effet.
  const [lastSource, setLastSource] = React.useState<string | null>(imageSrc);

  if (imageSrc !== null && imageSrc !== lastSource) {
    setLastSource(imageSrc);
  }

  return (
    <Dialog
      open={imageSrc !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Rogner le logo</DialogTitle>
          <DialogDescription>
            Tracez ou ajustez librement le cadre avec les poignées (coins et
            côtés) pour éliminer les espaces vides : l’image est exportée aux
            dimensions exactes de la sélection, en PNG transparent.
          </DialogDescription>
        </DialogHeader>

        {lastSource ? (
          <LogoCropperSurface
            key={lastSource}
            imageSrc={lastSource}
            onApplied={onApplied}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Convertit la sélection (en % de l'image affichée) en rectangle exprimé en
 * pixels naturels de l'image : le PNG exporté couvre exactement la zone
 * délimitée, quelle que soit la taille d'affichage à l'écran.
 */
function getNaturalSelection(
  image: HTMLImageElement,
  crop: Crop | undefined
): { x: number; y: number; width: number; height: number } {
  // Sans sélection exploitable, l'image entière est exportée.
  const percent = crop ?? FULL_IMAGE_CROP;

  const x = Math.round((percent.x / 100) * image.naturalWidth);
  const y = Math.round((percent.y / 100) * image.naturalHeight);
  const width = Math.min(
    Math.max(1, Math.round((percent.width / 100) * image.naturalWidth)),
    image.naturalWidth - x
  );
  const height = Math.min(
    Math.max(1, Math.round((percent.height / 100) * image.naturalHeight)),
    image.naturalHeight - y
  );

  if (width < 1 || height < 1) {
    throw new Error("La zone sélectionnée est vide : élargissez le cadre.");
  }

  return { x, y, width, height };
}

/**
 * Exporte la sélection en PNG transparent : un premier rendu est produit aux
 * dimensions exactes de la sélection (pixels naturels de l'image source) ;
 * si la data URL dépasse la limite de stockage, l'export est répété en
 * réduisant proportionnellement le rendu jusqu'à passer sous la limite.
 */
function exportCroppedPng(
  image: HTMLImageElement,
  selection: { x: number; y: number; width: number; height: number }
): string {
  let scale = 1;

  for (let attempt = 0; attempt < EXPORT_MAX_ATTEMPTS; attempt += 1) {
    const width = Math.max(1, Math.round(selection.width * scale));
    const height = Math.max(1, Math.round(selection.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Traitement de l’image impossible sur ce navigateur.");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      0,
      0,
      width,
      height
    );

    const dataUrl = canvas.toDataURL("image/png");
    if (
      dataUrl.length <= LOGO_MAX_VALUE_LENGTH ||
      (width === 1 && height === 1)
    ) {
      return dataUrl;
    }

    scale *= EXPORT_DOWNSCALE_FACTOR;
  }

  throw new Error("Recadrage impossible : image trop volumineuse.");
}

/**
 * Surface interactive du rogneur (montée par source, via `key` : le cadrage
 * repart de zéro à chaque nouvelle image). Charge l'image affichée, gère la
 * sélection libre (react-image-crop) et la production du PNG final.
 */
function LogoCropperSurface({
  imageSrc,
  onApplied,
  onClose,
}: Omit<LogoCropperDialogProps, "imageSrc"> & { imageSrc: string }) {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Sélection courante, en pourcentage : résistante aux redimensionnements
  // de la fenêtre et convertie exactement en pixels naturels à l'export.
  const [crop, setCrop] = React.useState<Crop | undefined>(undefined);

  // Pendant le décodage : ni image chargée ni erreur signalée.
  const isLoading = !image && !loadError;

  /** Image décodée : cadrage initial = image entière (poignées prêtes). */
  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    setImage(event.currentTarget);
    setCrop(FULL_IMAGE_CROP);
  };

  /** Échec de décodage (fichier corrompu ou format non géré). */
  const handleImageError = () => {
    setImage(null);
    setLoadError(
      "Chargement de l’image impossible. Essayez un autre fichier."
    );
  };

  /** Réinitialise : toute l'image est à nouveau sélectionnée. */
  const handleReset = () => setCrop(FULL_IMAGE_CROP);

  /** Recadrage validé : export de la sélection en PNG (canvas). */
  const handleApply = () => {
    if (!image) return;

    try {
      const selection = getNaturalSelection(image, crop);
      onApplied(exportCroppedPng(image, selection));
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "Recadrage impossible."
      );
    }
  };

  return (
    <>
      <div className="grid gap-4">
        {/* Zone de cadrage : damier de transparence, image ajustée sans
            déformation (l'élément <img> reste la référence des coordonnées
            de sélection pour react-image-crop). */}
        <div
          className="relative mx-auto flex min-h-64 w-full max-w-full items-center justify-center overflow-hidden rounded-xl border p-2"
          style={TRANSPARENCY_CHECKER_STYLE}
        >
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            keepSelection
            minWidth={1}
            minHeight={1}
            ruleOfThirds
            className="max-w-full"
            ariaLabels={CROP_ARIA_LABELS}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- URL arbitraire (data: ou blob:) non couverte par next/image sans config dédiée. */}
            <img
              src={imageSrc}
              alt="Image à recadrer"
              onLoad={handleImageLoad}
              onError={handleImageError}
              draggable={false}
              className="block max-h-[45vh] w-auto max-w-full select-none"
            />
          </ReactCrop>

          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}

          {loadError ? (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-medium text-destructive">
              {loadError}
            </div>
          ) : null}
        </div>

        {image ? (
          <p className="text-xs text-muted-foreground">
            Glissez pour tracer un cadre ou ajustez les poignées (coins et
            côtés) au pixel près. Le logo est exporté aux dimensions exactes
            de la sélection, en PNG transparent.
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={handleReset}
          disabled={!image}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Réinitialiser
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button
          type="button"
          onClick={handleApply}
          disabled={!image || Boolean(loadError)}
        >
          <CropIcon data-icon="inline-start" />
          Appliquer le recadrage
        </Button>
      </DialogFooter>
    </>
  );
}
