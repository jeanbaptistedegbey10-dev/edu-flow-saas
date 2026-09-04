import type { Metadata } from "next";
import PageShell, { LegalSection } from "@/components/landing/page-shell";

export const metadata: Metadata = {
  title: "Conditions d'utilisation - EduFlow",
  description:
    "Conditions générales d'utilisation de la plateforme EduFlow : accès, compte utilisateur, abonnement, responsabilité et droit applicable.",
};

export default function ConditionsDUtilisationPage() {
  return (
    <PageShell
      badge="CGU"
      title="Conditions d'utilisation"
      description="Les règles encadrant l'accès et l'utilisation du site et de la plateforme EduFlow."
      updated="septembre 2026"
    >
      <LegalSection title="1. Objet">
        <p>
          Les présentes conditions générales d&apos;utilisation (ci-après
          « CGU ») définissent les modalités d&apos;accès et
          d&apos;utilisation du site et de la plateforme EduFlow, édités par
          Digital Infotech. Toute utilisation du service implique
          l&apos;acceptation pleine et entière des présentes CGU.
        </p>
      </LegalSection>

      <LegalSection title="2. Accès au service">
        <p>
          L&apos;accès à la plateforme nécessite la création d&apos;un compte.
          Une période d&apos;essai gratuit de 14 jours est proposée, puis
          l&apos;accès est soumis à la souscription de l&apos;une des formules
          disponibles (SaaS Cloud, Self-Hosted Docker, Desktop Offline).
        </p>
      </LegalSection>

      <LegalSection title="3. Compte utilisateur">
        <p>
          Vous vous engagez à fournir des informations exactes et à jour, à
          préserver la confidentialité de vos identifiants et à signaler sans
          délai toute utilisation frauduleuse. Vous êtes responsable de
          l&apos;activité réalisée depuis votre compte.
        </p>
      </LegalSection>

      <LegalSection title="4. Obligations de l'utilisateur">
        <ul className="list-disc list-inside space-y-1.5 marker:text-brand-light">
          <li>
            Utiliser le service conformément à sa destination et aux lois
            applicables ;
          </li>
          <li>
            Ne pas revendre, louer ou céder l&apos;accès au service sans accord
            écrit préalable ;
          </li>
          <li>
            Garantir que vous détenez les droits nécessaires sur les données
            (notamment personnelles) saisies dans la plateforme ;
          </li>
          <li>
            Ne pas tenter d&apos;accéder illégalement aux systèmes ou aux
            données d&apos;autres utilisateurs.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Abonnement et facturation">
        <p>
          Les formules sont facturées par période (première année, semestriel
          ou annuel) selon les tarifs en vigueur affichés sur le Site.
          L&apos;abonnement prend effet à compter de la validation du
          paiement.
        </p>
      </LegalSection>

      <LegalSection title="6. Propriété intellectuelle">
        <p>
          Digital Infotech concède une licence d&apos;utilisation du logiciel
          non exclusive, non transférable et limitée à la durée de
          l&apos;abonnement. Tous les droits non expressément accordés
          demeurent réservés.
        </p>
      </LegalSection>

      <LegalSection title="7. Disponibilité et support">
        <p>
          Digital Infotech s&apos;efforce d&apos;assurer une disponibilité
          optimale du service et réalise les opérations de maintenance
          nécessaires. Le support est assuré par email (et par téléphone pour
          la formule Self-Hosted) dans les conditions décrites dans le tableau
          comparatif de la page d&apos;accueil.
        </p>
      </LegalSection>

      <LegalSection title="8. Limitation de responsabilité">
        <p>
          Le service est fourni « en l&apos;état ». Digital Infotech ne
          garantit pas l&apos;absence totale d&apos;interruptions et ne saurait
          être tenue responsable des dommages indirects, notamment les pertes
          de données non imputables à sa faute ou les pertes
          d&apos;exploitation.
        </p>
      </LegalSection>

      <LegalSection title="9. Résiliation">
        <p>
          En cas de non-paiement, de violation des présentes CGU ou de demande
          de votre part, le compte peut être suspendu ou résilié. Vous
          disposez alors d&apos;un délai raisonnable pour récupérer vos
          données, sans préjudice des sommes dues au titre de la période
          écoulée.
        </p>
      </LegalSection>

      <LegalSection title="10. Modification des CGU">
        <p>
          Digital Infotech peut faire évoluer les présentes CGU. Les
          utilisateurs seront informés par tout moyen approprié ; la poursuite
          de l&apos;utilisation du service vaut acceptation des nouvelles
          conditions.
        </p>
      </LegalSection>

      <LegalSection title="11. Droit applicable et juridiction">
        <p>
          Les présentes CGU sont soumises au droit béninois. Tout litige
          relatif à leur interprétation ou à leur exécution relève des
          tribunaux compétents de Cotonou, après tentative de règlement
          amiable.
        </p>
      </LegalSection>
    </PageShell>
  );
}
