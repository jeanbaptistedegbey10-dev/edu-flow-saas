// --------------------------------------
// Manuel d'Utilisation officiel — contenu
// --------------------------------------
//
// SOURCE UNIQUE du Manuel d'Utilisation EduFlow. Ce module ne contient QUE des
// données : il est importable côté serveur (page `/dashboard/guide`) comme côté
// client (aperçu interactif), à l'instar de `src/data/helpKnowledgeBase.ts`.
//
// ORDRE DES CHAPITRES : il suit l'ORDRE STRICT DES DÉPENDANCES SYSTÈME —
// chaque chapitre ne peut être utilisé qu'après le précédent. Commencer par une
// classe sans cours parent, ou clôturer une classe jamais démarrée, est
// impossible dans EduFlow : le manuel reflète cette réalité.
//
//   1. Configuration & Organisation  (racine : sans identité, rien n'existe)
//   2. Accès & Enseignants           (les comptes qui utiliseront l'application)
//   3. Structure Pédagogique         (cours, modules, barèmes, seuils)
//   4. Classes & Élèves              (les cohortes et leurs inscrits)
//   5. Suivi Quotidien               (présences, cahier de texte, évaluations)
//   6. Finances & Caisse POS         (encaissements, ventes, trésorerie)
//   7. Clôture, Bulletins & Certificats (la fin du cycle)
//   8. Sécurité & Traçabilité        (journal d'audit, masquage, exports)
//
// Le manuel ne se substitue PAS à l'assistant d'aide (widget flottant) : il
// donne la vue d'ensemble et les règles ; l'assistant donne le pas-à-pas d'un
// écran précis.

/**
 * Un bloc pédagogique du manuel : un groupe d'étapes. La numérotation est
 * continue dans le document (a. / b. / c.) plutôt que « 1.1 » — l'ordre des
 * dépendances est porté par le numéro de chapitre.
 */
export type ManualBlock = {
  /** Titre du bloc (ex. « Créer l'établissement »). */
  title: string;
  /** Étapes ordonnées, rédigées à l'impératif. */
  steps: string[];
  /**
   * Encart « à savoir » : règle métier, garde-fou ou piège fréquent.
   * Affiché dans un cadre coloré ; omis si absent.
   */
  note?: string;
  /**
   * Avertissement de sécurité / opération irréversible : affiché dans un
   * bandeau rouge, plus visible qu'un simple encart.
   */
  warning?: string;
};

/** Un chapitre du manuel (correspond à une partie du document imprimé). */
export type ManualChapter = {
  /** Numéro du chapitre (1 à 8) — porte l'ordre des dépendances. */
  number: number;
  /** Titre du chapitre. */
  title: string;
  /** Phrase d'accroche affichée sous le titre. */
  summary: string;
  /** Blocs du chapitre, dans l'ordre de lecture. */
  blocks: ManualBlock[];
};

/** Titre officiel du document (page de garde + en-tête du PDF). */
export const MANUAL_TITLE = "Manuel d'Utilisation";

/**
 * Version du manuel, affichée en page de garde et au pied du document.
 * À incrémenter lors de toute évolution majeure du contenu.
 */
export const MANUAL_VERSION = "1.0";

