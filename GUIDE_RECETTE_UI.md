# PROTOCOLE DE RECETTE UI EN SESSIONS — EDUFLOW SAAS (REVISION TOTALE BOTTOM-UP)

> **Destinataire : agent UI Chrome (prompts copier-coller, zero hypothese).**
> **Source de verite : code inspecte le 2026-09-29 : `prisma/schema.prisma`, `src/actions/roles.ts`, `organization.ts`, `courses.ts`, `classes.ts`, `class-closure.ts`, `students.ts`, `travels.ts`, `evaluations.ts`, `pos.ts`, `payments.ts`, `src/lib/actions/cash-register.ts`, `src/lib/permissions.ts`, `src/lib/student-status.ts`, `src/lib/class-status.ts`, composants `dashboard/demo-data-card.tsx`, `organization/organization-view.tsx`, `settings/role-form-dialog.tsx` + `member-form-dialog.tsx` + `roles-view.tsx`, `courses/add-course-dialog.tsx`, `classes/add-class-dialog.tsx` + `class-card-session-actions.tsx` + `class-detail-view.tsx` + `class-closure-view.tsx`, `students/add-student-dialog.tsx`, `travels/add-travel-dialog.tsx`, `evaluations/create-evaluation-dialog.tsx` + `grade-sheet.tsx`, `pos/create-product-dialog.tsx` + `pos-view.tsx` + `cash-session-status.tsx`, `payments/add-payment-dialog.tsx`.**
> **Principe cardinal : une entite n'existe QUE si son parent existe (Role -> Membre -> Cours + Enseignant -> Classe -> Etudiant/Voyage/Evaluation -> Notes -> Caisse/Paiements). Ne jamais inverser.**

---

## 0. REGLES GLOBALES (lire avant ETAPE 0)

1. Compte ADMIN obligatoire : `admin@excellence-formation.com` / `password123` (secours `admin@horizon-mobilite.com` / `password123`). Ne JAMAIS utiliser le SUPER_ADMIN (`jeanbaptistedegbey10@gmail.com` redirige vers `/portal-sys-admin-sec`).
2. URL locale : `http://localhost:3000`, login `/login`. Turnstile desactive en local (si cadre anti-robot : attendre 2 s).
3. Apres CHAQUE soumission, chercher `p[role="alert"]` (bandeau rouge). Tant qu'il est visible, la donnee N'EST PAS creee. Noter son texte exact dans le rapport.
4. Les modales Radix defilent A L'INTERIEUR : `DialogContent` a `max-h-[85vh] overflow-y-auto`, `max-h-[90vh] overflow-y-auto`, ou (formulaire etudiant) un `<form>` interne a `max-h-[70vh] overflow-y-auto`. Scroller DANS la modale (molette sur la modale) pour atteindre le footer. Cause n1 de blocage. ATTENTION : 3 ecrans ne sont PAS des formulaires HTML mais de l'etat React (Profil etablissement, Grille de notes, Ecran de cloture) : ils n'ont ni "Envoyer" ni champ hidden — la sauvegarde passe par un bouton ("Enregistrer les modifications", "Enregistrer les notes", "Terminer la classe").
5. Les `Select` Radix ne sont PAS des `<select>` natifs : cliquer le `SelectTrigger` (par son `#id`), puis cliquer le `SelectItem` (par son texte). Ne jamais utiliser `fill` sur un Select.
6. Ordre STRICT bottom-up : ETAPE N+1 interdite tant que ETAPE N non validee avec preuve visuelle.
7. Emails `@example.com` : echec d'envoi normal, jamais bloquant.

## GLOSSAIRE DES ROUTES

| Page | URL |
|---|---|
| Dashboard (purge demo) | `/dashboard` (carte Donnees de demonstration) |
| Etablissement | `/dashboard/organization` |
| Personnel / Roles | `/dashboard/settings/roles` (+ Dialog Ajouter un membre) |
| Cours | `/dashboard/courses` |
| Classes | `/dashboard/classes` |
| Fiche classe | `/dashboard/classes/<id>` |
| Cloture classe | `/dashboard/classes/<id>/close` |
| Etudiants | `/dashboard/students` |
| Voyages | `/dashboard/travels` |
| Evaluations | `/dashboard/evaluations` |
| POS / Caisse | `/dashboard/pos` |
| Paiements | `/dashboard/payments` |

---

# ETAPE 0 — PROMPT PRINCIPAL A COPIER-COLLER (Purge des donnees de demo — DEPENDANCE : AUCUNE)

```text
ETAPE 0 — PURGE DEMO (dependance : AUCUNE. Pre-requis de TOUTE la recette).
Connecte-toi en ADMIN (admin@excellence-formation.com / password123) sur http://localhost:3000/login.
Va sur /dashboard, carte "Donnees de demonstration" (src/components/dashboard/demo-data-card.tsx).

A. LECTURE DE LA CARTE :
1. Si bandeau "Aucune donnee a supprimer" + bouton "Supprimer la demo" DESACTIVE : note "base deja vide" et passe en ETAPE 1.
2. Sinon la carte liste les compteurs (etudiants, cours, paiements, ventes...).

B. SUPPRESSION (flux anti-timeout en 3 sous-etapes sequentielles) :
1. Clique "Supprimer la demo" -> modale "Supprimer toutes les donnees ?".
2. Champ #demo-delete-confirmation (Label "Mot de confirmation", name="confirmation", placeholder "SUPPRIMER", classe font-mono uppercase) : tape exactement SUPPRIMER (majuscules). Le bouton "Supprimer definitivement" reste disabled tant que le mot est incorrect.
3. Clique "Supprimer definitivement" -> la modale reste OUVERTE et execute SEQUENTIELLEMENT 3 requetes (chacune < 3 s) avec liste de controle : (1) "Reinitialisation des donnees financieres et parametres..." (resetFinancialStepAction) -> (2) "Suppression des cours, evaluations et presences..." (resetCoursesStepAction) -> (3) "Nettoyage des etudiants et de la scolarite..." (resetStudentsStepAction). Chaque ligne passe de spinner a coche ✅.
4. A la fin, phase "done" : bandeau vert "Toutes les données de démo ont été nettoyées avec succès !" + detail "Base réinitialisée : N élèves, N cours, N paiements supprimés." : clique le bouton VERT "OK" (unique) — il recharge la page (window.location.reload()). En cas d'echec : bandeau rouge + 2 boutons "Fermer" (outline) et "Réessayer" (destructive) ; "Réessayer" relance les 3 etapes.

C. PREUVE : carte affiche "Aucune donnee a supprimer", listes /dashboard/students, /dashboard/courses, /dashboard/classes vides.
D. PIEGE : NE PAS cliquer "Ecraser et injecter la demo" (mot CONFIRMER, #demo-inject-confirmation) — cela REINJECTE de la demo. Si injection accidentelle, recommencer ETAPE 0.
RAPPORT FIN ETAPE 0 : compteurs avant/apres + chaque ligne de controle ✅ + role="alert" rencontres.
```

