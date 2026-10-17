"use client";

import Link from "next/link";
import {
  LayersIcon,
  PlaneIcon,
  UserPlusIcon,
  UserRoundPlusIcon,
  WalletCardsIcon,
} from "lucide-react";

import type { ClassOptionDTO } from "@/actions/classes";
import { AddStudentDialog } from "@/components/students/add-student-dialog";
import { Button } from "@/components/ui/button";

/**
 * Raccourcis d'action rapide du tableau de bord (vue administrateur).
 *
 * - « Nouvel apprenant »   : ouvre la modale de création d'étudiant avec le
 *   statut « Inscrit » présélectionné ;
 * - « Nouveau paiement »   : redirige vers la caisse / Paiements
 *   (/dashboard/payments) où vit le formulaire d'enregistrement ;
 * - « Nouvelle classe »    : redirige vers /dashboard/classes (création via la
 *   modale « Nouvelle classe » de cette page) ;
 * - « Ajouter un prospect »: modale de création d'étudiant avec le statut
 *   « Prospect » présélectionné (raccourci de prospection direct) ;
 * - « Voyages »            : raccourci existant conservé vers le module.
 *
 * Les styles reprennent ceux des boutons d'action existants
 * (`variant="outline" size="sm"`, icône `data-icon="inline-start"`).
 */
export function DashboardQuickActions({
  classes,
  registrationFee,
}: {
  /** Classes / cohortes disponibles pour l'affectation du nouvel étudiant. */
  classes: ClassOptionDTO[];
  /** Frais d'inscription par défaut de l'organisation (FCFA). */
  registrationFee: number;
}) {
  return (
    <div
      role="group"
      aria-label="Actions rapides"
      className="flex flex-wrap items-center gap-2"
    >
      <AddStudentDialog
        classes={classes}
        registrationFee={registrationFee}
        defaultStatus="ENROLLED"
        trigger={
          <Button variant="outline" size="sm">
            <UserPlusIcon data-icon="inline-start" className="text-emerald-600 dark:text-emerald-400" />
            Nouvel apprenant
          </Button>
        }
      />

      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/payments">
          <WalletCardsIcon data-icon="inline-start" className="text-emerald-600 dark:text-emerald-400" />
          Nouveau paiement
        </Link>
      </Button>

      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/classes">
          <LayersIcon data-icon="inline-start" className="text-indigo-600 dark:text-indigo-400" />
          Nouvelle classe
        </Link>
      </Button>

      <AddStudentDialog
        classes={classes}
        registrationFee={registrationFee}
        defaultStatus="PROSPECT"
        trigger={
          <Button variant="outline" size="sm">
            <UserRoundPlusIcon data-icon="inline-start" className="text-sky-600 dark:text-sky-400" />
            Ajouter un prospect
          </Button>
        }
      />

      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/travels">
          <PlaneIcon data-icon="inline-start" className="text-violet-600 dark:text-violet-400" />
          Voyages
        </Link>
      </Button>
    </div>
  );
}