/** Les 8 chapitres du Manuel d'Utilisation, dans l'ordre des dépendances. */
export const MANUAL_CHAPTERS: ManualChapter[] = [
  {
    number: 1,
    title: "Configuration & Organisation",
    summary:
      "Identité de l'établissement, paramètres financiers de départ et gestion des jeux de démonstration. Ce chapitre conditionne l'affichage de tous les documents officiels (bulletins, reçus, certificats).",
    blocks: [
      {
        title: "Créer et paramétrer l'établissement",
        steps: [
          "Rendez-vous dans « Organisation » depuis la barre latérale.",
          "Renseignez l'identité : nom de l'établissement, e-mail, téléphone, adresse, ville et site web.",
          "Ajoutez les identifiants légaux : N° RCCM et N° IFU / NIF. Ils figurent au pied des documents imprimés.",
          "Téléversez votre logo (recadrage intégré) ou collez une URL d'image : il apparaît sur les bulletins, les reçus et les certificats.",
          "Cliquez sur « Enregistrer les modifications ». Un bandeau vert confirme la prise en compte immédiate, sans rechargement de page.",
        ],
        note:
          "Ces informations alimentent l'en-tête et le pied de page légal de tous les documents imprimés. Renseignez-les avant toute impression officielle.",
      },
      {
        title: "Définir le solde initial et la politique d'inscription",
        steps: [
          "Dans le bloc « Paramètres financiers », saisissez le solde initial de caisse : le montant en caisse à la date de démarrage du logiciel.",
          "Fixez les frais d'inscription par défaut appliqués à chaque nouvel élève inscrit.",
          "Choisissez la politique d'inscription : frais payés une seule fois par étudiant, ou à chaque nouveau cours / nouvelle classe.",
          "Enregistrez : le solde total de la trésorerie suit désormais la formule Solde initial + Encaissements − Dépenses.",
        ],
        note:
          "La politique choisie s'applique immédiatement à la facturation. Un élève déjà inscrit n'est pas refacturé si vous choisissez « une seule fois par étudiant ».",
      },
      {
        title: "Jeu de démonstration : injection et purge",
        steps: [
          "Sur le tableau de bord, la carte « Données de démonstration » permet d'injecter un jeu d'essai ou de réinitialiser l'organisation.",
          "L'injection exige la saisie du mot CONFIRMER : elle remplace les données existantes.",
          "La suppression exige le mot SUPPRIMER : elle est irréversible en elle-même.",
          "L'opération s'exécute par étapes séquentielles (données financières, puis cours et évaluations, puis élèves) avec un suivi visuel de la progression.",
        ],
        warning:
          "Ces deux opérations sont couvertes par une sauvegarde automatique. Si le résultat ne vous convient pas, restaurez-la : voir « Restaurer une sauvegarde » au chapitre 8.",
      },
    ],
  },
  {
    number: 2,
    title: "Accès & Enseignants",
    summary:
      "Création des comptes, attribution des rôles et des permissions. Un compte sans rôle ne voit rien : commencez toujours par cette étape avant d'inviter l'équipe.",
    blocks: [
      {
        title: "Créer les comptes et attribuer les rôles",
        steps: [
          "Ouvrez « Rôles & Permissions » dans la barre latérale (réservé aux administrateurs).",
          "Cliquez sur « Ajouter un membre » et renseignez prénom, nom et e-mail : le compte reçoit ses identifiants.",
          "Choisissez le rôle : Administrateur (ADMIN), Personnel / secrétaire (STAFF) ou Enseignant (TEACHER).",
          "Le rôle détermine immédiatement les modules visibles et les actions autorisées.",
        ],
        note:
          "Le rôle Super admin (SUPER_ADMIN) est réservé à l'exploitation de la plateforme : n'utilisez pas ce compte au quotidien.",
      },
      {
        title: "Comprendre les permissions",
        steps: [
          "Un rôle personnalisé se crée depuis « Rôles & Permissions » : cliquez sur « Créer un rôle » (ex. « Secrétaire Adjoint »).",
          "Cochez les permissions accordées : Finance, Inscription, Suppression, Caisse / POS, Procédures voyage, Évaluations, Présences, Dépenses, Paramètres.",
          "Attribuez ensuite ce rôle personnalisé aux membres concernés.",
          "Les droits s'appliquent immédiatement, sans déconnexion nécessaire.",
        ],
        note:
          "Le rôle Enseignant est volontairement restreint : il ne donne accès ni aux paiements, ni à la caisse, ni aux dépenses, ni aux paramètres.",
      },
      {
        title: "Rattacher un enseignant à un cours",
        steps: [
          "Créez d'abord le compte du professeur (rôle Enseignant) à l'étape précédente.",
          "Ouvrez « Cours » puis créez un nouveau cours, ou modifiez un cours existant.",
          "Sélectionnez le professeur dans la liste « Enseignant » et enregistrez.",
          "L'enseignant voit désormais uniquement ses cours, ses classes assignées, son émargement et ses cahiers de texte.",
        ],
      },
    ],
  },
  {
    number: 3,
    title: "Structure Pédagogique",
    summary:
      "Création des cours, paramétrage des modules, barèmes et seuils de validation. Les cours sont la matière première des classes : ils doivent exister avant toute inscription.",
    blocks: [
      {
        title: "Créer un cours et ses modules",
        steps: [
          "Ouvrez « Cours » dans la barre latérale puis cliquez sur « Nouveau cours ».",
          "Saisissez l'intitulé, le code du cours et la durée ; associez l'enseignant titulaire.",
          "Définissez les modules du cours : un module est une unité évaluable (ex. « Compréhension orale »).",
          "Pour chaque module, fixez le barème (note maximale) et le seuil de validation.",
          "Enregistrez le cours : il devient disponible pour la création de classes.",
        ],
        note:
          "La validation est calculée MODULE PAR MODULE : un module est validé dès que la note atteint son seuil. Aucune moyenne pondérée n'est appliquée.",
      },
      {
        title: "Comprendre les statuts de module",
        steps: [
          "Validé : la note atteint ou dépasse le seuil défini.",
          "Non validé : la note est inférieure au seuil.",
          "À reprendre : le module est explicitement renvoyé en rattrapage lors de la clôture.",
          "Non noté : aucune note n'a été saisie — le module n'est jamais compté comme un échec.",
        ],
        note:
          "Un élève n'est proposé au passage automatique que si au moins un module est noté, qu'aucun module noté n'est en échec et qu'aucun module évalué n'est resté sans note.",
      },
    ],
  },
  {
    number: 4,
    title: "Classes & Élèves",
    summary:
      "Ouverture des classes, inscription des élèves, gestion des tuteurs et contacts d'urgence. La classe est le récipient des élèves : c'est elle qui les rattache aux cours, à l'emploi du temps et à l'émargement.",
    blocks: [
      {
        title: "Ouvrir une classe",
        steps: [
          "Ouvrez « Classes » dans la barre latérale puis cliquez sur « Nouvelle classe ».",
          "Choisissez le cours associé (ex. « Anglais A2 ») et l'horaire de la cohorte.",
          "Désignez l'enseignant titulaire : il retrouvera la classe dans son émargement.",
          "Fixez la capacité d'accueil : la jauge d'effectif se met à jour à chaque inscription.",
          "La classe est créée au statut « Planifiée ». Utilisez « Démarrer la classe » pour la rendre exploitable.",
        ],
        note: "Une classe « Planifiée » n'apparaît pas encore dans les sélecteurs de présence : démarrez-la avant de faire l'appel.",
      },
      {
        title: "Inscrire un élève",
        steps: [
          "Ouvrez « Étudiants » puis cliquez sur « Ajouter un étudiant ».",
          "Renseignez les informations de base : prénom, nom, e-mail et téléphone.",
          "Sélectionnez la classe dans la liste « Classe / Cohorte » : les frais se verrouillent sur le tarif de la classe choisie.",
          "Cochez « L'étudiant est autonome / s'assume lui-même » si aucun tuteur n'est rattaché ; sinon, les champs du responsable financier deviennent obligatoires.",
          "Si l'élève est au statut « Inscrit », indiquez si les frais d'inscription sont « Payés » (écriture en caisse) ou « Payés hors système » (aucune écriture comptable).",
          "Validez : l'élève apparaît immédiatement dans sa classe, l'emploi du temps et la feuille de présence.",
        ],
        note:
          "Les frais d'inscription ne sont facturés qu'une seule fois si vous avez choisi la politique « une seule fois par étudiant » (chapitre 1).",
      },
      {
        title: "Tuteurs et contacts d'urgence",
        steps: [
          "Pour un élève non autonome, renseignez le nom du parent ou tuteur, le lien avec l'élève (Père, Mère, Tuteur, Garant, Autre) et le téléphone principal.",
          "Le téléphone secondaire est facultatif.",
          "Ces informations permettent de joindre le responsable en cas d'urgence.",
        ],
      },
    ],
  },
  {
    number: 5,
    title: "Suivi Quotidien",
    summary:
      "Émargement des présences, remplissage du cahier de texte, création et notation des évaluations. Ce chapitre alimente directement les prérequis de clôture du chapitre 7.",
    blocks: [
      {
        title: "Faire l'appel (émargement)",
        steps: [
          "Ouvrez « Présences & Cahier de texte » dans la barre latérale.",
          "Sélectionnez la classe et la date : les statuts déjà enregistrés se rechargent automatiquement. La date du jour est présélectionnée.",
          "Pour chaque élève, cliquez sur un statut rapide : Présent, Absent, Retard ou Excusé. Une remarque facultative peut être ajoutée.",
          "Cliquez sur « Enregistrer les présences » : un bandeau vert confirme la sauvegarde.",
        ],
        note: "Le sélecteur de classe n'expose que les classes « Planifiées » et « En cours » : une classe clôturée ou archivée n'est plus une destination d'appel.",
      },
      {
        title: "Remplir le cahier de texte",
        steps: [
          "Dans la vue unifiée « Présences & Cahier de texte », ouvrez l'onglet du cahier de texte de la séance.",
          "Saisissez le contenu de la séance : leçons dispensées, devoirs donnés, supports utilisés.",
          "Enregistrez : le cahier de texte alimente le suivi pédagogique de la classe.",
        ],
        note: "Au moins une séance avec cahier de texte rempli est un prérequis bloquant de la clôture d'une classe.",
      },
      {
        title: "Créer et noter une évaluation",
        steps: [
          "Ouvrez « Évaluations & Examens » puis créez une session d'examen pour une classe.",
          "Sélectionnez les modules évalués : leurs barèmes et seuils sont repris automatiquement.",
          "Saisissez les notes élève par élève : la moyenne générale se calcule au fil de l'eau.",
          "Chaque module affiche son statut (Validé / Non validé) dès que la note est saisie.",
          "Enregistrez les notes : toutes les notes doivent être saisies pour débloquer la clôture.",
        ],
        note: "Une évaluation créée mais incomplètement notée bloque la clôture de la classe : elle est signalée dans le récapitulatif.",
      },
      {
        title: "Personnaliser l'appréciation du bulletin",
        steps: [
          "Ouvrez le bulletin d'un élève depuis sa fiche (bouton « Voir / Imprimer le rapport ») ou depuis le récapitulatif d'une classe.",
          "Sous le bloc « Appréciation », cliquez sur « Modifier l'appréciation ».",
          "Remplacez le texte automatique, généré à partir des résultats, par votre commentaire personnalisé.",
          "Enregistrez : un badge « Personnalisée » signale que le texte est le vôtre, et il s'imprime tel quel sur le bulletin A4.",
          "« Texte automatique » restaure le commentaire calculé ; enregistrer un champ vide supprime le texte personnalisé.",
        ],
        note: "Sur une classe archivée, l'appréciation est figée en lecture seule.",
      },
    ],
  },
  {
    number: 6,
    title: "Finances & Caisse POS",
    summary:
      "Encaissement des frais de scolarité, ventes au comptoir, sessions de caisse et relevés de trésorerie. L'encaissement est libre : aucune session n'a besoin d'être ouverte pour vendre.",
    blocks: [
      {
        title: "Encaisser les frais de scolarité",
        steps: [
          "Ouvrez « Paiements » puis cliquez sur « Nouveau paiement ».",
          "Sélectionnez l'étudiant : le net à payer et le reste dû s'affichent automatiquement.",
          "Saisissez le montant du versement et le moyen de paiement (Espèces, Mobile Money, Virement bancaire, Carte bancaire, Chèque).",
          "Ajoutez une référence (ex. « PAY-2026-0001 » ou l'ID de la transaction Mobile Money).",
          "Enregistrez : le reçu officiel est généré et imprimable, et le solde de l'étudiant se met à jour.",
        ],
        note: "Pour un règlement Mobile Money (MTN, Moov, Wave), recopiez l'ID de transaction reçu par SMS dans le champ « Référence » pour la réconciliation.",
      },
      {
        title: "Vendre au comptoir (client de passage)",
        steps: [
          "Ouvrez « Caisse / POS » : le bandeau « Encaissement libre » est purement informatif, vous pouvez encaisser à tout moment.",
          "Ajoutez les articles ou services au panier, ou saisissez une vente libre pour un client de passage (nom et téléphone).",
          "Encaissez : la vente est enregistrée et la recette alimente la caisse du jour.",
          "Cliquez sur « Encaisser & imprimer » : la facturette s'ouvre immédiatement (n° de ticket, client, caissier, lignes, net à payer).",
          "Retrouvez et réimprimez n'importe quelle vente depuis l'onglet « Historique des ventes ».",
        ],
        note: "Aucune session de caisse n'a besoin d'être ouverte : la vente aboutit dans tous les cas.",
      },
      {
        title: "Suivre la trésorerie",
        steps: [
          "Ouvrez « Trésorerie » dans la barre latérale : recettes (scolarité + caisse), dépenses et solde net y sont consolidés.",
          "Le solde total applique la formule : Solde initial + Encaissements − Dépenses.",
          "Pour un élève précis, ouvrez sa fiche puis l'onglet « Relevé général de compte élève » : scolarité et achats au comptoir y sont fusionnés sur une chronologie unique.",
          "Cliquez sur « Imprimer le relevé » pour produire un document A4.",
        ],
      },
      {
        title: "Exports financiers",
        steps: [
          "Dans « Trésorerie », filtrez la période à analyser (mois, trimestre, année).",
          "Lancez l'export de l'état financier, ou imprimez la vue depuis le navigateur.",
          "Les reçus et facturettes restent imprimables individuellement depuis « Paiements » et « Caisse / POS ».",
        ],
      },
    ],
  },
  {
    number: 7,
    title: "Clôture, Bulletins & Certificats",
    summary:
      "Vérification des prérequis, clôture de la classe, génération des bulletins A4 avec suivi d'assiduité, archivage / désarchivage et certificats. Dernier maillon du cycle de vie d'une classe.",
    blocks: [
      {
        title: "Les 3 prérequis de clôture",
        steps: [
          "Au moins une séance avec présences saisies.",
          "Au moins une séance avec cahier de texte rempli.",
          "Des évaluations créées et entièrement notées (aucune note manquante).",
        ],
        warning:
          "Si l'un de ces prérequis manque, le dialogue « Clôture impossible — prérequis manquants » s'ouvre et liste précisément ce qui bloque. La navigation vers l'écran de clôture reste bloquée tant que le prérequis n'est pas satisfait.",
      },
      {
        title: "Clôturer la classe",
        steps: [
          "Dans « Présences & Cahier de texte », cliquez sur « Terminer la classe » dans l'en-tête.",
          "Une fois les prérequis réunis, l'écran de clôture s'ouvre : chaque élève y est présenté module par module (note, barème, seuil, statut).",
          "Vérifiez la décision proposée automatiquement (Admis si tous les modules sont validés, sinon Redouble) et ajustez-la élève par élève si nécessaire.",
          "Choisissez éventuellement une classe de destination pour le passage (A1 → A2) ; les admis sans destination restent rattachés à la classe clôturée.",
          "Activez la facturation des frais de réinscription si votre politique l'impose, puis validez la clôture.",
        ],
        note: "La clôture est un acte de gestion : elle est réservée aux rôles administratifs (Administrateur, Super admin).",
      },
      {
        title: "Générer le bulletin A4",
        steps: [
          "Depuis la fiche d'un élève, cliquez sur « Voir / Imprimer le rapport ».",
          "Le bulletin A4 s'affiche : logo et en-tête de l'établissement, cartouche élève, notes par module, bloc d'assiduité, appréciation et zones de signature.",
          "Personnalisez l'appréciation si nécessaire (voir chapitre 5).",
          "Cliquez sur « Imprimer » : la mise en page A4 est respectée, sans coupure de texte, et l'enregistrement en PDF est disponible depuis la boîte d'impression.",
        ],
        note: "Le récapitulatif d'une classe produit le même bulletin pour l'ensemble des élèves, avec un suivi d'assiduité consolidé.",
      },
      {
        title: "Archiver et désarchiver une classe",
        steps: [
          "Une classe « Clôturée » peut être archivée : elle passe en lecture seule et reste consultable dans l'onglet « Archives ».",
          "L'historique (inscriptions, notes, certificats) est intégralement conservé.",
          "Cliquez sur « Désarchiver » dans l'onglet « Archives » : la classe redevient exploitable et son effectif est réactivé.",
          "L'action est réservée aux administrateurs et n'est jamais destructive.",
        ],
        note: "Le désarchivage est l'action inverse de l'archivage : il n'existe pas de suppression de classe dans EduFlow.",
      },
      {
        title: "Générer un certificat",
        steps: [
          "Ouvrez « Certificats » dans la barre latérale.",
          "Cliquez sur « Générer un certificat » et choisissez l'élève, la formation et le niveau validé.",
          "Le document porte un code de vérification unique et un QR code.",
          "Imprimez le certificat (A4 paysage) ou téléchargez-le en PDF depuis sa fiche.",
          "L'authenticité est vérifiable publiquement en scannant le QR code ou via l'URL /verify/<code>.",
        ],
      },
    ],
  },
  {
    number: 8,
    title: "Sécurité & Traçabilité",
    summary:
      "Journal d'audit, masquage automatique des données sensibles, export des rapports et sauvegardes. Ce chapitre explique comment chaque opération est tracée et comment une récupération reste toujours possible.",
    blocks: [
      {
        title: "Consulter le journal d'audit",
        steps: [
          "Ouvrez « Paramètres » puis « Journal d'audit » dans la barre latérale (fonction disponible selon votre formule).",
          "Le tableau liste les événements du plus récent au plus ancien : date, utilisateur, action, entité concernée.",
          "Filtrez par recherche, par action ou par utilisateur pour retrouver un événement précis.",
          "Cliquez sur « Voir détails » pour afficher le détail complet de l'opération.",
        ],
        note: "Sont tracés notamment : ventes POS, paiements, clôtures et archives de classes, sauvegardes, créations et suppressions de comptes.",
      },
      {
        title: "Masquage des données sensibles",
        steps: [
          "Les mots de passe, jetons d'authentification, clés d'API, signatures, coordonnées bancaires et identifiants techniques internes ne sont jamais enregistrés dans le journal.",
          "Ils sont remplacés par la mention « donnée sensible masquée », y compris sur les entrées écrites avant l'introduction de cette protection.",
          "Ce mécanisme est appliqué à l'écriture ET à la lecture : un secret introduit par erreur dans une ancienne entrée reste masqué.",
        ],
        note: "Cette protection est automatique : l'utilisateur ne peut pas la contourner depuis l'interface.",
      },
      {
        title: "Exporter les rapports",
        steps: [
          "Dans le journal d'audit, cliquez sur « Exporter » pour télécharger le journal au format CSV.",
          "Le fichier s'ouvre directement dans Microsoft Excel (encodage et séparateur adaptés).",
          "Les états financiers et relevés s'exportent ou s'impriment depuis « Trésorerie » et la fiche élève.",
        ],
      },
      {
        title: "Restaurer une sauvegarde",
        steps: [
          "Sur le tableau de bord, ouvrez « Historique des sauvegardes ».",
          "Chaque entrée indique le motif (Automatique avant suppression / avant restauration / Manuelle), le nombre d'enregistrements, le poids et la date d'expiration.",
          "Cliquez sur « Restaurer » puis saisissez le mot RESTAURER pour confirmer.",
          "Une sauvegarde de sécurité de l'état courant est créée automatiquement avant l'écrasement : une restauration est donc elle-même réversible.",
        ],
        note: "Les sauvegardes sont conservées 14 jours : passé ce délai, elles sont purgées de l'historique et ne sont plus restaurables.",
      },
    ],
  },
];

/**
 * Nombre de chapitres (8) — utilisé par la page de garde pour annoncer la
 * structure du document et garantir la couverture de l'ordre des dépendances.
 */
export const MANUAL_CHAPTER_COUNT = MANUAL_CHAPTERS.length;
