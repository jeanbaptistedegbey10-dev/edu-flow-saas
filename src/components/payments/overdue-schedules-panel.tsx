"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  MessageCircleIcon,
  MailIcon,
  PhoneIcon,
} from "lucide-react";

import type { OverdueScheduleDTO } from "@/lib/actions/schedules";
import { Button } from "@/components/ui/button";

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatAmount(value: number): string {
  return `${amountFormatter.format(value)} FCFA`;
}

function buildReminderMessage(schedule: OverdueScheduleDTO): string {
  return (
    `Bonjour, ceci est un rappel concernant le solde dû par ${schedule.studentName} ` +
    `(${schedule.studentCode}). ` +
    `Montant en retard : ${formatAmount(schedule.overdueAmount)} ` +
    `(${schedule.overdueInstallments} échéance(s) en attente). ` +
    `Merci de régulariser votre situation.`
  );
}

function buildWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/[\s+\-()]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

function buildMailtoLink(email: string, studentName: string, overdueAmount: number): string {
  const subject = encodeURIComponent(`Rappel - Solde dû par ${studentName}`);
  const body = encodeURIComponent(
    `Bonjour, ceci est un rappel concernant le solde dû par ${studentName}. ` +
    `Montant en retard : ${formatAmount(overdueAmount)}. ` +
    `Merci de régulariser votre situation.`
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

export function OverdueSchedulesPanel({
  overdueSchedules,
  overdueAmount,
}: {
  overdueSchedules: OverdueScheduleDTO[];
  overdueAmount: number;
}) {
  if (overdueSchedules.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-500/20 dark:bg-red-500/5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon className="size-4 text-red-600 dark:text-red-400" />
          <h3 className="font-semibold text-red-700 dark:text-red-300">
            Impayés & Échéances en retard
          </h3>
        </div>
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-bold text-red-700 dark:bg-red-500/20 dark:text-red-300">
          {formatAmount(overdueAmount)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-red-200/60 text-left text-xs uppercase text-red-600/70 dark:border-red-500/20 dark:text-red-400/70">
              <th className="px-3 py-2 font-medium">Étudiant</th>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium text-right">En retard</th>
              <th className="px-3 py-2 font-medium text-center">Échéances</th>
              <th className="px-3 py-2 font-medium">Plus ancienne</th>
              <th className="px-3 py-2 font-medium text-right">Relancer</th>
            </tr>
          </thead>
          <tbody>
            {overdueSchedules.map((schedule) => {
              const message = buildReminderMessage(schedule);
              return (
                <tr key={schedule.studentId} className="border-b border-red-100/50 last:border-0 dark:border-red-500/10">
                  <td className="px-3 py-2 font-medium">{schedule.studentName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{schedule.studentCode}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">
                    {formatAmount(schedule.overdueAmount)}
                  </td>
                  <td className="px-3 py-2 text-center">{schedule.overdueInstallments}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {schedule.oldestDueDate ? dateFormatter.format(schedule.oldestDueDate) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {schedule.studentPhone && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Relancer par WhatsApp"
                          title="Relancer par WhatsApp"
                          onClick={() => window.open(buildWhatsAppLink(schedule.studentPhone!, message), "_blank")}
                        >
                          <MessageCircleIcon className="size-3.5 text-emerald-600" />
                        </Button>
                      )}
                      {schedule.studentEmail && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Relancer par Email"
                          title="Relancer par Email"
                          onClick={() => (window.location.href = buildMailtoLink(schedule.studentEmail!, schedule.studentName, schedule.overdueAmount))}
                        >
                          <MailIcon className="size-3.5 text-blue-600" />
                        </Button>
                      )}
                      {!schedule.studentPhone && !schedule.studentEmail && (
                        <span className="text-xs text-muted-foreground">
                          <PhoneIcon className="inline size-3" /> Pas de contact
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}