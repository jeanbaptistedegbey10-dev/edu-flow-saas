"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, MousePointerClickIcon, PlusIcon, SaveIcon, XIcon } from "lucide-react";

import type { HelpTopicId } from "@/data/helpKnowledgeBase";
import { cn } from "@/lib/utils";

export type { HelpTopicId };

/**
 * Aperçu interactif (Generative UI) de l'interface EduFlow.
 *
 * Chaque maquette reproduit en miniature un écran réel de l'application et met
 * en évidence (halo lumineux + pulsation) l'élément sur lequel l'utilisateur
 * doit agir. Les maquettes sont cliquables pour rendre l'explication vivante.
 */

/** Identifiants des maquettes disponibles : importés de la base de connaissances. */

type TopicMeta = {
  url: string;
  /** Titre de l'écran pour la maquette générique (sujets sans maquette dédiée). */
  screen?: string;
  /** Étapes affichées dans la maquette générique. */
  checklist?: string[];
  /** Libellé du bouton d'action pulsant de la maquette générique. */
  action?: string;
};

const TOPIC_META: Record<HelpTopicId, TopicMeta> = {
  attendance: { url: "eduflow.app/dashboard/attendance" },
  enrollment: { url: "eduflow.app/dashboard/students" },
  visa: { url: "eduflow.app/dashboard/travels" },
  pos: { url: "eduflow.app/dashboard/pos" },
  teachers: {
    url: "eduflow.app/dashboard/courses",
    screen: "Cours & Enseignants",
    checklist: [
      "Nouveau cours — liste « Enseignant »",
      "Choisir le professeur titulaire",
      "Classes assignées mises à jour",
      "Émargement du professeur prêt",
    ],
    action: "Enregistrer le cours",
  },
  classes: {
    url: "eduflow.app/dashboard/classes",
    screen: "Classes / Cohortes",
    checklist: [
      "Nouvelle classe — cours associé",
      "Enseignant titulaire désigné",
      "Capacité d'accueil définie",
      "Jauge d'effectif active",
    ],
    action: "Créer la classe",
  },
  grades: {
    url: "eduflow.app/dashboard/evaluations",
    screen: "Évaluations & Examens",
    checklist: [
      "Session d'examen de la classe",
      "Notes saisies par module",
      "Moyennes calculées automatiquement",
      "Bulletin PDF prêt à imprimer",
    ],
    action: "Générer le bulletin",
  },
  "visa-documents": {
    url: "eduflow.app/dashboard/travels",
    screen: "Dossier — Documents exigés",
    checklist: [
      "Passeport & photos d'identité",
      "Justificatifs financiers",
      "Lettre d'admission scannée",
      "Coche « Document reçu » active",
    ],
    action: "Valider le document",
  },
  "visa-appointment": {
    url: "eduflow.app/dashboard/travels",
    screen: "Dossier — Échéance consulat",
    checklist: [
      "Étape active : rendez-vous ambassade",
      "Date limite renseignée",
      "Pièces du jour J préparées",
      "Compte à rebours visible",
    ],
    action: "Confirmer le rendez-vous",
  },
  "visa-status": {
    url: "eduflow.app/dashboard/travels",
    screen: "Pipeline du candidat",
    checklist: [
      "Test de langue — validé",
      "Admission — validée",
      "Visa — étape en cours",
      "Départ — à venir",
    ],
    action: "Mettre à jour l'étape",
  },
  payments: {
    url: "eduflow.app/dashboard/payments",
    screen: "Paiements — Scolarité",
    checklist: [
      "Étudiant sélectionné",
      "Montant du versement saisi",
      "Moyen de paiement choisi",
      "Reçu officiel généré",
    ],
    action: "Enregistrer le paiement",
  },
  "mobile-money": {
    url: "eduflow.app/dashboard/payments",
    screen: "Paiements — Mobile Money",
    checklist: [
      "MTN / Moov / Wave",
      "Moyen « Mobile Money » coché",
      "ID transaction en référence",
      "Réconciliation trésorerie OK",
    ],
    action: "Valider l'encaissement",
  },
  "financial-exports": {
    url: "eduflow.app/dashboard/tresorerie",
    screen: "Trésorerie — Exports",
    checklist: [
      "Période filtrée",
      "Recettes consolidées",
      "Dépenses consolidées",
      "Export Excel / PDF prêt",
    ],
    action: "Exporter le rapport",
  },
  "class-lifecycle": {
    url: "eduflow.app/dashboard/classes",
    screen: "Cycle de vie de la classe",
    checklist: [
      "Planifiée → Démarrer la classe",
      "En cours → émargement actif",
      "Clôturée → Archiver la classe",
      "Archivée → Désarchiver (réversible)",
    ],
    action: "Démarrer la classe",
  },
  "class-closure": {
    url: "eduflow.app/dashboard/attendance",
    screen: "Clôture — Prérequis",
    checklist: [
      "Séance avec présences saisies",
      "Séance avec cahier de texte rempli",
      "Évaluations créées et notées",
      "Décision par élève",
    ],
    action: "Terminer la classe",
  },
  "bulletin-appreciation": {
    url: "eduflow.app/dashboard/evaluations",
    screen: "Bulletin A4 — Appréciation",
    checklist: [
      "Bulletin ouvert (fiche élève)",
      "« Modifier l'appréciation »",
      "Texte personnalisé enregistré",
      "Badge « Personnalisée » affiché",
    ],
    action: "Enregistrer l'appréciation",
  },
  certificates: {
    url: "eduflow.app/dashboard/certificates",
    screen: "Certificats",
    checklist: [
      "Élève et niveau sélectionnés",
      "Code de vérification généré",
      "QR code public intégré",
      "Impression ou PDF A4 paysage",
    ],
    action: "Générer le certificat",
  },
  "pos-receipts": {
    url: "eduflow.app/dashboard/pos",
    screen: "Caisse / POS — Encaissement libre",
    checklist: [
      "Bandeau « Encaissement libre »",
      "Articles ajoutés au panier",
      "Encaissement enregistré",
      "Facturette imprimable",
    ],
    action: "Encaisser & imprimer",
  },
  "treasury-statement": {
    url: "eduflow.app/dashboard/tresorerie",
    screen: "Trésorerie & Relevés",
    checklist: [
      "Recettes et dépenses consolidées",
      "Solde initial appliqué",
      "Relevé élève fusionné A4",
      "Impression du relevé",
    ],
    action: "Imprimer le relevé",
  },
  "organization-setup": {
    url: "eduflow.app/dashboard/organization",
    screen: "Organisation — Établissement",
    checklist: [
      "Coordonnées et RCCM / IFU",
      "Logo téléversé",
      "Frais d'inscription par défaut",
      "Solde initial + politique",
    ],
    action: "Enregistrer les modifications",
  },
  "backup-restore": {
    url: "eduflow.app/dashboard",
    screen: "Sauvegardes & Restauration",
    checklist: [
      "Sauvegarde auto avant purge",
      "Snapshots conservés 14 jours",
      "Motif et expiration affichés",
      "Confirmation « RESTAURER »",
    ],
    action: "Restaurer la sauvegarde",
  },
  "audit-log": {
    url: "eduflow.app/dashboard/settings/audit-logs",
    screen: "Journal d'audit",
    checklist: [
      "Événements filtrés par action",
      "Auteur et horodatage affichés",
      "Données sensibles masquées",
      "Export CSV vers Excel",
    ],
    action: "Exporter le journal",
  },
  "user-manual": {
    url: "eduflow.app/dashboard/guide",
    screen: "Manuel d'Utilisation",
    checklist: [
      "8 chapitres dans l'ordre des dépendances",
      "Aperçu A4 à l'écran",
      "Destination « Enregistrer au format PDF »",
      "Impression papier disponible",
    ],
    action: "Télécharger le PDF",
  },
  roles: {
    url: "eduflow.app/dashboard/settings/roles",
    screen: "Rôles & Permissions",
    checklist: [
      "Rôle personnalisé créé",
      "Permissions cochées",
      "Membre « Ajouter un membre »",
      "Accès appliqués immédiatement",
    ],
    action: "Enregistrer les droits",
  },
  "dark-mode": {
    url: "eduflow.app/dashboard/settings",
    screen: "Paramètres — Apparence",
    checklist: [
      "Préférences d'affichage",
      "Thème clair / sombre",
      "Option « Système » disponible",
      "Préférence mémorisée",
    ],
    action: "Activer le mode sombre",
  },
  "password-reset": {
    url: "eduflow.app/login",
    screen: "Connexion — Mot de passe",
    checklist: [
      "« Mot de passe oublié ? » cliqué",
      "E-mail du compte saisi",
      "Lien de réinitialisation reçu",
      "Nouveau mot de passe défini",
    ],
    action: "Recevoir le lien",
  },
  "offline-sync": {
    url: "eduflow.app/dashboard/settings",
    screen: "Paramètres — Hors ligne",
    checklist: [
      "Saisies hors ligne enregistrées",
      "File d'attente locale active",
      "Retour du réseau détecté",
      "Bandeau « Synchronisé »",
    ],
    action: "Synchroniser maintenant",
  },
};

