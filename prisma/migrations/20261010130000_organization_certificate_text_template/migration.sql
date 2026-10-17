-- Personnalisation dynamique du texte des certificats
--
-- Ajoute un gabarit de texte libre (texte long) au niveau de l'organisation,
-- permettant à l'administration de rédiger le corps du certificat. Ce texte
-- accepte des variables dynamiques substituées à la génération :
--   {{studentName}}, {{matricule}}, {{courseName}}, {{level}}, {{date}},
--   {{organizationName}}, {{verificationCode}}, {{score}}
-- (voir `src/lib/certificate-shared.ts` → `interpolateCertificateTemplate`).
--
-- `null` = comportement par défaut : le moteur de rendu (`certificate-html.ts`)
-- retombe alors sur le texte standard, ce qui reste rétro-compatible avec
-- toutes les organisations existantes (aucune donnée à migrer).

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "certificateTextTemplate" TEXT;
