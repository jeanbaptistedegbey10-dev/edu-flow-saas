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

/**
 * E-mail de confirmation d'inscription.
 * Met en avant le code identifiant unique de l'étudiant (format STU-YYYY-NNN).
 */

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

export interface WelcomeEmailProps {
  /** Nom complet de l'étudiant (prénom + nom). */
  studentName: string;
  /** Code identifiant unique généré à l'inscription (STU-YYYY-NNN). */
  studentCode: string;
}

export function WelcomeEmail({ studentName, studentCode }: WelcomeEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>
        Votre inscription est confirmée — votre code étudiant : {studentCode}
      </Preview>
      <Body style={{ ...styles.body, backgroundColor: BACKGROUND }}>
        <Container style={styles.container}>
          {/* En-tête de marque */}
          <Section style={styles.header}>
            <Text style={styles.brand}>EduFlow</Text>
            <Text style={styles.brandTagline}>
              Centre de formation & mobilité internationale
            </Text>
          </Section>

          {/* Contenu principal */}
          <Section style={styles.content}>
            <Heading style={styles.heading}>
              Bienvenue, {studentName} !
            </Heading>

            <Text style={styles.paragraph}>
              Votre inscription a été confirmée avec succès. Nous sommes
              ravis de vous accueillir et vous accompagnons dès
              aujourd’hui dans votre parcours de formation.
            </Text>

            {/* Code étudiant mis en évidence */}
            <Section style={styles.codeBox}>
              <Text style={styles.codeLabel}>VOTRE CODE ÉTUDIANT</Text>
              <Text style={styles.codeValue}>{studentCode}</Text>
              <Text style={styles.codeHint}>
                Conservez précieusement ce code : il identifie votre dossier
                pour vos cours, vos paiements et vos démarches.
              </Text>
            </Section>

            <Text style={styles.paragraph}>
              À très bientôt dans nos locaux,
              <br />
              L’équipe pédagogique
            </Text>
          </Section>

          <Hr style={styles.divider} />

          {/* Pied de page */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Cet e-mail a été envoyé automatiquement suite à la création de
              votre dossier d’inscription. Merci de ne pas y répondre
              directement.
            </Text>
            <Text style={styles.footerBrand}>
              © {new Date().getFullYear()} EduFlow — Tous droits réservés
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
    margin: "0 0 16px",
  },
  codeBox: {
    backgroundColor: BRAND_LIGHT,
    border: `1px solid #c7d2fe`,
    borderRadius: "8px",
    margin: "24px 0",
    padding: "20px 24px",
    textAlign: "center" as const,
  },
  codeLabel: {
    color: BRAND_COLOR,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    margin: "0 0 8px",
  },
  codeValue: {
    color: TEXT_DARK,
    fontFamily: MONO_STACK,
    fontSize: "26px",
    fontWeight: 700,
    letterSpacing: "3px",
    margin: "0 0 10px",
  },
  codeHint: {
    color: TEXT_MUTED,
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "0",
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

export default WelcomeEmail;