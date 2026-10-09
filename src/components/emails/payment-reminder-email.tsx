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
 * E-mail de RELANCE pour une échéance de paiement arrivée à terme et non soldée.
 * Met en évidence le RELIQUAT EXACT restant dû, la date d'échéance dépassée et
 * le détail de la tranche concernée.
 */

const BRAND_COLOR = "#4f46e5";
const WARNING_COLOR = "#b45309";
const WARNING_BG = "#fffbeb";
const WARNING_BORDER = "#fde68a";
const TEXT_DARK = "#1f2937";
const TEXT_MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BACKGROUND = "#f4f5f7";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export interface PaymentReminderEmailProps {
  /** Nom complet de l'étudiant (prénom + nom). */
  studentName: string;
  /** Code identifiant de l'étudiant (STU-YYYY-NNN). */
  studentCode: string;
  /** Montant total dû de la tranche (FCFA). */
  installmentAmount: number;
  /** Montant déjà réglé sur la tranche (FCFA). */
  paidAmount: number;
  /** RELIQUAT exact restant dû (FCFA) = installmentAmount − paidAmount. */
  remainingAmount: number;
  /** Numéro de la tranche concernée. */
  installmentNumber: number;
  /** Date d'échéance (dépassée) de la tranche. */
  dueDate: Date;
  /** Intitulé du cours / de la formation (facultatif). */
  courseTitle?: string | null;
  /** Nom de la classe / cohorte (facultatif). */
  className?: string | null;
  /** Coordonnées du centre pour le règlement (facultatif). */
  contactPhone?: string | null;
}

export function PaymentReminderEmail({
  studentName,
  studentCode,
  installmentAmount,
  paidAmount,
  remainingAmount,
  installmentNumber,
  dueDate,
  courseTitle,
  className,
  contactPhone,
}: PaymentReminderEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>
        Rappel de paiement — {formatFcfa(remainingAmount)} restant à régler pour votre formation.
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
            <Heading style={styles.heading}>Rappel de paiement</Heading>

            <Text style={styles.paragraph}>Bonjour {studentName},</Text>
            <Text style={styles.paragraph}>
              Nous vous relions concernant le règlement de votre formation
              {courseTitle ? (
                <>
                  {" "}
                  «&nbsp;{courseTitle}&nbsp;»
                </>
              ) : null}
              . Une échéance est arrivée à son terme sans être intégralement
              soldée. Voici le récapitulatif de la tranche concernée&nbsp;:
            </Text>

            {/* Reliquat exact mis en évidence */}
            <Section style={styles.amountBox}>
              <Text style={styles.amountLabel}>MONTANT RESTANT À RÉGLER</Text>
              <Text style={styles.amountValue}>{formatFcfa(remainingAmount)}</Text>
              <Text style={styles.amountHint}>
                Échéance n°&nbsp;{installmentNumber} — arrivée à terme le{" "}
                {formatDateLong(dueDate)}
              </Text>
            </Section>

            {/* Détails de la tranche */}
            <Section style={styles.detailsBox}>
              <Row style={styles.detailRow}>
                <Column style={styles.detailLabelCell}>
                  <Text style={styles.detailLabel}>Code étudiant</Text>
                </Column>
                <Column style={styles.detailValueCell}>
                  <Text style={styles.detailValueMono}>{studentCode}</Text>
                </Column>
              </Row>
              {courseTitle ? (
                <Row style={styles.detailRow}>
                  <Column style={styles.detailLabelCell}>
                    <Text style={styles.detailLabel}>Formation</Text>
                  </Column>
                  <Column style={styles.detailValueCell}>
                    <Text style={styles.detailValue}>{courseTitle}</Text>
                  </Column>
                </Row>
              ) : null}
              {className ? (
                <Row style={styles.detailRow}>
                  <Column style={styles.detailLabelCell}>
                    <Text style={styles.detailLabel}>Classe</Text>
                  </Column>
                  <Column style={styles.detailValueCell}>
                    <Text style={styles.detailValue}>{className}</Text>
                  </Column>
                </Row>
              ) : null}
              <Row style={styles.detailRow}>
                <Column style={styles.detailLabelCell}>
                  <Text style={styles.detailLabel}>Montant de l&apos;échéance</Text>
                </Column>
                <Column style={styles.detailValueCell}>
                  <Text style={styles.detailValue}>
                    {formatFcfa(installmentAmount)}
                  </Text>
                </Column>
              </Row>
              <Row style={styles.detailRow}>
                <Column style={styles.detailLabelCell}>
                  <Text style={styles.detailLabel}>Déjà réglé</Text>
                </Column>
                <Column style={styles.detailValueCell}>
                  <Text style={styles.detailValue}>{formatFcfa(paidAmount)}</Text>
                </Column>
              </Row>
              <Row style={styles.detailRowLast}>
                <Column style={styles.detailLabelCell}>
                  <Text style={styles.detailLabelStrong}>Reste à régler</Text>
                </Column>
                <Column style={styles.detailValueCell}>
                  <Text style={styles.detailValueStrong}>
                    {formatFcfa(remainingAmount)}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Text style={styles.paragraph}>
              Merci de bien vouloir régulariser votre situation dans les
              meilleurs délais. Pour toute question, n&apos;hésitez pas à nous
              contacter.
            </Text>

            {contactPhone ? (
              <Text style={styles.contactLine}>
                Nous joindre : {contactPhone}
              </Text>
            ) : null}
          </Section>

          <Hr style={styles.divider} />

          {/* Pied de page */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Cet e-mail a été envoyé automatiquement dans le cadre du suivi de
              vos échéances de paiement. Merci de ne pas y répondre directement.
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
    backgroundColor: WARNING_BG,
    border: `1px solid ${WARNING_BORDER}`,
    borderRadius: "8px",
    margin: "24px 0",
    padding: "20px 24px",
    textAlign: "center" as const,
  },
  amountLabel: {
    color: WARNING_COLOR,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    margin: "0 0 8px",
  },
  amountValue: {
    color: TEXT_DARK,
    fontSize: "28px",
    fontWeight: 700,
    margin: "0 0 8px",
  },
  amountHint: {
    color: TEXT_MUTED,
    fontSize: "12px",
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
    width: "50%",
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
  detailLabelStrong: {
    color: TEXT_DARK,
    fontSize: "13px",
    fontWeight: 700,
    margin: "0",
  },
  detailValue: {
    color: TEXT_DARK,
    fontSize: "14px",
    fontWeight: 600,
    margin: "0",
  },
  detailValueStrong: {
    color: WARNING_COLOR,
    fontSize: "14px",
    fontWeight: 700,
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
  contactLine: {
    color: TEXT_MUTED,
    fontSize: "13px",
    margin: "0 0 8px",
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

export default PaymentReminderEmail;

