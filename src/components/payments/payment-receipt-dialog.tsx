"use client";

import * as React from "react";
import { PrinterIcon } from "lucide-react";

import type {
  OrganizationProfileDTO,
  PaymentDTO,
} from "@/actions/payments";
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
  buildPaymentReceiptDocument,
  printHtmlDocument,
} from "@/lib/receipt";

/**
 * Modale d'aperçu du reçu de paiement.
 *
 * L'aperçu est rendu dans un iframe chargé avec le même document HTML que
 * celui envoyé à l'impression : ce qui est affiché est strictement identique
 * au reçu imprimé ou enregistré en PDF.
 */
export function PaymentReceiptDialog({
  payment,
  organization,
  open,
  onOpenChange,
}: {
  payment: PaymentDTO | null;
  organization: OrganizationProfileDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const documentHtml = React.useMemo(() => {
    return payment ? buildPaymentReceiptDocument(payment, organization) : "";
  }, [payment, organization]);

  /** Adapte la hauteur de l'aperçu à la hauteur réelle du contenu du reçu. */
  const handlePreviewLoad = (
    event: React.SyntheticEvent<HTMLIFrameElement>
  ) => {
    const frame = event.currentTarget;
    const doc = frame.contentDocument;

    if (!doc?.documentElement) return;

    const contentHeight = doc.documentElement.scrollHeight;

    if (contentHeight > 0) {
      frame.style.height = `${Math.min(Math.max(contentHeight, 360), 560)}px`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aperçu du reçu de paiement</DialogTitle>
          <DialogDescription>
            Vérifiez les informations du règlement, puis imprimez le reçu ou
            enregistrez-le en PDF via la fenêtre d’impression du navigateur.
          </DialogDescription>
        </DialogHeader>

        {payment ? (
          <div className="rounded-md border bg-muted/40 p-3">
            <iframe
              title={`Reçu de paiement ${payment.reference ?? payment.id}`}
              srcDoc={documentHtml}
              onLoad={handlePreviewLoad}
              className="h-[420px] w-full rounded-md border bg-white"
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
            disabled={!payment}
          >
            <PrinterIcon data-icon="inline-start" />
            Imprimer / Reçu PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}