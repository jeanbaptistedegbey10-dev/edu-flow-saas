"use client";

import * as React from "react";
import { CalendarClockIcon } from "lucide-react";

import {
  getCourseScheduleTemplate,
  saveCourseScheduleTemplate,
  type ScheduleTemplateItemInput,
} from "@/lib/actions/schedules";
import { ScheduleEditorDialog } from "@/components/payments/schedule-editor-dialog";
import { Button } from "@/components/ui/button";

/**
 * Bouton « Échéancier » rattaché à un cours. Charge le modèle d'échéancier par
 * défaut du cours (généré automatiquement à la création) et ouvre l'éditeur
 * permettant de personnaliser le nombre de tranches, leurs montants et délais.
 *
 * Auto-suffisant : isole son état (chargement, édition) pour être posé sur la
 * carte du cours sans alourdir la vue liste.
 */
export function CourseScheduleButton({
  courseId,
  courseTitle,
  coursePrice,
}: {
  courseId: string;
  courseTitle: string;
  coursePrice: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<ScheduleTemplateItemInput[]>([]);
  const [intervalDays, setIntervalDays] = React.useState(30);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    try {
      const template = await getCourseScheduleTemplate(courseId);
      if (template && template.items.length > 0) {
        setItems(
          template.items.map((i) => ({ amount: i.amount, offsetDays: i.offsetDays }))
        );
        setIntervalDays(template.intervalDays);
      } else {
        // Repli : découpe simple en 3 parts égales si aucun modèle n'existe.
        const base = Math.floor(coursePrice / 3);
        setItems([
          { amount: base, offsetDays: 0 },
          { amount: base, offsetDays: 30 },
          { amount: Math.max(coursePrice - base * 2, 0), offsetDays: 60 },
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
      >
        <CalendarClockIcon data-icon="inline-start" />
        Échéancier de paiement
      </Button>

      <ScheduleEditorDialog
        open={open}
        onOpenChange={setOpen}
        title={`Échéancier — ${courseTitle}`}
        description="Découpez les frais de scolarité en plusieurs tranches. La somme des tranches doit égaler le prix du cours."
        totalAmount={coursePrice}
        initialItems={items}
        initialIntervalDays={intervalDays}
        onSave={async (payload) => {
          const result = await saveCourseScheduleTemplate({
            courseId,
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
