"use client";

import * as React from "react";
import { PrinterIcon } from "lucide-react";

import type { OrganizationProfileDTO } from "@/actions/payments";
import type { SaleReceiptData } from "@/actions/pos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildSaleReceiptDocument,
  printHtmlDocument,
} from "@/lib/receipt";

/**
 * Modale d'aperçu de la facturette de caisse.
 * L'aperçu iframe utilise exactement le même document HTML que l'impression.
 *
 * Utilisée dans deux contextes :
 * - juste après l'encaissement (titre par défaut) ;
 * - réimpression depuis l'historique des ventes (titres dédiés).
 */
export function SaleReceiptDialog({
  sale,
  organization,
  open,
  onOpenChange,
  title = "Vente enregistrée — Facturette",
  description = "La vente a été encaissée avec succès. Imprimez la facturette ou enregistrez-la en PDF via la fenêtre d’impression du navigateur.",
}: {
  sale: SaleReceiptData | null;
  organization: OrganizationProfileDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Titre affiché en tête de modale (contexte encaissement / réimpression). */
  title?: string;
  /** Description affichée sous le titre. */
  description?: string;
}) {
  const documentHtml = React.useMemo(() => {
    return sale ? buildSaleReceiptDocument(sale, organization) : "";
  }, [sale, organization]);

  /** Adapte la hauteur de l'aperçu à la hauteur réelle du contenu. */
  const handlePreviewLoad = (
    event: React.SyntheticEvent<HTMLIFrameElement>
  ) => {
    const frame = event.currentTarget;
    const doc = frame.contentDocument;

    if (!doc?.documentElement) return;

    const contentHeight = doc.documentElement.scrollHeight;

    if (contentHeight > 0) {
      frame.style.height = `${Math.min(Math.max(contentHeight, 320), 520)}px`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {sale ? (
          <div className="rounded-md border bg-muted/40 p-3">
            <iframe
              title={`Facturette ${sale.id}`}
              srcDoc={documentHtml}
              onLoad={handlePreviewLoad}
              className="h-[380px] w-full rounded-md border bg-white"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fermer
          </Button>
          <Button
            type="button"
            onClick={() => printHtmlDocument(documentHtml)}
            disabled={!sale}
          >
            <PrinterIcon data-icon="inline-start" />
            Imprimer / Reçu PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}