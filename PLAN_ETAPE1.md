# Plan — Étape 1/3 : Séparation Étudiant vs Inscription + Clôture de Classe

> **STATUT : ÉTAPE 1 ET 2 IMPLÉMENTÉES** (typecheck + `next build` verts).
> Migrations : `20261009120000_class_enrollment_strict_attachments`.

## Contexts
- Modèle **ClassEnrollment** = inscription d'un étudiant dans une classe + année académique (academicYear).
- **Enrollment** = liaison student<->course générique, ne supporte pas les données pédagogiques/financières.
- Données pédagogiques actuelles rattachées à **studentId** :
  - **Grade** : evaluationModuleId + studentId
  - **Attendance** : sessionId + studentId
- Données financières :
  - **Payment** : studentId (optionnel), isVoided = hors trésorerie
  - **PaymentSchedule** : studentId + classId optionnel
- Cycle de vie : ClassStatus (PLANIFIED → IN_PROGRESS/ACTIVE → COMPLETED → ARCHIVED), ClassEnrollmentStatus (ACTIVE, PASSED, PROMOTED_MANUALLY, FAILED, DROPPED).

## Étape 1 — Séparation stricte Étudiant ↔ Enrollment ✅
1. **Schéma Prisma** :
   - Grade : `enrollmentId` (relation ClassEnrollment, SetNull) + index.
     Unique **conservée** `[evaluationModuleId, studentId]` (l'idempotence de la
     grille de notes est inchangée) — `enrollmentId` est le rattachement de
     cohorte, `studentId` reste la clé métier.
   - Attendance : `enrollmentId` + index. Unique `[sessionId, studentId]`
     conservée (même motif).
   - PaymentSchedule : `enrollmentId` + index (+ `sealedAt` — voir Étape 2).
   - Payment : `enrollmentId` + index (héritage financier rattaché à une
     cohorte ; null pour les règlements voyage / sans étudiant).
   - ClassEnrollment : relations inverses grades/attendances/paymentSchedules/
     payments ; **unicité élargie `[studentId, classId, academicYear]`**.
   - Migration + backfill SQL (rattachement des lignes existantes via
     evaluation→classe, séance→classe, étudiant→classe courante).
2. **Réinscription** : la nouvelle unicité (étudiant, classe, année) garantit
   qu'une réinscription crée TOUJOURS un nouvel `ClassEnrollment` sans toucher
   aux lignes des années précédentes (upserts portés sur
   `studentId_classId_academicYear` dans students.ts / class-closure.ts).
   L'ancien historique n'est jamais écrasé ni néant.
3. **Cohérence** : les écritures passent par `src/lib/enrollment-scope.ts`
   (`resolveEnrollmentIdForStudent`, `buildEnrollmentIdMapForClass`) —
   evaluations (grille de notes), attendance (3 points de saisie), schedules
   (3 créations), payments (création/correction), students (frais d'inscription
   + legacy), class-closure (frais de réinscription). Les contrôles
   d'appartenance à une classe (notes/émargement) valident désormais une
   **inscription** (et plus `currentClassId`), ce qui autorise les corrections
   administratives d'historique.
4. **UI** : statut `COMPLETED` ajouté aux libellés (class-closure-view,
   student-journey-tab). Les DTOs restent compatibles (colonnes ajoutées,
   aucun champ retiré).

## Étape 2 — Clôture de classe ✅
1. **Action serveur** `closeClassAction` (complétée) :
   - Class : status -> **COMPLETED** (« clôturée » = CLOSED du cycle), ou
     **ARCHIVED** directement via `input.archive` (optionnel).
   - ClassEnrollment associés : PASSED / PROMOTED_MANUALLY / FAILED / DROPPED
     selon la décision, **COMPLETED** pour tous les autres (nouvelle valeur
     d'enum) — **aucune inscription ne reste ACTIVE** après clôture.
   - Comptabilité **scellée** : `PaymentSchedule.sealedAt` posé sur tous les
     échéanciers de la classe ; `refreshOverdueStatus` ignore les échéanciers
     scellés (plus de retard auto). Les règlements restent l'historique vrai ;
     les corrections administratives passent par `isOutOfSystem` et
     n'alimentent jamais la trésorerie active. Les frais de réinscription sont
     rattachés à la NOUVELLE inscription.
2. **Contrôles** : class.status en IN_PROGRESS/ACTIVE, vérification des
   prérequis pédagogiques (inchangés, appliqués côté serveur).
3. **Revalidation** : chemins d'UI (inchangés) + compteurs `completedEnrollments`
   / `sealedSchedules` exposés au résultat + audit.

## Écarts assumés par rapport au plan initial
- Uniques Grade/Attendance inchangées (voir plus haut) : le rattachement strict
  est porté par `enrollmentId` + les écritures, sans casser l'idempotence des
  upserts ni les clés [sessionId, studentId].
- Scellement via `PaymentSchedule.sealedAt` (marqueur dédié) plutôt que
  `isVoided` sur les paiements : `isVoided` a déjà une sémantique métier
  (suspension Prospect) et les paiements d'une classe clôturée restent de
  l'argent réellement encaissé.
- Migration appliquée via `prisma db execute` + `migrate resolve --applied`
  (le replay shadow DB casse sur un BOM UTF-8 hérité du fichier
  `init_baseline/migration.sql` — ne pas retirer ce BOM : il fait partie du
  checksum enregistré).

## Validation
- `node scripts/typecheck.mjs` ✅
- `npx next build` ✅

