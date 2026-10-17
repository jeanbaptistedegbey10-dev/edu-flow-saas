import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Church,
  FileChartColumn,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Tableau de bord | EduFlow",
  description:
    "Hub modulaire du tableau de bord EduFlow : communauté (membres), finances (cotisations & quêtes), cultes & événements, rapports & clôture.",
};

/**
 * Module = carte interactive du hub. La liste est modulable : ajouter un
 * objet ici suffit à afficher une nouvelle carte (libellé, description,
 * icône, points d'accès rapides et route cible).
 */
interface DashboardModule {
  /** Clé stable (React key). */
  key: string;
  /** Titre de la carte. */
  title: string;
  /** Sous-titre affiché entre parenthèses. */
  subtitle: string;
  /** Description courte sous le titre. */
  description: string;
  /** Route ouverte au clic. */
  href: string;
  /** Icône lucide-react. */
  icon: LucideIcon;
  /** Points d'accès rapides, listés en pied de carte. */
  highlights: readonly string[];
}

const DASHBOARD_MODULES: readonly DashboardModule[] = [
  {
    key: "communaute",
    title: "Communauté",
    subtitle: "(Membres)",
    description:
      "Membres, apprenants et équipe : profils, inscriptions et suivi individuel.",
    href: "/dashboard/students",
    icon: Users,
    highlights: ["Apprenants & prospects", "Équipe", "Inscriptions"],
  },
  {
    key: "finances",
    title: "Finances",
    subtitle: "(Cotisations & Quêtes)",
    description:
      "Cotisations, quêtes, paiements et échéances : la trésorerie du centre en un coup d'œil.",
    href: "/dashboard/tresorerie",
    icon: Wallet,
    highlights: ["Paiements", "Échéances", "Trésorerie"],
  },
  {
    key: "cultes-evenements",
    title: "Cultes & Événements",
    subtitle: "(Agenda)",
    description:
      "Calendrier des cultes, séances et événements, avec émargement et présences associés.",
    href: "/dashboard/calendar",
    icon: Church,
    highlights: ["Agenda", "Séances", "Présences"],
  },
  {
    key: "rapports-cloture",
    title: "Rapports & Clôture",
    subtitle: "(Synthèses)",
    description:
      "Rapports pédagogiques et financiers, clôture des classes et archives.",
    href: "/dashboard/classes",
    icon: FileChartColumn,
    highlights: ["Statistiques", "Clôture de classe", "Archives"],
  },
];

/** Carte interactive d'un module (hover : bordure lavande + élévation). */
function ModuleCard({ entry }: { entry: DashboardModule }) {
  const Icon = entry.icon;

  return (
    <Link href={entry.href} className="ds-card group flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-12 place-items-center rounded-xl border border-lavande/30 bg-violet-core/15 text-lavande transition-colors group-hover:bg-violet-core/25">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <ArrowRight
          className="size-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-lavande"
          aria-hidden="true"
        />
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          {entry.title}{" "}
          <span className="text-sm font-medium text-lavande">
            {entry.subtitle}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{entry.description}</p>
      </div>

      <ul className="mt-auto flex flex-wrap gap-2 pt-2">
        {entry.highlights.map((highlight) => (
          <li
            key={highlight}
            className="rounded-full border border-card-border bg-active-soft px-2.5 py-1 text-xs font-medium text-active-fg"
          >
            {highlight}
          </li>
        ))}
      </ul>
    </Link>
  );
}

/**
 * Hub modulaire du tableau de bord (Étape 2) — page d'accueil `/`.
 *
 * Server Component statique : aucune donnée privée n'y est rendue. Les liens
 * renvoient vers les sections protégées `/dashboard/*` (le proxy les redirige
 * vers /login si la session est absente).
 */
export default function DashboardHubPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-lavande">
            EduFlow — Espace de travail
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">
            Tableau de bord
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Quatre modules pour piloter votre centre : sélectionnez une carte
            pour ouvrir la section correspondante.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg border border-card-border bg-active-soft px-4 py-2 text-sm font-medium text-active-fg transition-colors hover:border-lavande"
          >
            Connexion
          </Link>
          <Link
            href="/accueil"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Site public
          </Link>
        </div>
      </header>

      <section
        aria-label="Modules du tableau de bord"
        className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2"
      >
        {DASHBOARD_MODULES.map((entry) => (
          <ModuleCard key={entry.key} entry={entry} />
        ))}
      </section>

      <p className="mt-10 text-xs text-muted-foreground">
        Les cartes renvoient vers les sections protégées du tableau de bord :
        une connexion sera demandée pour y accéder.
      </p>
    </div>
  );
}