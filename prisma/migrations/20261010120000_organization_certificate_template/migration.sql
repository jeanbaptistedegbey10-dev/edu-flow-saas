-- Modèles graphiques de certificats (Étape 3/3 — certificats A4 1 page)
--
-- Ajoute le choix du modèle de certificat par défaut au niveau de
-- l'organisation : 4 mises en page (TEMPLATE_1..4) appliquées au rendu
-- HTML d'affichage et d'impression A4 paysage.
--
-- Aligné sur `src/lib/certificate-template.ts` et le champ
-- `Organization.certificateTemplate` (défaut TEMPLATE_1 : rétro-compatible
-- avec toutes les organisations existantes, aucune donnée à migrer).

-- CreateEnum
CREATE TYPE "CertificateTemplate" AS ENUM ('TEMPLATE_1', 'TEMPLATE_2', 'TEMPLATE_3', 'TEMPLATE_4');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "certificateTemplate" "CertificateTemplate" NOT NULL DEFAULT 'TEMPLATE_1';
