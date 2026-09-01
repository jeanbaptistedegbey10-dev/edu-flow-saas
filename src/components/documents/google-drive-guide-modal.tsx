"use client";

import * as React from "react";
import {
  CloudCogIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// --------------------------------------
// Guide « Configurer mon Google Drive (Gratuit) »
// --------------------------------------
//
// Les documents EduFlow ne sont jamais hébergés sur le serveur web : ils
// vivent sur le stockage externe de l'établissement. Ce guide pas à pas
// permet à un administrateur non technique d'obtenir gratuitement une clé
// API Google Drive / Google Picker API et d'organiser son Drive selon
// l'arborescence attendue par EduFlow.

type GuideStep = {
  title: string;
  description: React.ReactNode;
};

const GUIDE_STEPS: GuideStep[] = [
  {
    title: "Connectez-vous avec un compte Google",
    description: (
      <>
        Un compte Gmail gratuit suffit (15 Go de stockage offerts, partagés
        entre Gmail, Drive et Photos). Créez de préférence un compte dédié à
        l&apos;établissement, par exemple{" "}
        <strong>documents@votre-centre.com</strong>.
      </>
    ),
  },
  {
    title: "Ouvrez Google Cloud Console et créez un projet",
    description: (
      <>
        Rendez-vous sur <strong>console.cloud.google.com</strong>, puis
        « Sélecteur de projet » → « Nouveau projet ». Nommez-le par exemple{" "}
        <strong>EduFlow Documents</strong>. La création est gratuite : aucune
        carte bancaire n&apos;est demandée pour l&apos;API Drive.
      </>
    ),
  },
  {
    title: "Activez la Google Drive API",
    description: (
      <>
        Dans le menu « API et services » → « Bibliothèque », recherchez{" "}
        <strong>Google Drive API</strong> puis cliquez sur{" "}
        <strong>Activer</strong>. Pour une sélection de fichiers assistée
        (facultatif), activez également <strong>Google Picker API</strong>.
      </>
    ),
  },
  {
    title: "Créez votre clé API (gratuite)",
    description: (
      <>
        Menu « API et services » → « Identifiants » → « Créer des
        identifiants » → <strong>Clé API</strong>. Copiez la clé et
        conservez-la : c&apos;est elle qui sera renseignée dans la
        configuration d&apos;EduFlow (variables d&apos;environnement) si vous
        branchez l&apos;intégration Drive avancée.
      </>
    ),
  },
];

const DRIVE_URL = "https://drive.google.com/drive/my-drive";
const CONSOLE_URL = "https://console.cloud.google.com/";

const GUIDE_STEPS_SUITE: GuideStep[] = [
  {
    title: "Sécurisez la clé (recommandé)",
    description: (
      <>
        Dans « Identifiants », modifiez la clé puis « Restrictions d&apos;API »
        → limitez-la à <strong>Google Drive API</strong> (et Picker API le cas
        échéant). Elle reste utilisable gratuitement dans la limite des quotas
        standards, très largement suffisante pour un centre de formation.
      </>
    ),
  },
  {
    title: "Préparez l'arborescence de classement",
    description: (
      <>
        Dans Google Drive, créez le dossier racine <strong>EduFlow</strong>,
        puis un sous-dossier par apprenant au format{" "}
        <strong>Nom Prénom</strong> et rangez-y chaque pièce. EduFlow vous
        propose automatiquement ce chemin à chaque ajout de document — il
        suffit de le reproduire.
      </>
    ),
  },
  {
    title: "Partagez les fichiers « par lien »",
    description: (
      <>
        Pour chaque document : clic droit → « Partager » → « Accès général » →{" "}
        <strong>Quiconque dispose du lien</strong> → <strong>Lecteur</strong>.
        Copiez le lien puis collez-le dans EduFlow : la pièce devient
        consultable depuis la fiche de l&apos;apprenant, sans jamais transiter
        par nos serveurs.
      </>
    ),
  },
];

/**
 * Modale-guide pas à pas « Configurer mon Google Drive (Gratuit) ».
 *
 * Le bouton déclencheur est personnalisable (`children`, `variant`, `size`)
 * afin d'être intégré aussi bien dans la modale d'ajout de document que dans
 * le pied de la section « Documents & pièces jointes ».
 */
export function GoogleDriveGuideModal({
  children,
  variant = "outline",
  size = "sm",
  className,
}: {
  /** Contenu du bouton déclencheur (icône + texte). */
  children?: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "xs";
  className?: string;
}) {
  const steps = [...GUIDE_STEPS, ...GUIDE_STEPS_SUITE];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className}>
          {children ?? (
            <>
              <CloudCogIcon data-icon="inline-start" />
              Configurer mon Google Drive (Gratuit)
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudCogIcon className="size-5 text-sky-600" />
            Configurer mon Google Drive (Gratuit)
          </DialogTitle>
          <DialogDescription>
            EduFlow n&apos;héberge aucun fichier : vos documents restent sur
            votre propre stockage externe, conservé gratuitement. Suivez ces
            7 étapes (≈ 10 minutes) pour préparer votre Google Drive et
            obtenir votre clé API.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
                {index + 1}
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-sm text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-start gap-2 rounded-md border border-sky-200/60 bg-sky-50 px-3 py-2.5 text-xs text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          L&apos;API Google Drive et la clé API sont gratuites : aucun
          abonnement, aucun coût de stockage côté EduFlow. Vos documents
          restent votre propriété et demeurent accessibles même en cas de
          résiliation.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <a href={DRIVE_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon data-icon="inline-start" />
              Ouvrir mon Google Drive
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer">
              <KeyRoundIcon data-icon="inline-start" />
              Ouvrir Google Cloud Console
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}