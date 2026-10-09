import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { LegalSection } from "@/components/landing/page-shell";
import { CONTACT_PHONE_CHANNELS } from "@/data/contact-channels";

export const metadata: Metadata = {
  title: "Mentions légales - EduFlow",
  description:
    "Mentions légales du site EduFlow : éditeur, directeur de la publication, hébergement, propriété intellectuelle et responsabilité.",
};

export default function MentionsLegalesPage() {
  return (
    <PageShell
      badge="Informations légales"
      title="Mentions légales"
      description="Informations légales relatives au site et à la plateforme EduFlow."
      updated="septembre 2026"
    >
      <LegalSection title="1. Éditeur du site">
        <p>
          Le site EduFlow (ci-après « le Site ») est édité par{" "}
          <strong className="text-white">Digital Infotech</strong>, société de
          développement de logiciels, dont le siège est situé à Cotonou,
          République du Bénin.
        </p>
        <p>
          Contact :{" "}
          <a
            href="mailto:contact@eduflow.com"
            className="text-brand-light hover:underline"
          >
            contact@eduflow.com
          </a>{" "}
          — Téléphones :{" "}
          {CONTACT_PHONE_CHANNELS.map((phone, index) => (
            <span key={phone.telHref}>
              {index > 0 && ", "}
              <a
                href={phone.telHref}
                className="text-brand-light hover:underline"
              >
                {phone.display}
              </a>{" "}
              ({phone.country})
            </span>
          ))}
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Directeur de la publication">
        <p>
          La direction de la publication du Site est assurée par la direction
          légale de Digital Infotech.
        </p>
      </LegalSection>

      <LegalSection title="3. Hébergement">
        <p>
          Le Site est hébergé sur une infrastructure cloud sécurisée offrant un
          haut niveau de disponibilité, un chiffrement des échanges (TLS) et des
          sauvegardes régulières. Les coordonnées complètes de
          l&apos;hébergeur sont communiquées sur simple demande à{" "}
          <a
            href="mailto:contact@eduflow.com"
            className="text-brand-light hover:underline"
          >
            contact@eduflow.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="4. Propriété intellectuelle">
        <p>
          L&apos;ensemble des éléments composant le Site et la plateforme
          EduFlow (logiciels, textes, graphismes, logos, icônes, structure) est
          la propriété exclusive de Digital Infotech ou de ses partenaires et
          est protégé par le droit de la propriété intellectuelle.
        </p>
        <p>
          Toute reproduction, représentation ou exploitation, totale ou
          partielle, sans autorisation écrite préalable est interdite et
          constitue une contrefaçon.
        </p>
      </LegalSection>

      <LegalSection title="5. Données personnelles">
        <p>
          Le traitement de vos données personnelles est décrit en détail dans
          notre{" "}
          <Link
            href="/politique-de-confidentialite"
            className="text-brand-light hover:underline"
          >
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Responsabilité">
        <p>
          Digital Infotech s&apos;efforce d&apos;assurer au mieux
          l&apos;exactitude et la mise à jour des informations diffusées sur le
          Site, sans pouvoir en garantir l&apos;exhaustivité. En conséquence,
          Digital Infotech ne saurait être tenue responsable de tout dommage
          indirect résultant de l&apos;utilisation du Site ou des services
          associés.
        </p>
      </LegalSection>

      <LegalSection title="7. Contact">
        <p>
          Pour toute question relative aux présentes mentions légales,
          écrivez-nous à{" "}
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
