"use client";

import * as React from "react";
import { LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToastNotification } from "@/components/ui/toast";

/**
 * Bouton client dédié à la copie du lien parent dans le presse-papiers.
 * Les gestionnaires d'événements (`onClick`) ne peuvent pas être passés
 * depuis un Server Component — ce comportement interactif doit vivre
 * dans un Client Component.
 *
 * Après la copie, une notification « Lien parent copié dans le presse-papier ! »
 * confirme l'action à l'utilisateur.
 */
export function CopyParentLinkButton({ url }: { url: string }) {
  const [toast, setToast] = React.useState<string | null>(null);

  const copyToClipboard = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Repli : sélection manuelle possible via la zone affichée.
      return false;
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          void (async () => {
            const copied = await copyToClipboard();
            setToast(
              copied
                ? "Lien parent copié dans le presse-papier !"
                : "Copie impossible : copiez le lien affiché manuellement."
            );
          })();
        }}
      >
        <LinkIcon className="size-4" />
        Copier le lien parent
      </Button>

      <ToastNotification
        message={toast}
        tone={toast?.startsWith("Copie") ? "error" : "success"}
        onClose={() => setToast(null)}
      />
    </>
  );
}