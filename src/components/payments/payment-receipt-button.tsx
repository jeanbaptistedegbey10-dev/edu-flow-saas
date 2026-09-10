"use client";

import * as React from "react";
import { DownloadIcon } from "lucide-react";

import type { StudentPaymentDTO } from "@/actions/students";
import type { OrganizationProfileDTO } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import {
  buildPaymentReceiptDocument,
  printHtmlDocument,
} from "@/lib/receipt";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";

/**
 * Bouton « PDF Reçu » d'une ligne de règlement (fiche étudiant) : génère à la
 * volée le reçu imprimable du paiement et ouvre la boîte d'impression du
 * navigateur, où l'administration peut enregistrer le document en PDF
 * (« Destination : Enregistrer au format PDF »).
 *
 * Composant client : l'impression repose sur `window.print()` via un iframe
 * caché (même mécanique que la modale de reçu de la section Paiements).
 */
export function PaymentReceiptButton({
  payment,
  student,
  organization,
}: {
  payment: StudentPaymentDTO;
  /** Identité de l'étudiant, nécessaire à l'en-tête du reçu. */
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  };
  organization: OrganizationProfileDTO;
}) {
  const handleClick = React.useCallback(() => {
    // `StudentPaymentDTO` porte les mêmes champs que `PaymentDTO` (hors
    // relation étudiant, fournie ici via la fiche courante). Les enums
    // Prisma arrivent sérialisés en `string` depuis le composant serveur.
    const receiptPayment = {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.paymentMethod as PaymentMethod,
      status: payment.status as PaymentStatus,
      isVoided: payment.isVoided,
      reference: payment.reference,
      description: payment.description,
      paidAt: payment.paidAt,
      createdAt: payment.paidAt,
      student: {
        id: student.id,
        studentCode: student.studentCode,
        firstName: student.firstName,
        lastName: student.lastName,
      },
    };

    printHtmlDocument(buildPaymentReceiptDocument(receiptPayment, organization));
  }, [payment, student, organization]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-foreground"
      title="PDF Reçu"
      aria-label="Télécharger le reçu PDF"
      onClick={handleClick}
    >
      <DownloadIcon className="size-4" />
    </Button>
  );
}