**Fiche Etape 0 :** `DemoDataCard` (carte "Données de démonstration" : boutons "Supprimer la démo" — désactivé si aucune donnée, titre du bouton "Supprimer définitivement toutes les données métier" — + "Injecter la démo") + `DemoProgressModal` (étapes sequentielles, aucun bouton pendant l'execution, footer "Fermer" + "Réessayer" en cas d'echec, bandeau vert + bouton unique "OK" qui recharge la page) ; actions `resetFinancialStepAction` ("Réinitialisation des données financières et paramètres...") puis `resetCoursesStepAction` ("Suppression des cours, évaluations et présences...") puis `resetStudentsStepAction` ("Nettoyage des étudiants et la scolarité...") — `src/lib/actions/demo-data.ts` ; mots de confirmation `SUPPRIMER` (suppression, champ #demo-delete-confirmation name="confirmation") vs `CONFIRMER` (injection/écrasement, champ #demo-inject-confirmation) ; la modale de progression ne se ferme pas pendant l'execution.

# ETAPE 1 — PROMPT PRINCIPAL A COPIER-COLLER (PROFIL ETABLISSEMENT, 12 zones, sans exception)

```text
ETAPE 1 — PROFIL ETABLISSEMENT (dependance : ETAPE 0 purgee). Va sur /dashboard/organization (titre "Organisation") : la carte "Informations générales" ("Mettez à jour les coordonnées visibles par vos équipes.") contient le formulaire D'EDITION direct (OrganizationEditForm -> updateOrganizationAction) : PAS de modale, PAS de bouton "Modifier", le champ est editable immediatement. Bouton final "Enregistrer les modifications" (icone Save, etat "Enregistrement..."). Remplis les 12 zones SANS EXCEPTION :
1. Zone "Logo" (LogoField, tout en haut, champ cache name="logoUrl") : apercu + URL externe OU import fichier local recadre via LogoCropperDialog (1:1, ~500 Ko apres compression, SVG conserve) : laisse VIDE (Ignore — optionnel).
2. #name (name="name", Label "Nom de l'organisation *", requis, maxLength 120) = "Centre Recette Validation".
3. #email (name="email", type email, Label "E-mail", optionnel, max 254, placeholder "contact@exemple.com") = "contact@recette-validation.bj".
4. #phone (name="phone", Label "Téléphone", optionnel, max 40, placeholder "+229 00 00 00 00") = "+229 01 96 00 00 01".
5. #address (name="address", Label "Adresse", optionnel, max 255, placeholder "Quartier, rue...") = "Godomey — Carrefour IITA".
6. #city (name="city", Label "Ville", optionnel, max 120, placeholder "Cotonou") = "Cotonou".
7. #website (name="website", Label "Site web", optionnel, DOIT commencer par http:// ou https:// si renseigne, max 200, placeholder "https://www.exemple.com") = "https://recette-validation.bj".
8. #rccm (name="rccm", Label "N° RCCM", optionnel, max 60, placeholder "RB/COT/24 A 12345") = "RB-CTN-2026-B-RECETTE".
9. #ifu (name="ifu", Label "N° IFU / NIF", optionnel, max 60) = "0202612345678".
10. Fieldset "Paramètres financiers" — #defaultRegistrationFee (name="defaultRegistrationFee", number, Label "Frais d'inscription par défaut (FCFA)", min 0, step any, placeholder "Ex : 15000", max 10 000 000 cote serveur) = 15000.
11. #initialCashBalance (name="initialCashBalance", number, Label "Solde initial / Solde de départ (FCFA)", min 0, step any, placeholder "Ex : 250000", max 1 Md cote serveur) = 0 (+ aide "Solde total = Solde initial + Encaissements − Dépenses").
12. Bloc "Politique de frais d'inscription" : 2 CARTES RADIO (input type="radio" name="registrationFeePolicy" — PAS de Select, pas d'id) : coche "Frais d'inscription payés une seule fois par étudiant" (value ONCE_PER_STUDENT) ; l'autre = "Frais d'inscription payés à chaque nouveau cours / nouvelle classe" (EVERY_NEW_ENROLLMENT).
Clique "Enregistrer les modifications". Preuve : bandeau role="alert" VERT (succes) + valeurs conservees sans rechargement (revalidatePath). Si bandeau ROUGE "Veuillez corriger les champs indiqués." : corrige le champ signale (aria-invalid + message sous le champ, ex. website sans https://).
VERIFICATION ETAPE 1 : REVIENS sur /dashboard/organization et verifie 2 endroits. (a) Carte d'identite (en haut) : logo (ou monogramme), "Centre Recette Validation", puis contact@recette-validation.bj, +229 01 96 00 00 01, "Godomey — Carrefour IITA, Cotonou", https://recette-validation.bj, "RCCM : RB-CTN-2026-B-RECETTE", "IFU / NIF : 0202612345678", "Organisation créée le <date>". (b) Carte "Informations générales" : les 11 champs du formulaire sont TOUJOURS remplis apres enregistrement (aucune modale, aucune page de rechargement) ; fieldset "Paramètres financiers" = #defaultRegistrationFee 15000 + #initialCashBalance 0 ; bloc "Politique de frais d'inscription" = carte radio "Frais d'inscription payés une seule fois par étudiant" selectionnee (bordure primary). Carte "Membres de l'équipe" : l'admin connecte y figure deja.
RAPPORT FIN ETAPE 1 : les 12 zones (valeur saisie + preuve affichee) + logo Ignore + role="alert" rencontres.
```

**Fiche Etape 1 :** `updateOrganizationAction` sur le formulaire inline de la carte "Informations générales" (OrganizationEditForm) ; zones = LogoField (hidden name="logoUrl"), #name (max 120, requis), #email (format, max 254), #phone (max 40), #address (max 255), #city (max 120), #website (http(s) obligatoire si renseigne, max 200), #rccm / #ifu (max 60), #defaultRegistrationFee (0..10 000 000), #initialCashBalance (0..1 000 000 000), 2 radios name="registrationFeePolicy" (ONCE_PER_STUDENT | EVERY_NEW_ENROLLMENT) ; submit "Enregistrer les modifications" ; bandeau role="alert" vert (succes) ou rouge + messages par champ (aria-invalid) ; `logoUrl` http(s) ou data:image (upload local recadre, max ~500 Ko apres compression) ; `revalidatePath` organization + tresorerie + dashboard + layout racine.



# ETAPE 2 — PROMPT PRINCIPAL A COPIER-COLLER (AVANT tout membre)

```text
ETAPE 2 — ROLES PERSONNALISES (dependance : ETAPE 1. OBLIGATOIRE AVANT ETAPE 3 — un membre ne peut recevoir un role personnalise que si le role existe).
Va sur /dashboard/settings/roles (titre "Rôles & Permissions"). Deux cartes : "Rôles personnalisés" (tableau) + "Attribution aux utilisateurs" (tableau des membres). Clique "Nouveau rôle" (bouton en haut de la carte des roles -> RoleFormDialog, modale "Nouveau rôle personnalisé", DialogContent max-h-[85vh] overflow-y-auto sm:max-w-2xl, SCROLL INTERNE OBLIGATOIRE).
FORMULAIRE ROLE (4 zones + footer, sans exception) :
1. Hidden name="roleId" (vide en creation, id en edition) : ne pas toucher.
2. #role-name (name="name", Input text "Nom du rôle *", requis, maxLength 60, placeholder "Ex : Secrétaire Adjoint", UNIQUE par organisation) : role A = "Secretaire Recette" ; role B (2e passage) = "Enseignant Recette".
3. #role-description (name="description", Textarea "Description", optionnel, maxLength 200, rows=2, placeholder "À quoi correspond ce rôle ?") : role A = "Role secretaire pour la recette UI (inscriptions + presences + caisse)" ; role B = "Role enseignant pour la recette UI (evaluations + presences)".
4. Matrice Permissions (Label "Permissions (matrice)", 9 checkboxes TOUTES name="permissions" value=cle, classe accent-indigo-600, 2 colonnes ; boutons texte "Tout cocher" / "Tout décocher" en haut a droite) : catalogue EXACT (cle = libelle — description) : finance="Accès Finance — Consulte les paiements, impayés et la trésorerie." ; registration="Inscription — Crée et met à jour des étudiants." ; delete="Suppression — Autorise la suppression d'étudiants, cours et autres." ; pos="Caisse / POS — Accès aux ventes comptoir et à l'encaissement." ; travel="Procédures voyage — Gère les dossiers de mobilité et les logements." ; evaluations="Évaluations — Crée des sessions et saisit les notes." ; attendance="Présences — Prend et consulte les émargements." ; expenses="Dépenses — Enregistre et gère les dépenses." ; settings="Paramètres — Accès aux paramètres et aux rôles.".
VALEURS : role A "Secretaire Recette" : COCHE registration + attendance + pos (+ finance si tu veux tester la tresorerie) ; role B "Enseignant Recette" : COCHE evaluations + attendance.
5. Footer : "Annuler" (outline) / "Créer le rôle" (bg-indigo-600, spinner si pending) — en edition le titre devient "Modifier « nom du rôle »" et le bouton "Enregistrer les modifications". Apres succes la modale se referme seule apres ~800 ms.
PREUVE : ligne dans le tableau "Rôles personnalisés" + badges des permissions (libelles "Inscription", "Présences", "Caisse / POS"…) ; si doublon : role="alert" (nom deja utilise). Scroller la matrice jusqu'en bas (settings est la 9e case).
RAPPORT FIN ETAPE 2 : les 2 roles (chaque champ + cases c + preuve tableau). INTERDIT de passer a l'ETAPE 3 sans les 2 roles visibles.
```

**Fiche Etape 2 :** RoleFormDialog (DialogContent max-h-[85vh] overflow-y-auto sm:max-w-2xl) -> saveCustomRoleAction : hidden name="roleId" (vide en creation), #role-name (name="name", maxLength 60, UNIQUE par organisation), #role-description (name="description", maxLength 200), matrice 9 checkboxes name="permissions" (valeurs = cles, src/lib/permissions.ts), boutons "Tout cocher" / "Tout décocher", submit "Créer le rôle" (edition : "Enregistrer les modifications") ; fermeture auto ~800 ms apres succes. 9 cles : finance, registration, delete, pos, travel, evaluations, attendance, expenses, settings.

---
# ETAPE 3 — PROMPT PRINCIPAL A COPIER-COLLER (PERSONNEL ET MEMBRES, roles de l'Etape 2 requis)

```text
ETAPE 3 — PERSONNEL ET MEMBRES (dependance : ETAPE 2 roles visibles. SANS les roles, le Select "Role personnalise" est vide et le test est FAUX).
Reste sur /dashboard/settings/roles, carte "Attribution aux utilisateurs" ("Sélectionnez le rôle personnalisé de chaque membre (les administrateurs ont déjà tous les accès)."). Clique "Ajouter un membre" (bouton VERT bg-emerald-600, icone UserPlus -> MemberFormDialog, modale "Ajouter un membre", DialogContent max-h-[85vh] overflow-y-auto sm:max-w-lg, SCROLL INTERNE).
FORMULAIRE MEMBRE (6 zones a la creation + 1 en edition, + 1 hidden en edition) :
1. #member-firstName (name="firstName", Input text "Prénom *", requis, placeholder "Ex : Claire") = "Amadou".
2. #member-lastName (name="lastName", Input text "Nom *", requis, placeholder "Ex : Okou") = "DIALLO".
3. #member-email (name="email", Input email ; Label = "Identifiant (email) — laisser vide pour génération automatique", placeholder "Ex : claire@example.com", OPTIONNEL a la creation : si vide, l'identifiant est genere automatiquement ; UNIQUE : si doublon, role alert) = "amadou.diallo@recette-validation.bj".
4. #member-password (name="password", type password ; Label creation = "Mot de passe initial (laisser vide = génération automatique)", placeholder "6 caractères minimum" ; aide "Si laissé vide, un identifiant et un mot de passe sont générés automatiquement et affichés une seule fois (aucun e-mail envoyé)." ; si renseigne et < 6 car. : erreur "Le mot de passe doit contenir au moins 6 caractères." ; en edition Label = "Nouveau mot de passe (laisser vide pour conserver)", placeholder "••••••••") = "Recette123!".
5. Select name="role" (Trigger #member-role, placeholder "Choisir un rôle", Label "Rôle de base *", requis, 4 options : STAFF="Personnel / Secrétaire" | TEACHER="Enseignant" | ADMIN="Administrateur" | SUPER_ADMIN="Super admin (système — non attribuable)" AFFICHEE MAIS DESACTIVEE).
6. Select name="customRoleId" (Trigger #member-customRole, Label "Rôle personnalisé (optionnel)", placeholder "Aucun", options "Aucun" (value "none") + les roles de l'ETAPE 2) : DESACTIVE si role=ADMIN (un admin a deja tous les acces).
7. #member-isActive (name="isActive", checkbox "Compte actif", cochee par defaut) : VISIBLE UNIQUEMENT EN EDITION (avec le hidden name="userId").
VALEURS : membre 1 = Amadou / DIALLO / amadou.diallo@recette-validation.bj / password Recette123! / role TEACHER + role perso "Enseignant Recette" ; membre 2 = Awa / SOW / awa.sow@recette-validation.bj / password Recette123! / role STAFF + role perso "Secretaire Recette".
Boutons : "Annuler" (outline) / "Créer le membre" (bg-indigo-600 ; en edition : "Enregistrer"). Refermeture auto ~800 ms apres succes.
PREUVE : 2 lignes dans le tableau de la carte "Attribution aux utilisateurs" (colonnes Membre | Rôle de base | Rôle personnalisé | Actions) : "Amadou DIALLO | Enseignant | Enseignant Recette" + "Awa SOW | Personnel / Secrétaire | Secrétaire Recette". Si doublon email : change l'email.
```

**Fiche Etape 3 :** createMemberAction / updateMemberAction / deleteMemberAction (double-clic corbeille puis check) / assignCustomRoleAction ; password OPTIONNEL a la creation, min 6 si renseigne (src/actions/roles.ts) ; isActive en edition seule (#member-isActive) ; role=ADMIN desactive le Select role personnalise (#member-customRole disabled).

---
# ETAPE 4 — PROMPT PRINCIPAL A COPIER-COLLER (CATALOGUE DES COURS, formations parentes)

```text
ETAPE 4 — CATALOGUE DES COURS (dependance : ETAPES 0-3. Les classes de l'ETAPE 5 exigent au moins 1 cours : bouton "Creer la classe" disabled si courses.length === 0).
Va sur /dashboard/courses. Clique "Nouveau cours" (icone Plus -> AddCourseDialog -> createCourseAction, modale "Ajouter un cours" / "Renseignez les informations du nouveau cours. Le code doit être unique au sein de votre organisation (ex : GER-A1, DEV-FULL).", DialogContent sm:max-w-lg).
FORMULAIRE COURS (5 champs, sans exception) :
1. #title (name="title", Input text "Intitulé *", requis, maxLength 150, placeholder "Ex : Anglais niveau A1") = "Allemand General et Intensif".
2. #code (name="code", Input text "Code *", requis, maxLength 20, classe uppercase, UNIQUE par organisation, placeholder "Ex : GER-A1 ou DEV-FULL") = "ALL-RECETTE" (si doublon : role alert -> "ALL-RECETTE-2").
3. #price (name="price", Input number "Prix (FCFA) *", requis, min 1, step any, inputMode decimal, placeholder "Ex : 150000") = 200000.
4. #durationWeeks (name="durationWeeks", Input number "Durée (semaines) *", requis, min 1, step 1, inputMode numeric, placeholder "Ex : 12") = 12.
5. #description (name="description", Input text "Description", optionnel, maxLength 500, placeholder "Ex : Formation d'allemand pour debutants (optionnel)") = "Cours de reference pour la recette UI (classe active + classe archivee)".
Boutons : "Annuler" / "Créer le cours" (icone BookPlus, spinner "Création..."). Refermeture auto si succes.
PREUVE : carte cours = puce code "ALL-RECETTE" (police mono) + prix "200 000" (masque pour un compte enseignant) + titre "Allemand General et Intensif" (lien vers la fiche) + metadonnees "12 semaines" + "0 étudiant inscrit" (deviendra "2 étudiants inscrits" apres l'ETAPE 5). Bouton "Accéder aux classes concernées" en bas de carte.
RAPPORT FIN ETAPE 4 : les 5 champs + preuve + alert rencontres.
```

**Fiche Etape 4 :** Course(title, code UNIQUE/org, price min 1, durationWeeks min 1, description max 500) ; createCourseAction / updateCourseAction (#edit-title, #edit-code, #edit-price, #edit-durationWeeks, #edit-description, hidden id) ; revalidate courses + classes.

---
# ETAPE 5 — PROMPT PRINCIPAL A COPIER-COLLER (CREATION DES CLASSES, formation + enseignant requis)

```text
ETAPE 5 — CLASSES (dependance : ETAPE 4 cours + ETAPE 3 enseignant Amadou DIALLO. SANS cours, creation IMPOSSIBLE ; SANS enseignant, classe "Non attribue").
Va sur /dashboard/classes. Clique "Nouvelle classe" (AddClassDialog -> createClassAction, modale sm:max-w-lg max-h-[90vh] overflow-y-auto, SCROLL INTERNE).
FORMULAIRE CLASSE (7 zones visibles + 1 hidden, sans exception) — modale "Ajouter une classe" (DialogContent sm:max-w-lg max-h-[90vh] overflow-y-auto, SCROLL INTERNE OBLIGATOIRE) :
0. Hidden name="schedulesJson" (JSON [{dayOfWeek,startTime,endTime,room}]) : alimente automatiquement par la zone 3, ne pas toucher.
1. #class-name (name="name", Input text "Nom de la classe *", requis, maxLength 100, placeholder "Ex : A1 - Matin 1") : classe A = "Classe Test Validation" ; classe B (2e passage) = "Classe A Archiver".
2. #class-schedule (name="schedule", Input text "Créneau horaire (affichage) *", REQUIS, maxLength 100, placeholder "Ex : 08h-11h") = "Lundi 08h-11h" sur les 2 classes. SANS ce champ : role="alert" + creation refusee — c'est le champ le plus souvent oublie de la recette.
3. Zone "Créneaux hebdomadaires" (OPTIONNELLE, dynamique) : bouton "Ajouter" (icone Plus). Ligne ajoutee = 4 champs + corbeille : <select> NATIF "Jour" (Lundi=1, Mardi=2, Mercredi=3, Jeudi=4, Vendredi=5, Samedi=6, Dimanche=0 — c'est un VRAI <select>, fill OK, contrairement aux autres Select de la page) + Input type=time "Début" + Input type=time "Fin" + Input text "Salle" (placeholder "Salle 101") + bouton aria-label "Supprimer ce créneau". Etat vide = "Aucun créneau configuré.". Ajoute 1 creneau Lundi / 08:00 / 10:00 / "Salle 101" sur la classe A (classe B : 0 creneau suffit).
4. #class-tuition-fee (name="tuitionFee", Input number "Frais de scolarité (FCFA)", OPTIONNEL, min 0, step any, inputMode decimal, placeholder "Optionnel — prix du cours sinon" + aide "Si laissé vide, le prix configuré sur le cours porteur sera appliqué automatiquement aux étudiants de cette classe.") : laisse VIDE (le prix du cours 200 000 s'applique auto).
5. Select name="courseId" (Trigger #class-course, Label "Cours *", REQUIS, placeholder "Sélectionner un cours", options "title (code)") : "Allemand General et Intensif (ALL-RECETTE)".
6. Select name="teacherId" (Trigger #class-teacher, Label "Enseignant", OPTIONNEL, placeholder "Non attribué (facultatif)") : "Amadou DIALLO" (enseignant de l'ETAPE 3). En edition (#edit-class-teacher) la sentinelle __none__ = "Non attribué".
7. Boutons "Annuler" (reinitialise les creneaux) / "Créer la classe" (icone CalendarClock, spinner "Création...", disabled si 0 cours). Refermeture auto si succes.
AUCUN champ date (startDate/endDate) ni champ statut dans ce formulaire : le statut initial est PLANIFIED et il n'est jamais demande a l'ecran — ne cherche pas "Date de debut".
CREE LES 2 CLASSES : A "Classe Test Validation" (restera active jusqu'a l'ETAPE 8) + B "Classe A Archiver" (sera demarree, cloturee, archivee ETAPE 7).
PREUVE : 2 cartes en onglet "Planifiees" avec badges cours + enseignant. Scroller la modale jusqu'au footer (courseId/teacherId en bas).
```

**Fiche Etape 5 :** Formulaire AddClassDialog = hidden name="schedulesJson" + #class-name (name="name", max 100) + #class-schedule (name="schedule", REQUIS, max 100) + zone "Créneaux hebdomadaires" (bouton "Ajouter", <select> natif Jour 1=Lundi…6=Samedi/0=Dimanche, time Début/Fin, Salle, bouton "Supprimer ce créneau") + #class-tuition-fee + Select #class-course (courseId requis) + Select #class-teacher (teacherId optionnel) + "Créer la classe". AUCUN champ date dans l'UI (startDate/endDate existent en base mais ne sont jamais saisis) ; statut initial PLANIFIED (src/actions/classes.ts). Edition : EditClassDialog (#edit-class-name, #edit-class-schedule, #edit-class-tuition-fee, #edit-class-course, #edit-class-teacher, hidden id, sentinelle __none__). Cycle de vie : startClassAction (PLANIFIED/ACTIVE -> IN_PROGRESS, bouton "Demarrer la classe"), canCloseClass -> page /close, archiveClassAction (-> ARCHIVED) ; ClassStatus PLANIFIED | IN_PROGRESS | ACTIVE | COMPLETED | ARCHIVED.

---
# ETAPE 6A — PROMPT PRINCIPAL A COPIER-COLLER (INSCRIPTION ETUDIANT : 17 zones)

```text
ETAPE 6A — INSCRIPTION ETUDIANT (dependance : ETAPE 5 classes. SANS classe, le Select classe n'affiche que "— Aucune classe —" + aide "Aucune classe disponible : créez-en une depuis la page « Classes »").
Va sur /dashboard/students. Clique "Nouvel étudiant" (icone Plus -> AddStudentDialog -> createStudentAction). Modale "Ajouter un étudiant" / "Renseignez les informations du nouvel étudiant. Le code étudiant est généré automatiquement." (DialogContent sm:max-w-lg) : le SCROLL se fait DANS le form "grid max-h-[70vh] gap-4 overflow-y-auto pr-2" — scroller DANS la modale pour atteindre les fieldsets du bas ; le footer est STICKY (reste visible en bas de la modale). 17 zones, SANS EXCEPTION.
BLOC A — IDENTITE (5 champs) :
1. #firstName (name="firstName", text "Prénom *", REQUIS, serveur max 100 car., placeholder "Ex : Awa") : etu 1 = "Jean" ; etu 2 = "Marie".
2. #lastName (name="lastName", text "Nom *", REQUIS, max 100 car., placeholder "Ex : Traoré") : etu 1 = "TESTEUR" ; etu 2 = "TEMOIN".
3. #email (name="email", email "Email", OPTIONNEL, format valide, UNIQUE par organisation) : etu 1 = "jean.testeur@example.com" ; etu 2 = "marie.temoin@example.com". Vide = aucun compte de connexion cree. Doublon : "Un étudiant avec cet email existe déjà." + fieldError "Cet email est déjà utilisé."
4. #phone (name="phone", tel "Téléphone *", REQUIS, min 8 chiffres (caracteres non numeriques ignores), placeholder "Ex : +225 05 00 00 00 01") : etu 1 = "+229 01 97 00 00 01" ; etu 2 = "+229 01 97 00 00 02".
5. Select name="status" (Trigger #status, Label "Statut", placeholder "Sélectionner un statut", 4 options : PROSPECT="Prospect" | ENROLLED="Inscrit" | COMPLETED="Diplômé / Terminé" | DROPPED_OUT="Abandonné" ; defaut Prospect) : Jean ET Marie = "Inscrit". SEUL "Inscrit" declenche la zone frais d'inscription obligatoire (zone 13).
BLOC B — fieldset "Classe / Cohorte" :
6. Select name="classId" (Trigger #classId, Label "Classe", placeholder "Aucune classe (facultatif)", sentinelle value="__none__" libelle "— Aucune classe —", options "nom · creneau (code cours)") : Jean = ligne "Classe Test Validation ..." ; Marie = ligne "Classe A Archiver ...". Preuve du choix : "Frais de scolarité appliqués : 200 000 FCFA (coût total verrouillé sur cette classe)."
BLOC C — fieldset "Financement de la formation" :
7. #totalCost (name="totalCost", number "Coût total (FCFA)", min 0, step any, placeholder "Ex : 400000") : des qu'une classe est selectionnee le champ est readOnly (fond gris + cadenas "Montant imposé par la classe — choisissez « Aucune classe » pour le modifier") : NE PAS editer, valeur auto 200 000.
8. Select name="discountType" (Trigger #discountType, Label "Type de réduction", 2 options FIXED="Montant fixe (FCFA)" | PERCENTAGE="Pourcentage (%)", defaut FIXED) : laisse FIXED.
9. #discount (name="discount", number, Label "Réduction (FCFA)" — devient "Réduction (%)" en PERCENTAGE —, min 0, step any, placeholder "Ex : 25000" ; regles serveur : FIXED <= cout total, PERCENTAGE <= 100) : 0 (ou vide : force a 0 par le serveur des qu'un cout total existe).
10. #legacyPaidAmount (name="legacyPaidAmount", number "Paiements antérieurs hors système (FCFA)", min 0, step any, placeholder "Ex : 100000", aide "Il est déduit du reste à payer, mais ne génère aucune recette dans le journal de caisse actuel.") : laisse VIDE (= 0) pour les 2 etudiants.
11. Champ cache name="legacyCheckboxRendered" value="1" (sentinelle de rendu de la case) : ne pas toucher.
12. Checkbox name="excludeLegacyFromCashJournal" — PAS d'id : cliquer le libelle "Ne pas inclure dans le journal de caisse actuel" (CASE COCHEE par defaut, state React legacyExcluded=true) : LAISSER COCHEE (le montant herite ne doit generer aucune ecriture en caisse).
13. Zone OBLIGATOIRE visible SEULEMENT si statut = "Inscrit" ET frais d'organisation > 0 (encart indigo) : Label "Frais d'inscription (15 000 FCFA) *" + Select name="registrationFeePayment" (Trigger #registrationFeePayment, placeholder "-- Sélectionner le statut du paiement --", 2 options : "Payé" (PAYE) -> aide VERTE "Une recette officielle de 15 000 FCFA sera créée dans le système (comptabilité et trésorerie)." | "Payé hors système" (PAYE_HORS_SYSTEME) -> aide AMBRE "Les frais seront marqués comme réglés sur la fiche de l'étudiant, sans aucune écriture dans le journal de caisse.") : Jean = "Payé hors système" ; Marie = "Payé hors système". Tant que rien n'est choisi, l'aide grise dit "Sélection obligatoire : indiquez si les frais d'inscription ont été encaissés dans le système ou hors système." et sans selection : role="alert" "Veuillez corriger les champs indiqués." + "Veuillez sélectionner le statut du paiement des frais d'inscription." Si statut != Inscrit : encart gris "Frais d'inscription (15 000 FCFA) applicables uniquement au statut « Inscrit » — aucun frais ne sera facturé ici."
14. Temoins en lecture seule : ligne "Net à payer" + input cache name="netAmount" (JAMAIS saisissable, jamais remplir) = 200 000 FCFA — les 15 000 de frais ne s'ajoutent PAS ici car choix hors systeme.
BLOC D — fieldset "Responsable financier" :
15. Checkbox name="isSelfFinanced" — PAS d'id : cliquer le libelle "L'étudiant est autonome / s'assume lui-même" (DECOCEE par defaut ; aide "Si coché, les champs de contact parent deviennent facultatifs.") : Jean = COCHEE ; Marie = LAISSER DECOCHEE (pour tester les champs parent obligatoires).
16. SI isSelfFinanced DECOCHEE (cas Marie) : 4 champs affiches, 3 requis — #parentName (text "Nom du parent / tuteur *", placeholder "Ex : Monsieur Traoré") = "Maman TEMOIN" ; Select name="parentRelation" (Trigger #parentRelation, Label "Lien avec l'étudiant", placeholder "Sélectionner", 5 options dont la value EST le mot : Père / Mère / Tuteur / Garant / Autre, REQUIS) = "Mère" ; #parentPhone1 (tel "Téléphone principal du parent *", REQUIS) = "+229 01 97 00 00 12" ; #parentPhone2 (tel "Téléphone secondaire (optionnel)") = laisse VIDE. Oubli d'un requis : fieldErrors "Le nom du parent / tuteur est requis." / "Le lien avec l'étudiant est requis." / "Le téléphone du parent / tuteur est requis."
17. Footer sticky : "Annuler" (outline) / "Créer l'étudiant" (icone UserPlus, spinner "Création..."). Refermeture + reset UNIQUEMENT en cas de succes (sinon la modale reste ouverte avec les saisies conservees).
CREE : Jean TESTEUR (classe "Classe Test Validation" — encore Programmee a ce stade, Inscrit, autonome/sans parent, frais d'inscription hors systeme) + Marie TEMOIN (classe "Classe A Archiver", Inscrit, parent Maman TEMOIN / Mère, frais d'inscription hors systeme). Aucun champ date de naissance / genre / adresse / type de client n'existe dans ce formulaire : ne pas les chercher.
```

# ETAPE 6B — PROMPT PRINCIPAL (SUITE) : DOSSIER VOYAGE EXTERNE

```text
SUITE ETAPE 6B — VOYAGE (dependance : Jean/Marie crees. Dossier EXTERNE = aucun etudiant requis : prouve l'independance du module voyage).
Va sur /dashboard/travels. Clique "Nouveau dossier" (icone Plus -> AddTravelDialog -> createTravelProcedureAction, modale "Ouvrir un dossier de voyage" / "Choisissez un candidat inscrit ou saisissez un candidat externe, puis associez un modèle de procédure pour suivre sa progression.", DialogContent max-h-[90vh] overflow-y-auto sm:max-w-xl, SCROLL INTERNE ; form id="add-travel-form").
FORMULAIRE VOYAGE (10 zones, sans exception) :
1. Label "Type de candidat" + bascule 2 CARTES (div role="radiogroup" aria-label "Type de candidat", boutons role="radio" avec aria-checked) : clique "Candidat externe" (sous-titre "Sans compte étudiant", icone UserRoundX) — l'autre carte est "Candidat inscrit" / "Étudiant existant". Ce choix pilote le hidden name="candidateType" (EXTERNAL | EXISTING_STUDENT) et AFFICHE/MASQUE la zone 2a/2b.
2a. SI "Candidat inscrit" (non teste ici) : Select name="studentId" (Trigger #studentId, Label "Candidat inscrit *", options "firstName lastName (studentCode)" ; si aucun : "Aucun étudiant éligible au voyage").
2b. SI "Candidat externe" : #candidateName (name="candidateName", text "Nom du candidat *", requis, max 120, placeholder "Ex : Ibrahim Bakayoko") = "Candidat Voyage TEST" ; #candidatePhone (name="candidatePhone", tel "Téléphone", optionnel, max 40, placeholder "+225 07 00 00 00 00") = "+229 01 97 00 00 99".
3. Select name="workflowId" (Trigger #workflowId, Label "Modèle de procédure", optionnel, item "none" = "Aucun modèle (suivi libre)" + vos modèles) : "Aucun modèle (suivi libre)". NOTE : choisir un modèle PREFILL #destination (country) + #totalCost (baseCost) si ces champs sont vides — ici pas de prefill.
4. #destination (name="destination", text "Pays de destination *", requis, max 100, placeholder "Ex : Allemagne") = "Allemagne".
5. #targetProgram (name="targetProgram", text "Programme visé", optionnel, max 150, placeholder "Ex : Ausbildung en soins infirmiers") = "Ausbildung test recette".
6. #totalCost (name="totalCost", number "Coût de la procédure (FCFA)", optionnel, min 0, step 1, placeholder "850000") = 850000.
7. #discount (name="discount", number "Réduction (FCFA)", optionnel, min 0, step 1, placeholder "0") = 0.
8. #deadline (name="deadline", date "Date limite (étape en cours)", optionnel) : laisse VIDE.
9. #notes (name="notes", text "Notes", optionnel, max 500, placeholder "Informations complémentaires (optionnel)") = "Dossier externe recette UI".
10. Boutons : "Annuler" / "Créer le dossier" (icone PlaneTakeoff, spinner "Création..."). Refermeture auto si succes.
PREUVE : carte sur /dashboard/travels = titre "Candidat Voyage TEST" (lien vers la fiche) + pastille "Allemagne" (icone MapPin) + badge ambre "Externe" (icone UserRoundX) + "Ausbildung test recette" + zone progression "Aucun modèle associé — progression libre". Ouvre la fiche : bandeau "Candidat externe".
RAPPORT FIN ETAPE 6 (6A + 6B) : Jean (17 zones) + Marie (17 zones + 4 champs parent) + voyage (10 zones) + alerts.
```

**Fiche Etape 6 :** AddStudentDialog (DialogContent sm:max-w-lg, form "grid max-h-[70vh] gap-4 overflow-y-auto pr-2" -> SCROLL DANS le form) -> createStudentAction : 17 zones = #firstName/#lastName (requis, max 100 cote serveur), #email (optionnel, UNIQUE), #phone (requis, min 8 chiffres), Select #status (Statut : Prospect | Inscrit | Diplômé / Terminé | Abandonné), Select #classId (sentinelle __none__ "— Aucune classe —" ; verrouille #totalCost sur le tuitionFee de la classe), #totalCost (readOnly si classe choisie), Select #discountType (FIXED | PERCENTAGE) + #discount, #legacyPaidAmount (aide : déduit du reste à payer, sans écriture de caisse), checkbox name="excludeLegacyFromCashJournal" SANS id (cochée par defaut), Select #registrationFeePayment (OBLIGATOIRE si statut = Inscrit ET frais d'organisation > 0 : "Payé" = recette systeme | "Payé hors système" = aucune ecriture caisse ; sans choix : role="alert" "Veuillez sélectionner le statut du paiement des frais d'inscription." ; si statut != Inscrit : encart gris "Frais d'inscription (15 000 FCFA) applicables uniquement au statut « Inscrit » — aucun frais ne sera facturé ici."), ligne "Net à payer" (span, lecture seule) + hidden name="netAmount", checkbox name="isSelfFinanced" SANS id ("L'étudiant est autonome / s'assume lui-même" ; decochee = 4 champs parent : #parentName REQUIS, Select #parentRelation REQUIS (Père | Mère | Tuteur | Garant | Autre), #parentPhone1 REQUIS, #parentPhone2 optionnel), footer "Annuler" / "Créer l'étudiant" (reset UNIQUEMENT en cas de succes). Aucun champ date de naissance / genre / adresse / type de client dans ce formulaire. TravelProcedure (AddTravelDialog, form id="add-travel-form", DialogContent max-h-[90vh] overflow-y-auto sm:max-w-xl) -> createTravelProcedureAction : 10 zones = bascule 2 cartes role="radiogroup" aria-label "Type de candidat" ("Candidat inscrit / Étudiant existant" = EXISTING_STUDENT | "Candidat externe / Sans compte étudiant" = EXTERNAL) pilote le hidden name="candidateType", puis soit Select #studentId (options "firstName lastName (studentCode)" ; vide = "Aucun étudiant éligible au voyage") soit #candidateName (requis, max 120) + #candidatePhone (max 40), Select #workflowId ("Aucun modèle (suivi libre)" = none ; un modèle PREFILL #destination + #totalCost si vides), #destination (requis, max 100), #targetProgram (max 150), #totalCost, #discount, #deadline (date), #notes (max 500), submit "Créer le dossier" (icone PlaneTakeoff) ; carte liste = nom + pin destination + badge ambre "Externe" + programme + progression ("Aucun modèle associé — progression libre" si pas de modèle).

---
# ETAPE 7 — PROMPT PRINCIPAL A COPIER-COLLER (CYCLE DE VIE CLASSE + CLOTURE + ARCHIVAGE, classe B)

```text
ETAPE 7 — CYCLE DE VIE CLASSE (dependance : ETAPES 5-6. La cloture exige au moins 1 inscrit : Marie TEMOIN doit etre dans "Classe A Archiver", sinon les boutons restent desactives et l'ecran affiche "Aucun étudiant actif n'est inscrit dans cette classe.").
A. DEMARRAGE (/dashboard/classes, carte "Classe A Archiver" au statut "Programmee" / PLANIFIED) : bouton "Demarrer la classe" (ClassCardSessionActions -> startClassAction ; size sm, w-full, icone Play, spinner) — affiche UNIQUEMENT si canManageLifecycle (ADMIN) ET canStartClass(status) : un TEACHER ne voit rien. Le meme bouton existe sur la fiche /dashboard/classes/<id>. Erreur eventuelle sous le bouton : "Impossible de démarrer cette classe.". Preuve : badge "En cours" (IN_PROGRESS) + bouton disparu (canStartClass faux). NE touche pas a "Classe Test Validation" : elle doit rester notable a l'ETAPE 8.
B. CLOTURE : fiche classe -> bouton outline "Terminer la classe" (icone DoorOpen) -> /dashboard/classes/<id>/close (ClassClosureView -> closeClassAction). 8 zones, sans exception :
1. En-tete : statut de la classe + carte "Effectif à clôturer" (nombre) + "X étudiant(s) éligible(s) au passage automatique".
2. Select "Classe de destination (passage) — optionnel" (Trigger #closure-target-class, placeholder "Aucune — marquer les admis sans transfert", options "Nom — Titre cours (CODE)") : NE PAS renseigner. Si aucune classe dispo : texte "Aucune autre classe active n'est disponible…" a la place du Select.
3. Select "Nouvelle session pour les redoublants (même niveau)" (Trigger #closure-repeat-target-class, placeholder "Aucune réaffectation automatique", options "Nom — créneau") : NE PAS renseigner (Marie reste rattachee a sa classe).
4. Bloc "Mode de décision" : 2 boutons "Automatique" (par defaut ; aide "Passage proposé si tous les modules requis sont validés (≥ seuil).") et "Manuel" ("Vous décidez librement qui passe, redouble ou abandonne."). Laisse AUTOMATIQUE, puis clique "Manuel" (en auto les Select de decision par etudiant sont desactives).
5. Bloc "Facturer les frais de réinscription" : checkbox aria-label "Facturer les frais de réinscription" (aide "Désactivé par défaut : une promotion interne (ex : A1 → A2) ne génère aucun frais…") : LAISSE DECOCHEE (le libelle doit afficher "Aucun frais").
6. Liste "Étudiants & décision de passage" : ligne "Marie TEMOIN" + code + "N/M module(s) validé(s)" + badge systeme ("Système : redoublement conseillé") ; cliquer son nom ouvre le detail (tableau Evaluation / Module / Note / Seuil / Statut). En mode Manuel : Select de decision par etudiant (largeur w-56, SANS id ni name — etat React, pas de champ de formulaire) avec 3 options "Passe au niveau supérieur" | "Redouble" | "Abandonne" : choisis "Redouble" pour Marie. Deux boutons apparus en manuel : "Tous passent" / "Tous redoublent" — NE PAS cliquer.
7. Textarea #closure-global-note ("Appréciation globale de décision (optionnelle)", rows 2, maxLength 500, placeholder "Ex : Session clôturée, bons résultats d'ensemble.") = "Clôture recette UI — Marie redouble".
8. Clique "Terminer la classe" (icone AlertTriangle, disabled si 0 inscrit) -> AlertDialog "Confirmer la fin de la classe ?" (resume "X passage(s) · Y redoublement(s) · Z abandon(s)" + "1 redoublant(s) — modules échoués marqués « À reprendre » (aucune nouvelle session sélectionnée : ils restent rattachés à cette classe).") -> bouton "Confirmer la clôture" (icone CheckCircle, spinner "Clôture en cours…"). Preuve : toast de succes + statut COMPLETED.
C. ARCHIVAGE (fiche /dashboard/classes/<id>, bouton outline "Clôturer et Archiver la classe" — visible UNIQUEMENT quand le statut est deja COMPLETED -> archiveClassAction ; raccourci equivalent : le bouton outline "Clôturer et Archiver la classe" de l'ecran de cloture, spinner "Archivage…"). Preuve : badge "Archivée", classe rangee dans l'onglet "Archivées", grille de notes en LECTURE SEULE (bouton "Lecture seule" + lock, le serveur refuse saveGradesAction). Bouton inverse "Rouvrir / Désarchiver la classe" : NE PAS cliquer.
D. INTERDIT : ne JAMAIS demarrer, cloturer ni archiver "Classe Test Validation" (Jean doit rester notable a l'ETAPE 8 et la classe doit rester selectable dans les evaluations).
RAPPORT FIN ETAPE 7 : demarrage (badge avant/apres) + cloture (les 8 zones + resume de l'AlertDialog) + archivage (badge + lecture seule) + alerts.
```

**Fiche Etape 7 :** startClassAction (PLANIFIED/ACTIVE -> IN_PROGRESS) ; ClassClosureView = etat React (PAS de <form>) : #closure-target-class (targetClassId), #closure-repeat-target-class (repeatTargetClassId), Mode "Automatique"/"Manuel", checkbox "Facturer les frais de réinscription" (chargeFee, false par defaut), Select de decision par etudiant sans id/name (PASSED="Passe au niveau supérieur" | FAILED="Redouble" | DROPPED="Abandonne"), #closure-global-note (max 500) ; boutons "Terminer la classe" (AlertDialog "Confirmer la fin de la classe ?" -> "Confirmer la clôture") et "Clôturer et Archiver la classe" ; closeClassAction refuse toute cloture sans inscrit ; ClassEnrollmentStatus ACTIVE|PASSED|PROMOTED_MANUALLY|FAILED|DROPPED ; modules echoues -> RETAKE ("À reprendre") ; certificats generes pour les admis ; archiveClassAction -> ARCHIVED (lecture seule) ; "Rouvrir / Désarchiver la classe" = action inverse.

---
# ETAPE 8A — PROMPT PRINCIPAL A COPIER-COLLER (EVALUATIONS : session + 4 modules)

```text
ETAPE 8A — EVALUATIONS (dependance : ETAPE 5 classe "Classe Test Validation" NON archivee + ETAPE 6 Jean inscrit. Sans classe active : page "Évaluations & Examens" affiche "Aucune classe assignée" (ou "Aucune classe active" si toutes archivees) et le bouton de creation disparait. NE JAMAIS evaluer "Classe A Archiver" : une classe ARCHIVED n'apparait plus dans le selecteur de classe).
Va sur /dashboard/evaluations (titre "Évaluations & Examens", sous-titre "Créez vos sessions d'examen internes et saisissez les notes par étudiant et par module."). Clique "Nouvelle session d'évaluation" (icone Plus -> CreateEvaluationDialog, modale "Nouvelle session d'évaluation", DialogContent max-h-[90vh] overflow-y-auto sm:max-w-2xl, SCROLL INTERNE).
FORMULAIRE SESSION (3 champs + bloc modules, sans exception) :
1. Select name="classId" (Trigger #evaluation-class, Label "Classe *", requis, options "Nom (CODE)" ex : "Classe Test Validation (ALL-RECETTE)") : choisis "Classe Test Validation (ALL-RECETTE)". (Classe archivee = ABSENTE de la liste.)
2. #evaluation-title (name="title", Label "Intitulé de l'examen *", requis, maxLength 200, placeholder "Ex : Examen Continu N°1") = "Evaluation Test Validation".
3. #evaluation-date (name="date", type date, Label "Date de l'examen *", REQUIS et SANS valeur par defaut) : SAISIS la date du jour — un champ vide fait echouer la creation.
ATTENTION : ce formulaire n'a NI champ "Description" NI champ "Note" : n'essaie pas de les chercher.
4. Bloc "Modules évalués *" (Label + bouton "Préréglage langues", icone Languages) : CLIQUE "Préréglage langues" -> 4 lignes EXACTES Lesen 100/60, Hören 100/60, Schreiben 100/60, Sprechen 100/60. Ne les edite pas.
5. Chaque ligne = #module-name-{i} (Label "Module {i+1}", name="moduleName_{i}", text, max 100, placeholder "Ex : Lesen, Hören...") + #module-max-{i} (Label "Barème", name="moduleMax_{i}", number, min 1, max 1000) + #module-passing-{i} (Label "Seuil", name="modulePassing_{i}", number, min 0) + corbeille aria-label "Supprimer le module {i+1}" (desactivee s'il ne reste qu'1 seule ligne). Bouton "Ajouter un module" (desactive a 20 lignes). Hidden name="moduleCount" = 4 (auto).
6. Boutons : "Annuler" / "Créer la session" (icone CalendarDays, spinner "Création...", disabled si 0 classe disponible). Refermeture auto si succes.
PREUVE : ligne du tableau "Evaluation Test Validation" + "Classe Test Validation · Allemand General et Intensif" + 4 puces de modules (Lesen, Hören, Schreiben, Sprechen) + colonne "Notes saisies" a 0 + bouton "Saisir les notes" actif (et NON "Consulter", qui signifierait classe archivee).
```

# ETAPE 8B — PROMPT PRINCIPAL (SUITE) : SAISIE DES NOTES (grille Jean)

```text
SUITE ETAPE 8B — NOTES (dependance : session 8A creee. Grille GradeSheet -> saveGradesAction ; composant React : PAS de <form> ni de bouton "Envoyer", l'enregistrement se declenche au clic sur "Enregistrer les notes").
Sur /dashboard/evaluations, ligne "Evaluation Test Validation" -> bouton "Saisir les notes" (icone FilePen). Si la classe etait archivee, le bouton s'appelle "Consulter" (icone Lock) et la grille est figee.
STRUCTURE DE LA GRILLE : titre de l'evaluation + sous-titre "classe · cours · date" ; tableau = colonnes "Étudiant" | Lesen "/100 · seuil 60" | Hören "/100 · seuil 60" | Schreiben "/100 · seuil 60" | Sprechen "/100 · seuil 60" | "Bulletin de l'examen". ATTENTION : il n'existe NI colonne "Moyenne" NI colonne "Statut" dans cette grille (la moyenne n'apparait que dans le bulletin).
1. En-tete : Input periode SANS id et SANS name (state React ; sert uniquement au bulletin) — Input w-64, aria-label "Période ou semestre du bulletin d'examen", placeholder "Période / Semestre (ex : S1 2025/2026)", max 60 : = "Session recette 2026". Bouton "Retour" (icone ArrowLeft) a cote.
2. Cellules de note : Input SANS id — cible-les via leur aria-label "Note de {Prénom} {Nom} — {module}". Attributs : name="score_{moduleId}_{studentId}" (moduleId en premier, separateurs "_"), type number, inputMode decimal, min 0, max = bareme du module, step any, placeholder "0–100". Pour Jean TESTEUR : Lesen=75, Hören=80, Schreiben=65, Sprechen=70. Cellule VIDE = retire la note. Ne touche pas aux autres etudiants (Marie est dans l'autre classe, elle n'apparait pas ici).
3. Note SOUS le seuil : bordure rouge + mention "Sous le seuil" sous la cellule, et bandeau ambre "N note(s) sous le seuil de validation (mise en évidence en rouge)." — ici 0 note sous le seuil (60), donc pas de bandeau.
4. Clique "Enregistrer les notes" (pied de grille, spinner "Enregistrement...") : bandeau role="alert" VERT avec le message du serveur. Preuve complementaire : la colonne "Notes saisies" de la ligne passe de 0 a 4 sur /dashboard/evaluations.
5. Clique "Bulletin de l'examen" sur la ligne de Jean (icone Printer, title "Bulletin restreint à cet examen — Jean TESTEUR") -> ExamReportDialog "Bulletin de l'examen — Jean TESTEUR · Evaluation Test Validation" : verifie les 4 notes + la moyenne affichee, puis ferme la modale (impression non obligatoire).
6. INTERDIT : sur une classe ARCHIVED, un bandeau role="alert" "Classe archivée — lecture seule : la saisie et la modification des notes sont désactivées. Les notes existantes restent consultables et imprimables." s'affiche, les cellules sont desactivees (readOnly) et le bouton de pied devient "Lecture seule" : ne tente aucune saisie.
RAPPORT FIN ETAPE 8 : session (3 champs + bloc modules 4 lignes) + notes Jean (4 cellules ciblees par aria-label + bandeau vert + "Notes saisies" = 4) + bulletin + alerts.
```

**Fiche Etape 8 :** CreateEvaluationDialog -> createEvaluationAction : classId (requis), title (max 200), date (REQUISSE, sans defaut), modules 1..20 (moduleName_{i} max 100, moduleMax_{i} 1..1000, modulePassing_{i} >= 0, hidden moduleCount) ; bouton "Préréglage langues" = Lesen / Hören / Schreiben / Sprechen, barème 100 / seuil 60 ; submit "Créer la session" ; AUCUN champ description dans l'UI. Liste /dashboard/evaluations : colonnes Examen | Date | Modules évalués | Notes saisies | Actions ("Saisir les notes" vs "Consulter" + Lock si classe ARCHIVED). GradeSheet : corps { evaluationId, score_{moduleId}_{studentId} } envoye par le bouton "Enregistrer les notes" ; cellules ciblees par aria-label "Note de {etudiant} — {module}" ; sous-seuil => bordure rouge + "Sous le seuil" + bandeau ambre ; classe ARCHIVED => bandeau "Classe archivée — lecture seule…" + cellules readOnly + bouton "Lecture seule" (saveGradesAction refuse aussi cote serveur) ; ExamReportDialog "Bulletin de l'examen — {etudiant} · {evaluation}" (la moyenne y est calculee, absente de la grille) ; module-status.ts : VALIDATED "Validé" | FAILED "Non validé" | RETAKE "À reprendre" | NOT_GRADED "Non noté" (recap de cloture).

---
# ETAPE 9A — PROMPT PRINCIPAL A COPIER-COLLER (POS : article + ouverture caisse)

```text
ETAPE 9A — POS : ARTICLE + OUVERTURE CAISSE (dependance : ETAPES 5-6 — Jean TESTEUR doit exister pour etre selectable comme client).
Va sur /dashboard/pos (PosView). Onglets (TabsList "Sections de la caisse") : "Nouvelle vente" + "Historique des ventes". 4 cartes : "Ventes aujourd'hui" / "Encaissé aujourd'hui" / "Encaissé ce mois" / "Articles au catalogue". Boutons d'en-tete : "Gerer les categories" + "Ajouter un article".
A. ARTICLE (bouton "Ajouter un article" -> CreateProductDialog, modale "Ajouter un article au catalogue", sm:max-w-md, controle) :
1. #create-product-name (name="name", Label "Nom de l'article *", requis, max 120, autoFocus, placeholder "Ex : Livre d'apprentissage B1") = "Manuel de Test".
2. Select categorie (Label "Categorie", Trigger #create-product-category, placeholder "Aucune categorie", item "Sans categorie" = sentinelle __none__ + categories existantes) : laisse "Sans categorie".
3. #create-product-price (name="unitPrice", Label "Prix (FCFA) *", requis, inputMode decimal, placeholder "Ex : 12000") = 5000.
4. Zone "Ou creez une categorie a la volee" : #create-product-quick-category (placeholder "Nouvelle categorie…", Entree ou bouton "Ajouter" actif des 2 caracteres) : IGNORE, laisse vide.
5. Checkbox #create-product-active ("Article disponible a la vente" + "Un article indisponible n'apparait plus dans la grille du POS", cochee par defaut) : LAISSE COCHEE.
6. Boutons "Annuler" / "Créer l'article" (spinner "Creation..."). Fermeture auto si succes. Preuve : carte "Manuel de Test" + "5 000 FCFA" dans la grille (pille "Tout" ou "Sans categorie").
B. OUVERTURE CAISSE (banniere CashSessionStatus, tout en haut de /dashboard/pos -> openCashSession) : si banniere VERTE "Caisse ouverte — Fond de caisse : X — Solde théorique : Y" : note les montants et passe en 9B. Sinon banniere AMBRE "Veuillez ouvrir la caisse pour encaisser" : le champ number (PAS d'id, placeholder "Fond de caisse (0 FCFA accepté)", min 0, step 500) : laisse VIDE ou tape 0 (0 est AUTORISE, caisse peut demarrer vide ; vide = 0). Clique "Ouvrir la caisse" (icone Banknote, spinner). Preuve : banniere verte "Caisse ouverte — Fond de caisse : 0 FCFA — Solde théorique : 0 FCFA". Si message sous la banniere ("Le fond de caisse doit être un montant positif ou nul (0 FCFA accepté).") : le noter.
```

# ETAPE 9B — PROMPT PRINCIPAL (SUITE) : 3 VENTES (systeme x2 + hors-systeme x1)

```text
SUITE ETAPE 9B — 3 VENTES AU COMPTOIR : 2 SYSTEME + 1 HORS-SYSTEME (dependance : 9A. Caisse fermee = alerte ambre "Caisse fermée : ouvrez la caisse (bannière en haut de page) avant d’encaisser cette vente." et bouton "Encaisser & imprimer" grise).
GRILLE "Catalogue" (gauche) : filtres = boutons pille dans le groupe aria-label "Filtrer par categorie" ("Tout" | "Sans categorie" + categories). AUCUN champ de recherche : on ajoute un article en cliquant sa carte (aria-label "Ajouter Manuel de Test au panier") = +1 dans le panier.
PANIER (aside aria-label "Panier de vente", titre "Panier" + badge quantite + bouton "Vider") — a repeter 3 fois :
1. Select client (Label "Client", Trigger #pos-client, placeholder "Sélectionner un client") : options "Client de passage (comptoir)" (valeur walk-in) + groupe "Étudiants inscrits" (Jean TESTEUR (ST-…)) + groupe "Candidats voyage". Vente 1 = Jean TESTEUR ; vente 2 = "Client de passage (comptoir)" ; vente 3 = Jean TESTEUR. Texte d'aide : "Vente rattachée au compte du client" vs "Vente anonyme rattachée à la recette globale".
2. SI walk-in (vente 2 uniquement) : #pos-guest-name (Label "Nom & Prénom (facultatif)", max 120, placeholder "Ex : Awa Traoré") = "Client Comptoir Test" ; #pos-guest-phone (Label "Numéro de téléphone (facultatif)", max 30, placeholder "Ex : +229 01 97 00 00 00") = "+229 01 97 00 00 50". (Vide = facturette "Client de passage" seule.)
3. Quantite de la ligne "Manuel de Test" : boutons aria-label "Diminuer la quantité" / "Augmenter la quantité" / "Retirer Manuel de Test" + champ aria-label "Quantité de Manuel de Test" : garde 1 (Sous-total = NET À PAYER = 5 000).
4. #pos-discount (Label "Remise (FCFA)", placeholder "0") : laisse VIDE (0).
5. Select reglement (Label "Règlement", Trigger #pos-method) = "Especes" pour les 3 ventes.
6. Checkbox #pos-out-of-system (Label "Paiement hors système / Antérieur" + "Vente encaissée hors système ou saisie après coup : elle met à jour le solde débiteur du client, sans impacter le fond de caisse physique du jour") + champ #pos-out-of-system-date (Label "Date de l'encaissement (facultatif — date passée admise)") : ventes 1 et 2 = DECOCHEE, date ignoree ; vente 3 = COCHEE, laisse la date VIDE (= aujourd'hui).
7. Totaux "Sous-total" / "NET À PAYER" = 5 000. Clique "Encaisser & imprimer" (icone Wallet, spinner "Encaissement...") -> modale facturette (apercu iframe + "La vente a été encaissée avec succès…") : clique "Imprimer / Reçu PDF" (fenetre d'impression du navigateur : verifie client, ligne "Manuel de Test", total 5 000, moyen "Especes", puis ANNULLER/Cancel — ne JAMAIS imprimer), puis "Fermer". Panier vide + cartes + banniere recalcules automatiquement.
PREUVES : (1) apres les ventes 1-2, banniere verte = "Caisse ouverte — Fond de caisse : 0 FCFA — Solde théorique : 10 000 FCFA" ; apres la vente 3 (hors-systeme) le solde theorieque RESTE 10 000 (les 5 000 hors-systeme n'alimentent pas le tiroir-caisse ; si tu lis 15 000 : la case #pos-out-of-system n'etait pas cochee -> annule la vente 3 depuis l'historique et rejoue-la). (2) cartes "Ventes aujourd'hui" = 2 et "Encaissé aujourd'hui" = 10 000 F (les hors-systeme sont exclus des stats, cf. getPosStats). (3) onglet "Historique des ventes" (periode "Aujourd'hui", pagination 10/ligne, bouton "Actualiser") : 3 lignes = 2 sans badge (Jean TESTEUR 5 000 + Client Comptoir Test 5 000) + 1 avec badge "Hors système" (Jean TESTEUR 5 000) ; note l'en-tete "Les ventes « hors système » restent visibles ici mais n'alimentent jamais le tiroir-caisse du jour." (4) fiche Jean TESTEUR -> onglet "Relevé général de compte élève" : 2 lignes "Livre" / "1× Manuel de Test" / 5 000 / "Espèces" (les 2 ventes rattachees a Jean alimentent son releve via StudentTransaction ; le badge "Livre" vient de la classification automatique du nom "Manuel"). La vente 2 (Client de passage) n'apparait dans le releve d'aucun etudiant.
RAPPORT FIN ETAPE 9 : article (6 zones) + caisse + 3 ventes (7 zones) + 4 preuves + alerts.
```

**Fiche Etape 9 :** CreateProductDialog (#create-product-name max 120, #create-product-price, #create-product-category sentinelle "Sans categorie", #create-product-quick-category, #create-product-active coche par defaut ; bouton "Créer l'article") ; banniere caisse CashSessionStatus : ouverte = "Caisse ouverte — Fond de caisse : X — Solde théorique : Y" + bouton "Clôturer la caisse" (CloseCashSessionDialog : #counted-amount number min 0 step 500 requis + #close-notes max 255 + "Confirmer la clôture"), fermee = "Veuillez ouvrir la caisse pour encaisser" + input "Fond de caisse (0 FCFA accepté)" + "Ouvrir la caisse" (0 autorise) ; Panier POS : #pos-client (walk-in | student:{id} | candidate:{id}), #pos-guest-name/#pos-guest-phone (walk-in seulement), quantite par ligne, #pos-discount, #pos-method, #pos-out-of-system + #pos-out-of-system-date, totaux "Sous-total"/"NET À PAYER", bouton "Encaisser & imprimer" (bloque si caisse fermee) -> SaleReceiptDialog ("Imprimer / Reçu PDF") ; regle cle : une vente isOutOfSystem = true est EXCLUE du solde theorique (src/lib/actions/cash-register.ts) ET des cartes "Encaissé…" (getPosStats, src/actions/pos.ts), mais reste visible dans l'historique avec le badge "Hors système".

---
# ETAPE 10 — PROMPT PRINCIPAL A COPIER-COLLER (PAIEMENT SCOLARITE HORS-SYSTEME, Jean 50 000)

```text
ETAPE 10 — PAIEMENTS (dependance : ETAPE 6 Jean. SANS aucun etudiant : la modale affiche "Aucun étudiant disponible" + "Ajoutez d'abord au moins un étudiant avant d'enregistrer un paiement." et AUCUN formulaire).
Va sur /dashboard/payments (titre "Paiements"). En-tete : bouton "Échéancier" (CreateScheduleDialog, NON utilise ici) + bouton "Nouveau paiement" (icone Plus -> AddPaymentDialog -> createPaymentAction, modale sm:max-w-lg).
FORMULAIRE PAIEMENT (8 zones, sans exception) :
1. Select name="studentId" (Trigger #studentId, Label "Étudiant *", requis, options "firstName lastName (studentCode)") : "Jean TESTEUR".
2. #amount (name="amount", number "Montant (FCFA) *", requis, min 1, placeholder "Ex : 150000", max 1 Md cote Zod) = 50000.
3. Select name="paymentMethod" (Trigger #paymentMethod, Label "Moyen de paiement *", defaut CASH, 5 options dans l'ordre src/lib/payment-status.ts : "Espèces" | "Virement bancaire" | "Mobile Money" | "Carte bancaire" | "Chèque") : "Espèces".
4. Select name="status" (Trigger #status, Label "Statut" — SANS astérisque, 2 options : "Payé" (COMPLETED, defaut) | "En attente" (PENDING)) : "Payé" (laisse le defaut).
5. #paidAt (name="paidAt", date "Date du règlement", vide = aujourd'hui ; aide "Par défaut : aujourd'hui. Activez « Paiement hors système » pour saisir une date passée.") : laisse VIDE.
6. #reference (name="reference", text "Référence", optionnel mais RECOMMANDEE, max 100, UNIQUE, placeholder "Ex : TXN-MOMO-88231, n° de virement...") = "HORS-SYS-RECETTE-001" (si doublon : role alert -> "HORS-SYS-RECETTE-002").
7. #description (name="description", text "Description", optionnel, max 255, placeholder "Ex : Acompte frais d'inscription (optionnel)") = "Paiement scolarite hors systeme — recette UI" (c'est ce texte qui会成为 la désignation dans le relevé élève).
8. Checkbox #isOutOfSystem (name="isOutOfSystem", Label "Paiement hors système / Antérieur" + "Saisie un règlement antérieur ou externe : met à jour le solde débiteur de l'étudiant sans impacter le fond de caisse physique du jour.") : COCHEE (OBLIGATOIRE ici).
Bouton "Enregistrer le paiement" (icone Banknote, spinner "Enregistrement..."). Refermeture auto si succes.
PREUVES : (1) /dashboard/payments, tableau (colonnes "Étudiant | Montant | Moyen de paiement | Statut | Référence | Date") : ligne "Jean TESTEUR | 50 000 FCFA | Espèces | Payé | HORS-SYS-RECETTE-001 | <date>". (2) Fiche Jean -> onglet "Relevé général de compte élève" : 1 ligne badge vert "Scolarité" + désignation "Paiement scolarite hors systeme — recette UI" + 50 000 + "Espèces" (colonnes : Date | Type | Désignation | Montant | Mode de paiement). (3) La bannière caisse du POS reste à "Solde théorique : 10 000 FCFA" : un paiement hors système n'entre JAMAIS dans le tiroir-caisse. (4) Les 2 ventes POS de Jean (9B) apparaissent toujours dans ce même relevé : 2 lignes "Livre" / "1× Manuel de Test" / 5 000 (sync automatique Caisse → Élève).
RAPPORT FIN ETAPE 10 : les 8 zones + les 4 preuves + alerts. FIN DE RECETTE.
```

**Fiche Etape 10 :** AddPaymentDialog (sm:max-w-lg) -> createPaymentAction : 8 zones = #studentId (Select), #amount (number min 1, max 1 Md cote Zod), #paymentMethod (Select, defaut CASH ; libelles src/lib/payment-status.ts : Espèces / Virement bancaire / Mobile Money / Carte bancaire / Chèque), #status (Select, defaut COMPLETED = "Payé" ; PENDING = "En attente"), #paidAt (date, defaut aujourd'hui), #reference (max 100, UNIQUE), #description (max 255), #isOutOfSystem (checkbox) ; submit "Enregistrer le paiement" (icone Banknote). Regle metier : isOutOfSystem = true met a jour le solde debiteur de l'eleve mais N'ENTRE PAS dans la session de caisse (cf. regle identique cote ventes POS). Etat vide : "Aucun étudiant disponible" (aucun formulaire). Cote liste : PaymentsView (colonnes Étudiant | Montant | Moyen de paiement | Statut | Référence | Date ; recherche "Rechercher par étudiant ou référence..." ; filtres moyen/statut ; bouton "Exporter (CSV)" -> colonnes Référence / Code étudiant / Étudiant / Montant (FCFA) / Moyen de paiement / Statut / Date) ; editions via EntityActionsMenu -> EditPaymentDialog (ids #edit-studentId, #edit-amount, #edit-paymentMethod, #edit-status, #edit-paidAt, #edit-reference, #edit-description, #edit-isOutOfSystem) + PaymentReceiptDialog (reçu imprimable) + deletePaymentAction ; CreateScheduleDialog (bouton "Échéancier", #schedule-start = 1re échéance, NON utilise dans cette etape) ; le releve eleve (StudentTransactionsTab) fusionne payments (badge "Scolarité") + StudentTransaction (badges "Livre" / "Service" / "Autre", crees automatiquement par createSaleAction pour les ventes rattachees a un etudiant, type = classifyTransactionType(noms d'articles), designation = "quantité× nom").

---

## CHECKLIST FINALE (tout cocher avant cloture recette)

| ETAPE | Point | Ou verifier | Etat attendu |
|---|---|---|---|
| 0 | Purge demo | `/dashboard` (carte Donnees de demonstration) | compteur 0 / "Aucune donnee a supprimer" + bouton desactive |
| 1 | Profil etablissement | `/dashboard/organization` | "Centre Recette Validation", frais d'organisation 15 000, radio "Frais d'inscription payés une seule fois par étudiant" cochee |
| 2 | Roles personnalises | `/dashboard/settings/roles` | "Secretaire Recette" + "Enseignant Recette" dans le tableau |
| 3 | Membres | `/dashboard/settings/roles` | Amadou DIALLO (Enseignant + Enseignant Recette) ; Awa SOW (Personnel + Secretaire Recette) |
| 4 | Cours | `/dashboard/courses` | "Allemand General et Intensif (ALL-RECETTE)", 200 000 FCFA, 12 semaines |
| 5 | Classes | `/dashboard/classes` | "Classe Test Validation" (Programmee) + "Classe A Archiver" (Programmee, creneau Lundi 08h-11h) |
| 6A | Etudiants | `/dashboard/students` | Jean TESTEUR (Inscrit, Classe Test Validation, autonome) ; Marie TEMOIN (Inscrit, Classe A Archiver, parent "Maman TEMOIN") — Marie N'EST PAS archivee |
| 6B | Dossier voyage | `/dashboard/travels` | "Candidat Voyage TEST — Allemagne" (candidat externe, 850 000) |
| 7 | Cycle de vie classe B | `/dashboard/classes` + `/close` | "Classe A Archiver" : En cours -> Clôturée -> "Archivée" (Marie = "Redouble") ; "Classe Test Validation" intacte |
| 8A | Evaluation | `/dashboard/evaluations` | "Evaluation Test Validation" (Classe Test Validation) + 4 puces modules (Lesen / Hören / Schreiben / Sprechen) + "Notes saisies" = 0 + bouton "Saisir les notes" |
| 8B | Notes | grille de notes | 4 cellules Jean (75 / 80 / 65 / 70) saisies via aria-label, 0 note sous le seuil, bandeau VERT apres "Enregistrer les notes", "Notes saisies" = 4 ; bulletin "Bulletin de l'examen — Jean TESTEUR" coherent |
| 9A | Article + caisse | `/dashboard/pos` | "Manuel de Test" 5 000 dans la grille ; banniere "Caisse ouverte — Fond de caisse : 0 FCFA — Solde théorique : 0 FCFA" |
| 9B | Ventes | `/dashboard/pos` (onglet Historique des ventes) | 3 lignes : 2 sans badge + 1 badge "Hors système" ; cartes "Ventes aujourd'hui" = 2 / "Encaissé aujourd'hui" = 10 000 F ; solde théorique **10 000** (pas 15 000) |
| 10 | Paiement scolarite | `/dashboard/payments` | Jean 50 000 — Espèces — Payé — ref "HORS-SYS-RECETTE-001" ; caisse du jour inchangee |
| 11 | Releve de Jean | `/dashboard/students/<id>` (onglet "Relevé général de compte élève") | 3 lignes : 1 "Scolarité" 50 000 (paiement hors-systeme ETAPE 10) + 2 "Livre" "1× Manuel de Test" 5 000 (ventes 9B) ; bouton "Imprimer le relevé" actif |

## REJOUABILITE

Refaire ETAPE 0 (bouton "Supprimer la démo" puis confirmation) puis rejouer 1 -> 10 dans l'ordre. La purge demo ne supprime QUE les donnees de demonstration : si des entites de recette subsistent (classe archivee, ventes), supprime-les une par une via les menus d'actions (corbeille) avant de relancer.

---

