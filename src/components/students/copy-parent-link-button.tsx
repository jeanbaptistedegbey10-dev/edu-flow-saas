"use client";

import { LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Bouton client dédié à la copie du lien parent dans le presse-papiers.
 * Les gestionnaires d'événements (`onClick`) ne peuvent pas être passés
 * depuis un Server Component — ce comportement interactif doit vivre
 * dans un Client Component.
 */
export function CopyParentLinkButton({ url }: { url: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            /* presse-papiers indisponible */
          }
        })();
      }}
    >
      <LinkIcon className="size-4" />
      Copier le lien parent
    </Button>
  );
}