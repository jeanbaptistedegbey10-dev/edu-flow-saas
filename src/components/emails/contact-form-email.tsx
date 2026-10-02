import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// ---------------------------------------------------------------------------
// E-mail de notification d'une soumission du formulaire de contact public.
// Reçu par l'équipe EduFlow (variable d'environnement `CONTACT_EMAIL_TO`) :
// il contient les coordonnées du demandeur pour permettre une réponse directe.
// ---------------------------------------------------------------------------

const BRAND_COLOR = "#4f46e5";
const BRAND_LIGHT = "#eef2ff";
const TEXT_DARK = "#1f2937";
const TEXT_MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BACKGROUND = "#f4f5f7";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO_STACK =
  "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

export interface ContactFormEmailProps {
  /** Nom complet saisi par le demandeur. */
  name: string;
  /** Adresse e-mail du demandeur (pour lui répondre). */
  email: string;
  /** Centre / organisation du demandeur (facultatif). */
  organization?: string | null;
  /** Libellé lisible du sujet sélectionné dans le formulaire. */
  subjectLabel: string;
  /** Corps du message. */
  message: string;
  /** Numéro WhatsApp / téléphone officiel à rappeler si nécessaire. */
  replyPhoneDisplay: string;
}

export function ContactFormEmail({
  name,
  email,
  organization,
  subjectLabel,
  message,
  replyPhoneDisplay,
}: ContactFormEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>
        Nouveau message de {name} — {subjectLabel}
      </Preview>
      <Body style={{ ...styles.body, backgroundColor: BACKGROUND }}>
        <Container style={styles.container}>
          {/* En-tête de marque */}
          <Section style={styles.header}>
            <Text style={styles.brand}>EduFlow</Text>
            <Text style={styles.brandTagline}>
              Nouveau message depuis le formulaire de contact
            </Text>
          </Section>

          {/* Contenu principal */}
          <Section style={styles.content}>
            <Heading style={styles.heading}>Nouvelle demande</Heading>

            <Section style={styles.box}>
              <Text style={styles.boxLabel}>EXPÉDITEUR</Text>
              <Text style={styles.boxValue}>{name}</Text>
              <Text style={styles.boxValue}>{email}</Text>
              {organization ? (
                <Text style={styles.boxHint}>{organization}</Text>
              ) : null}
            </Section>

            <Section style={styles.box}>
              <Text style={styles.boxLabel}>SUJET</Text>
              <Text style={styles.boxValue}>{subjectLabel}</Text>
            </Section>

            <Section style={styles.box}>
              <Text style={styles.boxLabel}>MESSAGE</Text>
              <Text style={styles.message}>{message}</Text>
            </Section>

            <Text style={styles.paragraph}>
              Répondez directement à cet e-mail pour rejoindre {name}, ou
              rappelez-nous au {replyPhoneDisplay}.
            </Text>
          </Section>

          <Hr style={styles.divider} />

          {/* Pied de page */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Message transmis automatiquement depuis le site EduFlow. Ne pas
              répondre si vous ne souhaitez pas être recontacté.
            </Text>
            <Text style={styles.footerBrand}>
              © {new Date().getFullYear()} EduFlow par Digital Infotech — Tous
              droits réservés
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    fontFamily: FONT_STACK,
    margin: "0",
    padding: "24px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: `1px solid ${BORDER}`,
    maxWidth: "560px",
    margin: "0 auto",
    overflow: "hidden" as const,
  },
  header: {
    backgroundColor: BRAND_COLOR,
    padding: "32px 40px",
    textAlign: "center" as const,
  },
  brand: {
    color: "#ffffff",
    fontSize: "24px",
    fontWeight: 700,
    letterSpacing: "0.5px",
    margin: "0 0 4px",
  },
  brandTagline: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: "13px",
    margin: "0",
  },
  content: {
    padding: "36px 40px 28px",
  },
  heading: {
    color: TEXT_DARK,
    fontSize: "22px",
    fontWeight: 700,
    lineHeight: "1.3",
    margin: "0 0 16px",
  },
  paragraph: {
    color: TEXT_DARK,
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "16px 0 0",
  },
  box: {
    backgroundColor: BRAND_LIGHT,
    border: `1px solid #c7d2fe`,
    borderRadius: "8px",
    margin: "0 0 16px",
    padding: "16px 20px",
  },
  boxLabel: {
    color: BRAND_COLOR,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    margin: "0 0 6px",
  },
  boxValue: {
    color: TEXT_DARK,
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "1.5",
    margin: "0",
  },
  boxHint: {
    color: TEXT_MUTED,
    fontSize: "13px",
    margin: "4px 0 0",
  },
  message: {
    color: TEXT_DARK,
    fontFamily: MONO_STACK,
    fontSize: "13px",
    lineHeight: "1.6",
    margin: "0",
    whiteSpace: "pre-wrap" as const,
  },
  divider: {
    borderColor: BORDER,
    margin: "0 40px",
  },
  footer: {
    padding: "20px 40px 28px",
  },
  footerText: {
    color: TEXT_MUTED,
    fontSize: "11px",
    lineHeight: "1.6",
    margin: "0 0 8px",
    textAlign: "center" as const,
  },
  footerBrand: {
    color: TEXT_MUTED,
    fontSize: "11px",
    margin: "0",
    textAlign: "center" as const,
  },
};

export default ContactFormEmail;