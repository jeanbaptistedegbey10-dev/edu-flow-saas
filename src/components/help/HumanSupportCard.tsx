"use client";

import * as React from "react";
import {
  ClockIcon,
  MessageCircleIcon,
  PhoneIcon,
} from "lucide-react";

import {
  SUPPORT_CONTACT,
  buildWhatsAppUrl,
} from "@/data/helpKnowledgeBase";
import { cn } from "@/lib/utils";

/**
 * Carte d'escalade humaine de l'assistant d'aide.
 *
 * Affichée dans le fil de discussion quand l'utilisateur demande explicitement
 * un contact humain (« humain », « agent », « support », « téléphone »…) :
 * bouton WhatsApp direct avec message prérempli, ainsi que les numéros de
 * téléphone officiels d'EduFlow. Aucune adresse e-mail n'est exposée.
 */

type HumanSupportCardProps = {
  /** Contexte facultatif (sujet de la question) ajouté au message WhatsApp. */
  context?: string;
  className?: string;
};

export function HumanSupportCard({ context, className }: HumanSupportCardProps) {
  const whatsappUrl = buildWhatsAppUrl(context);

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-card/5 p-3 shadow-lg shadow-black/20",
        className,
      )}
    >
      {/* En-tête */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/30">
          <MessageCircleIcon className="size-4 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            Parler à un humain
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            L&apos;équipe EduFlow répond sous 24 h ouvrées.
          </p>
        </div>
      </div>

      {/* Bouton WhatsApp (message prérempli) */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Continuer la discussion sur WhatsApp"
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:brightness-110 active:scale-[0.98]"
      >
        <MessageCircleIcon className="size-4" />
        Continuer sur WhatsApp
      </a>

      {/* Coordonnées directes (aucune adresse e-mail exposée) */}
      <div className="mt-2.5 space-y-1.5">
        {SUPPORT_CONTACT.phones.map((phone) => (
          <a
            key={phone.telHref}
            href={phone.telHref}
            className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs text-slate-300 transition-colors hover:bg-card/5 hover:text-white"
          >
            <PhoneIcon className="size-3.5 shrink-0 text-mint-light" />
            <span className="truncate">{phone.display}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              ({phone.country})
            </span>
          </a>
        ))}
        <p className="flex items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground">
          <ClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
          {SUPPORT_CONTACT.hours}
        </p>
      </div>
    </div>
  );
}
