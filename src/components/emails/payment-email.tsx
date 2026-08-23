import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

import { formatFcfa, formatDateLong } from "./format";

/**
 * Reçu de confirmation de règlement.
 * Affiche le montant (FCFA), la référence de transaction et la date du paiement.
 */

const BRAND_COLOR = "#4f46e5";
const SUCCESS_COLOR = "#059669";
const TEXT_DARK = "#1f2937";
const TEXT_MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BACKGROUND = "#f4f5f7";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export interface PaymentEmailProps {
  /** Nom complet de l'étudiant (prénom + nom). */
  studentName: string;
  /** Montant réglé, en francs CFA (XOF). */
  amount: number;
  /** Référence de la transaction (peut être absente). */
  reference?: string | null;
  /** Date effective du règlement. */
  paidAt?: Date;
}

export function PaymentEmail({
  studentName,
  amount,
  reference,
  paidAt = new Date(),
}: PaymentEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>
        Nous avons bien reçu votre règlement de {formatFcfa(amount)}.
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
            <Heading style={styles.heading}>Reçu de paiement</Heading>

            <Text style={styles.paragraph}>
              Bonjour {studentName},
            </Text>
            <Text style={styles.paragraph}>
              Nous confirmons la bonne réception de votre règlement. Votre
              dossier financier est à jour. Voici le détail de la
              transaction :
            </Text>

            {/* Montant mis en évidence */}
            <Section style={styles.amountBox}>
              <Text style={styles.amountLabel}>MONTANT RÉGLÉ</Text>
              <Text style={styles.amountValue}>{formatFcfa(amount)}</Text>
            </Section>

            {/* Détails de la transaction */}
            <Section style={styles.detailsBox}>
              <Row style={styles.detailRow}>
                <Column style={styles.detailLabelCell}>
                  <Text style={styles.detailLabel}>Étudiant</Text>
                </Column>
                <Column style={styles.detailValueCell}>
                  <Text style={styles.detailValue}>{studentName}</Text>
                </Column>
              </Row>
              <Row style={styles.detailRow}>
                <Column style={styles.detailLabelCell}>
                  <Text style={styles.detailLabel}>Date</Text>
                </Column>
                <Column style={styles.detailValueCell}>
                  <Text style={styles.detailValue}>
                    {formatDateLong(paidAt)}
                  </Text>
                </Column>
              </Row>
              {reference ? (
                <Row style={styles.detailRow}>
                  <Column style={styles.detailLabelCell}>
                    <Text style={styles.detailLabel}>Référence</Text>
                  </Column>
                  <Column style={styles.detailValueCell}>
                    <Text style={styles.detailValueMono}>{reference}</Text>
                  </Column>
                </Row>
              ) : null}
              <Row style={styles.detailRowLast}>
                <Column style={styles.detailLabelCell}>
                  <Text style={styles.detailLabel}>Statut</Text>
                </Column>
                <Column style={styles.detailValueCell}>
                  <Text style={styles.statusBadge}>Confirmé</Text>
                </Column>
              </Row>
            </Section>

            <Text style={styles.paragraph}>
              Conservez cet e-mail comme preuve de paiement : il vous sera
              demandé en cas de question sur votre dossier financier.
            </Text>

            <Text style={styles.paragraph}>
              Merci de votre confiance,
              <br />
              Le service comptabilité
            </Text>
          </Section>

          <Hr style={styles.divider} />

          {/* Pied de page */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Ce reçu a été généré automatiquement après l’enregistrement de
              votre règlement. Merci de ne pas y répondre directement.
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
  amountBox: {
    backgroundColor: "#ecfdf5",
    border: `1px solid #a7f3d0`,
    borderRadius: "8px",
    margin: "24px 0",
    padding: "20px 24px",
    textAlign: "center" as const,
  },
  amountLabel: {
    color: SUCCESS_COLOR,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    margin: "0 0 8px",
  },
  amountValue: {
    color: TEXT_DARK,
    fontSize: "28px",
    fontWeight: 700,
    margin: "0",
  },
  detailsBox: {
    border: `1px solid ${BORDER}`,
    borderRadius: "8px",
    margin: "24px 0",
    padding: "4px 20px",
  },
  detailRow: {
    borderBottom: `1px solid ${BORDER}`,
  },
  detailRowLast: {},
  detailLabelCell: {
    padding: "12px 0",
    width: "40%",
  },
  detailValueCell: {
    padding: "12px 0",
    textAlign: "right" as const,
  },
  detailLabel: {
    color: TEXT_MUTED,
    fontSize: "13px",
    margin: "0",
  },
  detailValue: {
    color: TEXT_DARK,
    fontSize: "14px",
    fontWeight: 600,
    margin: "0",
  },
  detailValueMono: {
    color: TEXT_DARK,
    fontFamily:
      "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    fontSize: "13px",
    fontWeight: 600,
    margin: "0",
  },
  statusBadge: {
    backgroundColor: "#ecfdf5",
    border: `1px solid #a7f3d0`,
    borderRadius: "999px",
    color: SUCCESS_COLOR,
    display: "inline-block" as const,
    fontSize: "12px",
    fontWeight: 700,
    margin: "0",
    padding: "4px 12px",
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

export default PaymentEmail;