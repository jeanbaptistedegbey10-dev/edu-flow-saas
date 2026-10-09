import type { Metadata } from "next";
import PageShell, { LegalSection } from "@/components/landing/page-shell";

export const metadata: Metadata = {
  title: "Politique de confidentialité - EduFlow",
  description:
    "Politique de confidentialité d'EduFlow : données collectées, finalités, durée de conservation, sous-traitants, cookies et droits RGPD.",
};

export default function PolitiqueDeConfidentialitePage() {
  return (
    <PageShell
      badge="Confidentialité & RGPD"
      title="Politique de confidentialité"
      description="Comment EduFlow collecte, utilise et protège vos données personnelles."
      updated="septembre 2026"
    >
      <LegalSection title="1. Responsable du traitement">
        <p>
          Le responsable du traitement des données collectées via le Site et la
          plateforme EduFlow est{" "}
          <strong className="text-white">Digital Infotech</strong>, Cotonou,
          Bénin. Contact :{" "}
          <a
            href="mailto:contact@eduflow.com"
            className="text-brand-light hover:underline"
          >
            contact@eduflow.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Données collectées">
        <ul className="list-disc list-inside space-y-1.5 marker:text-brand-light">
          <li>
            Des informations d&apos;identité et de contact : nom, prénom,
            adresse email, numéro de téléphone, organisation ;
          </li>
          <li>
            Des données de scolarité saisies par votre centre : étudiants,
            inscriptions, cours, niveaux (A1 à C2), présences, notes et
            bulletins, dossiers de visa, paiements ;
          </li>
          <li>
            Des données techniques strictement nécessaires : journaux de
            connexion, cookies de session d&apos;authentification.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Finalités du traitement">
        <ul className="list-disc list-inside space-y-1.5 marker:text-brand-light">
          <li>Fournir, opérer et sécuriser la plateforme EduFlow ;</li>
          <li>Gérer les abonnements et la facturation ;</li>
          <li>Assurer le support client et le suivi des demandes ;</li>
          <li>Communiquer des informations liées au service ;</li>
          <li>
            Améliorer nos produits à partir de statistiques agrégées et
            anonymisées.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Base légale">
        <p>
          Les traitements reposent sur l&apos;exécution du contrat (fourniture
          du service), sur l&apos;intérêt légitime de Digital Infotech
          (sécurité, amélioration du service) et, le cas échéant, sur votre
          consentement.
        </p>
      </LegalSection>

      <LegalSection title="5. Durée de conservation">
        <p>
          Vos données sont conservées pendant la durée de votre abonnement. À
          l&apos;issue de celui-ci, elles sont archivées pour la durée légale
          requise, puis supprimées ou anonymisées.
        </p>
      </LegalSection>

      <LegalSection title="6. Destinataires et sous-traitants">
        <p>
          Les données sont destinées exclusivement aux équipes de Digital
          Infotech et à ses sous-traitants techniques (hébergement cloud, envoi
          d&apos;emails, paiement), liés par des engagements de
          confidentialité. Aucune donnée n&apos;est vendue, louée ou échangée
          avec des tiers.
        </p>
        <p>
          Chaque centre demeure responsable du traitement des données de ses
          propres étudiants qu&apos;il saisit dans la plateforme.
        </p>
      </LegalSection>

      <LegalSection title="7. Vos droits">
        <p>
          Conformément à la réglementation applicable (dont le RGPD), vous
          disposez des droits suivants :
        </p>
        <ul className="list-disc list-inside space-y-1.5 marker:text-brand-light">
          <li>Droit d&apos;accès et de rectification ;</li>
          <li>Droit à l&apos;effacement et à la limitation du traitement ;</li>
          <li>Droit d&apos;opposition et de portabilité de vos données.</li>
        </ul>
        <p>
          Pour exercer vos droits, écrivez à{" "}
          <a
            href="mailto:contact@eduflow.com"
            className="text-brand-light hover:underline"
          >
            contact@eduflow.com
          </a>
          . Vous pouvez également introduire une réclamation auprès de
          l&apos;autorité de protection des données de votre pays (au Bénin :
          APDP).
        </p>
      </LegalSection>

      <LegalSection title="8. Cookies">
        <p>
          Le Site utilise uniquement des cookies strictement nécessaires à son
          fonctionnement (session d&apos;authentification). Aucun cookie
          publicitaire ou de traçage tiers n&apos;est déposé.
        </p>
        <p>
          Conformément au RGPD, un bandeau de consentement vous permet
          d&apos;accepter ou de refuser ce dépôt dès votre première visite.
          Votre choix est mémorisé dans le stockage local de votre navigateur,
          après quoi le bandeau n&apos;est plus affiché. Vous pouvez à tout
          moment revenir sur ce choix et gérer les cookies depuis les réglages
          de votre navigateur.
        </p>
      </LegalSection>

      <LegalSection title="9. Sécurité">
        <p>
          Digital Infotech met en œuvre des mesures techniques et
          organisationnelles appropriées : chiffrement des échanges (TLS),
          contrôle d&apos;accès basé sur les rôles, journalisation et
          sauvegardes régulières.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Pour toute question relative à la présente politique, écrivez-nous à{" "}
          <a
            href="mailto:contact@eduflow.com"
            className="text-brand-light hover:underline"
          >
            contact@eduflow.com
          </a>
          .
        </p>
      </LegalSection>
    </PageShell>
  );
}
