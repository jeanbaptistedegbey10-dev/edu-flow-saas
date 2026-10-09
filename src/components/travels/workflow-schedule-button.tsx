"use client";

import * as React from "react";
import { CalendarClockIcon } from "lucide-react";

import {
  getWorkflowScheduleTemplate,
  saveWorkflowScheduleTemplate,
  type ScheduleTemplateItemInput,
} from "@/lib/actions/schedules";
import { ScheduleEditorDialog } from "@/components/payments/schedule-editor-dialog";
import { Button } from "@/components/ui/button";

/**
 * Bouton « Échéancier » rattaché à un modèle de procédure voyage. Charge le
 * modèle d'échéancier par défaut du workflow (généré à la création) et ouvre
 * l'éditeur permettant de personnaliser tranches, montants et délais.
 *
 * Les dossiers candidats rattachés à ce workflow répliqueront ce modèle à
 * l'activation (ouverture du dossier / démarrage).
 */
export function WorkflowScheduleButton({
  workflowId,
  workflowLabel,
  baseCost,
}: {
  workflowId: string;
  workflowLabel: string;
  baseCost: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<ScheduleTemplateItemInput[]>([]);
  const [intervalDays, setIntervalDays] = React.useState(30);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    try {
      const template = await getWorkflowScheduleTemplate(workflowId);
      if (template && template.items.length > 0) {
        setItems(
          template.items.map((i) => ({ amount: i.amount, offsetDays: i.offsetDays }))
        );
        setIntervalDays(template.intervalDays);
      } else {
        // Repli : découpe simple en 3 parts égales (convention du module voyage).
        const base = Math.floor(baseCost / 3);
        setItems([
          { amount: base, offsetDays: 0 },
          { amount: base, offsetDays: 30 },
          { amount: Math.max(baseCost - base * 2, 0), offsetDays: 60 },
        ]);
        setIntervalDays(30);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleOpen}
        disabled={baseCost <= 0}
        title={baseCost <= 0 ? "Définissez d'abord un coût de base" : undefined}
      >
        <CalendarClockIcon data-icon="inline-start" />
        Échéancier de paiement
      </Button>

      <ScheduleEditorDialog
        open={open}
        onOpenChange={setOpen}
        title={`Échéancier — ${workflowLabel}`}
        description="Découpez le coût de base en plusieurs tranches. La somme des tranches doit égaler le coût de la procédure."
        totalAmount={baseCost}
        initialItems={items}
        initialIntervalDays={intervalDays}
        onSave={async (payload) => {
          const result = await saveWorkflowScheduleTemplate({
            workflowId,
            intervalDays: payload.intervalDays,
            items: payload.items,
          });
          return result;
        }}
      />
      {loading ? <span className="sr-only">Chargement…</span> : null}
    </>
  );
}