/** Sujets disposant d'une maquette interactive dédiée. */
const RICH_TOPIC_IDS = new Set<HelpTopicId>([
  "attendance",
  "enrollment",
  "visa",
  "pos",
]);

// --------------------------------------
// Cadre « navigateur » commun
// --------------------------------------

function PreviewFrame({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-lg shadow-black/30">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/5 px-3 py-2">
        <span className="size-2 rounded-full bg-red-400/80" />
        <span className="size-2 rounded-full bg-amber-400/80" />
        <span className="size-2 rounded-full bg-emerald-400/80" />
        <span className="ml-1 truncate rounded-md bg-ink-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
          {url}
        </span>
      </div>
      {/* « Écran » clair : reproduit le thème lumineux de l'application réelle. */}
      <div className="bg-slate-100 p-3 text-slate-900">{children}</div>
    </div>
  );
}

// --------------------------------------
// Maquette 1 — Feuille de présence
// --------------------------------------

const ATTENDANCE_STUDENTS = [
  { id: "awa", name: "Awa Diop" },
  { id: "moussa", name: "Moussa Traoré" },
  { id: "fatou", name: "Fatou Ndiaye" },
] as const;

const ATTENDANCE_STATUSES = [
  {
    value: "PRESENT",
    label: "Présent",
    classes: "border-emerald-300 bg-emerald-100 text-emerald-700",
  },
  {
    value: "ABSENT",
    label: "Absent",
    classes: "border-red-300 bg-red-100 text-red-700",
  },
  {
    value: "EXCUSED",
    label: "Excusé",
    classes: "border-amber-300 bg-amber-100 text-amber-700",
  },
] as const;

