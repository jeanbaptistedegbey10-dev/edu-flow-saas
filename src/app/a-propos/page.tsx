import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Handshake, Heart, ShieldCheck, Target } from "lucide-react";
import PageShell, { LegalSection } from "@/components/landing/page-shell";

export const metadata: Metadata = {
  title: "À propos - EduFlow",
  description:
    "Découvrez EduFlow : la plateforme qui accompagne les étudiants africains dans leur projet d'études à l'étranger. Un logiciel réalisé par Digital Infotech.",
};

/** Engagements structurants de la plateforme, presentation « glass card ». */
const VALUES = [
  {
    icon: Compass,
    title: "Vision",
    text: "Rendre l'accès aux études internationales concret et lisible pour chaque étudiant africain, quel que soit son pays d'origine et son budget.",
  },
  {
    icon: Target,
    title: "Mission",
    text: "Donner aux centres de formation et aux agences de mobilité les outils nécessaires pour suivre un étudiant du premier contact jusqu'à l'obtention de son visa.",
  },
  {
    icon: Heart,
    title: "Engagement",
    text: "Un accompagnement humain et personnalisé : chaque dossier est traité avec la même rigueur, qu'il s'agisse d'une formation intensive ou d'une inscription universitaire.",
  },
  {
    icon: ShieldCheck,
    title: "Confiance",
    text: "Des données hébergées et protégées conformément au RGPD, une information transparente et un support joignable en français.",
  },
] as const;

export default function AProposPage() {
  return (
    <PageShell
      badge="À propos d'EduFlow"
      title="EduFlow, né de l'accompagnement des étudiants africains"
      description="Notre mission : rendre le suivi des études à l'étranger simple, structuré et humain — de la première inscription jusqu'au départ."
    >
      <LegalSection title="1. Qui sommes-nous ?">
        <p>
          <strong className="text-white">EduFlow</strong> est une plateforme
          numérique conçue pour les centres de formation linguistiques et les
          agences de mobilité internationale d&apos;Afrique. Elle centralise
          le suivi pédagogique, administratif et financier des étudiants, et
          orchestre la procédure visa et immigration étape par étape.
        </p>
        <p>
          Le constat qui a donné naissance à EduFlow est simple : trop
          d&apos;étudiants africains préparent leurs études à l&apos;étranger
          dans des conditions difficiles, par manque d&apos;informations
          fiables, par désorganisation administrative et par des dossiers de
          visa qui se perdent faute de suivi. EduFlow répond à ce constat avec
          un outil unique, du dossier d&apos;inscription au billet
          d&apos;avion.
        </p>
      </LegalSection>

      <LegalSection title="2. Notre mission">
        <p>
          Notre mission est d&apos;accompagner les étudiants africains tout au
          long de leur parcours d&apos;études à l&apos;étranger, en rendant
          chaque étape visible, comprise et maîtrisée — pour eux, et pour les
          équipes qui les encadrent.
        </p>
        <ul className="list-disc list-inside space-y-1.5 marker:text-brand-light">
          <li>
            Centraliser le dossier de l&apos;étudiant : inscriptions, niveaux de
            langue, évaluations, notes et attestations ;
          </li>
          <li>
            Suivre la procédure visa et immigration avec des étapes claires, des
            rappels et une checklist documentaire ;
          </li>
          <li>
            Sécuriser le suivi financier : facturation, paiements par tranche,
            encaissements et reçus ;
          </li>
          <li>
            Donner à chaque étudiant un portail personnel pour suivre son
            emploi du temps, ses résultats et l&apos;avancement de son dossier.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Nos engagements">
        <div className="grid gap-4 pt-1 sm:grid-cols-2">
          {VALUES.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-brand-light" />
                <h3 className="text-sm font-semibold text-white">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-gray-300">{text}</p>
            </div>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="4. Réalisé par Digital Infotech">
        <p>
          <strong className="text-white">EduFlow</strong> est{" "}
          <strong className="text-white">
            conçu et développé par Digital Infotech
          </strong>
          , société de développement de logiciels basée à Cotonou, au Bénin.
          Digital Infotech conçoit des solutions numériques adaptées aux
          réalités des entreprises, des centres de formation et des structures
          éducatives africaines.
        </p>
        <p>
          Notre équipe met au point des produits utiles, pensés pour les
          utilisateurs qui les ont réellement en face d&apos;eux et pour les
          équipes opérationnelles qui doivent les faire vivre au quotidien. Le
          support d&apos;EduFlow est assuré en français, depuis le Bénin et le
          Togo.
        </p>
      </LegalSection>

      <LegalSection title="5. Parlons de votre centre">
        <p className="flex items-start gap-2">
          <Handshake className="mt-1 h-4 w-4 shrink-0 text-brand-light" />
          <span>
            Vous êtes un centre de formation ou une agence de mobilité ?
            Découvrez comment EduFlow peut transformer votre accompagnement, ou{" "}
            <Link href="/contact" className="text-brand-light hover:underline">
              contactez notre équipe
            </Link>{" "}
            pour obtenir une démonstration.
          </span>
        </p>
      </LegalSection>
    </PageShell>
  );
}