type AttendanceValue = (typeof ATTENDANCE_STATUSES)[number]["value"];

function AttendanceMockup() {
  const [statuses, setStatuses] = React.useState<
    Record<string, AttendanceValue>
  >({ awa: "PRESENT", moussa: "ABSENT", fatou: "EXCUSED" });

  return (
    <div className="space-y-2">
      {/* Barre de sélection : classe + date */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
        <span className="truncate text-[11px] font-semibold text-slate-700">
          Anglais A2 — Groupe Matin
        </span>
        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
          04 sept. 2026
        </span>
      </div>

      {/* Mini-tableau d'appel (statuts cliquables) */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Étudiant</span>
          <span>Statut</span>
        </div>
        {ATTENDANCE_STUDENTS.map((student) => (
          <div
            key={student.id}
            className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 last:border-b-0"
          >
            <span className="truncate text-xs font-medium text-slate-700">
              {student.name}
            </span>
            <div className="flex items-center gap-1">
              {ATTENDANCE_STATUSES.map((status) => {
                const isActive = statuses[student.id] === status.value;

                return (
                  <button
                    key={status.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() =>
                      setStatuses((prev) => ({
                        ...prev,
                        [student.id]: status.value,
                      }))
                    }
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-all",
                      isActive
                        ? cn(status.classes, "scale-105 font-bold shadow-sm")
                        : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50",
                    )}
                  >
                    {status.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bouton d'action avec halo rouge → émeraude */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[10px] italic text-slate-400">
          Astuce : les statuts sont cliquables ↑
        </span>
        <span className="relative inline-flex animate-pulse rounded-lg bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 p-[2px] shadow-[0_0_18px_rgba(16,185,129,0.55)]">
          <span className="inline-flex items-center gap-1 rounded-[calc(0.625rem-2px)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-600">
            <SaveIcon className="size-3" />
            Marquer présence
          </span>
        </span>
      </div>
    </div>
  );
}

// --------------------------------------
// Maquette 2 — Inscription / affectation à une classe
// --------------------------------------

const CLASS_OPTIONS = [
  "Anglais A2 — Matin",
  "Allemand B1 — Soir",
  "Bureautique — Toute la journée",
] as const;

function EnrollmentMockup() {
  const [isOpen, setIsOpen] = React.useState(true);
  const [selected, setSelected] = React.useState<string | null>(null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Barre de titre du mini-dialogue */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-xs font-bold text-slate-800">
          Ajouter un étudiant
        </span>
        <XIcon className="size-3.5 text-slate-300" />
      </div>

      <div className="space-y-2 p-3">
        {/* Identité */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] font-semibold text-slate-500">
              Prénom
            </span>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              Awa
            </div>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-500">
              Nom
            </span>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              Diop
            </div>
          </div>
        </div>

        {/* Liste déroulante « Classe / Cohorte » mise en évidence */}
        <div>
          <span className="text-[10px] font-semibold text-slate-500">
            Classe / Cohorte
          </span>
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
            className={cn(
              "mt-0.5 flex w-full items-center justify-between rounded-md border bg-white px-2 py-1.5 text-xs transition-all",
              isOpen || selected
                ? "border-indigo-500 shadow-[0_0_14px_rgba(79,70,229,0.4)] ring-2 ring-indigo-300/60"
                : "border-slate-300 hover:border-slate-400",
            )}
          >
            <span
              className={cn(
                selected ? "font-semibold text-indigo-700" : "text-slate-400",
              )}
            >
              {selected ?? "Ajouter à une classe…"}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3 text-slate-400 transition-transform",
                isOpen && "rotate-180",
              )}
            />
          </button>

          {isOpen ? (
            <div className="mt-1 space-y-0.5 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
              {CLASS_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSelected(option);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] transition-colors hover:bg-indigo-50",
                    selected === option
                      ? "bg-indigo-50 font-semibold text-indigo-700"
                      : "text-slate-600",
                  )}
                >
                  {option}
                  {selected === option ? (
                    <CheckIcon className="size-3 text-indigo-600" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <p className="mt-1 text-[10px] text-slate-400">
            Les frais de scolarité se verrouillent sur la classe choisie.
          </p>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------
// Maquette 3 — Pipeline de visa (4 étapes)
// --------------------------------------

const VISA_STAGES = ["Dossier", "Test de langue", "Admission", "Visa"] as const;

function VisaMockup() {
  const [activeIndex, setActiveIndex] = React.useState(2);
  const percent = Math.round((activeIndex / VISA_STAGES.length) * 100);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {/* En-tête du dossier */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-800">
            Procédure France — Visa étudiant
          </p>
          <p className="truncate text-[10px] text-slate-500">
            Candidat : Moussa Traoré
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
          En cours
        </span>
      </div>

      {/* Pipeline 4 étapes cliquable */}
      <div
        className="flex items-start"
        role="group"
        aria-label="Étapes du dossier de visa"
      >
        {VISA_STAGES.map((stage, index) => {
          const isDone = index < activeIndex;
          const isActive = index === activeIndex;

          return (
            <React.Fragment key={stage}>
              {index > 0 ? (
                <span
                  className={cn(
                    "mt-3 h-0.5 flex-1 rounded-full",
                    isDone ? "bg-emerald-400" : "bg-slate-200",
                  )}
                />
              ) : null}
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveIndex(index)}
                className="flex w-14 shrink-0 flex-col items-center gap-1"
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border text-[10px] font-bold transition-all",
                    isDone && "border-emerald-400 bg-emerald-100 text-emerald-700",
                    isActive &&
                      "animate-pulse scale-110 border-indigo-500 bg-indigo-600 text-white shadow-[0_0_14px_rgba(79,70,229,0.6)]",
                    !isDone &&
                      !isActive &&
                      "border-slate-300 bg-white text-slate-400",
                  )}
                >
                  {isDone ? <CheckIcon className="size-3" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-center text-[9px] font-medium leading-tight",
                    isActive ? "text-indigo-700" : "text-slate-500",
                  )}
                >
                  {stage}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Progression + légende */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-500">
        Étape active :{" "}
        <span className="font-bold text-indigo-700">
          {VISA_STAGES[activeIndex]}
        </span>{" "}
        — vérifiez les documents exigés puis validez pour avancer.
      </p>
    </div>
  );
}

// --------------------------------------
// Maquette 4 — Caisse POS
// --------------------------------------

const POS_PRODUCTS = [
  { id: "livre", name: "Manuel A2", price: 5000 },
  { id: "trad", name: "Traduction assermentée", price: 15000 },
  { id: "tshirt", name: "T-shirt EduFlow", price: 3000 },
  { id: "cahier", name: "Cahier", price: 500 },
] as const;

/** Formatage déterministe (espaces de milliers) — sans Intl pour éviter tout écart d'hydratation. */
function formatPrice(value: number): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;
}

function PosMockup() {
  const [cart, setCart] = React.useState<Record<string, number>>({});

  const itemCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const total = POS_PRODUCTS.reduce(
    (sum, product) => sum + (cart[product.id] ?? 0) * product.price,
    0,
  );

  return (
    <div className="grid grid-cols-[1fr_92px] gap-2">
      {/* Grille d'articles (clic = ajout au panier) */}
      <div className="grid grid-cols-2 content-start gap-1.5">
        {POS_PRODUCTS.map((product) => {
          const quantity = cart[product.id] ?? 0;

          return (
            <button
              key={product.id}
              type="button"
              aria-label={`Ajouter ${product.name} au panier`}
              onClick={() =>
                setCart((prev) => ({
                  ...prev,
                  [product.id]: (prev[product.id] ?? 0) + 1,
                }))
              }
              className={cn(
                "rounded-lg border bg-white p-2 text-left shadow-sm transition-all hover:-translate-y-px hover:shadow",
                quantity > 0
                  ? "border-emerald-300 ring-1 ring-emerald-300/60"
                  : "border-slate-200",
              )}
            >
              <span className="block truncate text-[10px] font-semibold text-slate-700">
                {product.name}
              </span>
              <span className="mt-0.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  {formatPrice(product.price)}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600">
                  <PlusIcon className="size-2.5" />
                  {quantity > 0 ? quantity : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Panier */}
      <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
        <span className="border-b border-slate-100 pb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
          Panier ({itemCount})
        </span>
        <div className="flex-1 space-y-0.5 py-1">
          {itemCount === 0 ? (
            <p className="text-[9px] italic text-slate-400">
              Cliquez un article pour l&apos;ajouter.
            </p>
          ) : (
            POS_PRODUCTS.filter((product) => (cart[product.id] ?? 0) > 0).map(
              (product) => (
                <p
                  key={product.id}
                  className="truncate text-[9px] text-slate-600"
                >
                  {product.name} ×{cart[product.id]}
                </p>
              ),
            )
          )}
        </div>
        <span className="border-t border-slate-100 pt-1 text-[10px] font-bold text-slate-700">
          Total : {formatPrice(total)}
        </span>
        <span className="mt-1 inline-flex animate-pulse items-center justify-center rounded-md bg-emerald-500 px-1 py-1.5 text-center text-[9px] font-bold text-white shadow-[0_0_14px_rgba(16,185,129,0.6)]">
          Encaisser &amp; imprimer
        </span>
      </div>
    </div>
  );
}

// --------------------------------------
// Maquette générique (sujets sans maquette dédiée)
// --------------------------------------

/**
 * Mini-écran générique : barre de titre, étapes du workflow (la première est
 * mise en évidence avec pulsation) et bouton d'action clignotant. Alimentée
 * par les métadonnées de `TOPIC_META` pour chaque nouveau sujet.
 */
function GenericScreenMockup({
  screen,
  checklist,
  action,
}: {
  screen: string;
  checklist: string[];
  action: string;
}) {
  return (
    <div className="space-y-2">
      {/* Barre de titre de l'écran */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
        <span className="truncate text-[11px] font-semibold text-slate-700">
          {screen}
        </span>
        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
          EduFlow
        </span>
      </div>

      {/* Étapes du workflow (première étape active) */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {checklist.map((row, index) => (
          <div
            key={row}
            className={cn(
              "flex items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 last:border-b-0",
              index === 0 && "bg-indigo-50/70",
            )}
          >
            <span
              className={cn(
                "flex size-3.5 shrink-0 items-center justify-center rounded-full",
                index === 0
                  ? "animate-pulse bg-indigo-500 text-white ring-2 ring-indigo-300"
                  : "bg-emerald-100 text-emerald-600",
              )}
            >
              {index === 0 ? (
                <PlusIcon className="size-2.5" />
              ) : (
                <CheckIcon className="size-2.5" />
              )}
            </span>
            <span
              className={cn(
                "truncate text-xs",
                index === 0
                  ? "font-semibold text-indigo-700"
                  : "font-medium text-slate-600",
              )}
            >
              {row}
            </span>
          </div>
        ))}
      </div>

      {/* Action principale */}
      <span className="inline-flex w-full animate-pulse items-center justify-center rounded-md bg-emerald-500 px-1 py-1.5 text-center text-[9px] font-bold text-white shadow-[0_0_14px_rgba(16,185,129,0.6)]">
        {action}
      </span>
    </div>
  );
}

// --------------------------------------
// Composant public
// --------------------------------------

/**
 * Rend la maquette interactive correspondant au sujet d'aide demandé.
 * Affichée dans les réponses de l'assistant (`HelpAssistant`).
 */
export function HelpUiPreview({
  topic,
  className,
}: {
  topic: HelpTopicId;
  className?: string;
}) {
  return (
    <div className={className}>
      <PreviewFrame url={TOPIC_META[topic].url}>
        {topic === "attendance" ? <AttendanceMockup /> : null}
        {topic === "enrollment" ? <EnrollmentMockup /> : null}
        {topic === "visa" ? <VisaMockup /> : null}
        {topic === "pos" ? <PosMockup /> : null}
        {!RICH_TOPIC_IDS.has(topic) &&
        TOPIC_META[topic].screen &&
        TOPIC_META[topic].checklist &&
        TOPIC_META[topic].action ? (
          <GenericScreenMockup
            screen={TOPIC_META[topic].screen!}
            checklist={TOPIC_META[topic].checklist!}
            action={TOPIC_META[topic].action!}
          />
        ) : null}
      </PreviewFrame>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
        <MousePointerClickIcon className="size-3 shrink-0" />
        Aperçu interactif — cliquez sur les éléments pour essayer.
      </p>
    </div>
  );
}