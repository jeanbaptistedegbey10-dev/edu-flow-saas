"use client";

import { usePathname } from "next/navigation";

/**
 * Titre dynamique de l'en-tête du tableau de bord.
 *
 * Le libellé est résolu à partir du chemin courant (`usePathname`) via la
 * carte `DASHBOARD_ROUTE_TITLES` — alignée sur les libellés de la barre
 * latérale (`app-sidebar.tsx`) afin que l'en-tête, la navigation et le titre
 * de page décrivent toujours le même module avec les mêmes mots.
 *
 * Règles de résolution :
 * - correspondance par préfixe sur frontière de segment (les routes de
 *   détail comme /dashboard/students/<id> héritent du libellé du module) ;
 * - l'entrée la PLUS SPÉCIFIQUE gagne (ordonnée de la plus longue à la plus
 *   courte) — ex. /dashboard/settings/roles → « Rôles & Permissions » et non
 *   « Paramètres » ;
 * - « Tableau de bord » est conservé UNIQUEMENT pour la route racine exacte
 *   /dashboard (défaut).
 */
const DASHBOARD_ROUTE_TITLES: ReadonlyArray<{ path: string; title: string }> = [
  // Les entrées les plus spécifiques (préfixes les plus longs) en premier.
  { path: "/dashboard/settings/roles", title: "Rôles & Permissions" },
  { path: "/dashboard/settings", title: "Paramètres" },
  { path: "/dashboard/guide", title: "Manuel d'Utilisation" },
  { path: "/dashboard/students", title: "Apprenants" },
  { path: "/dashboard/classes", title: "Classes" },
  { path: "/dashboard/courses", title: "Cours" },
  { path: "/dashboard/evaluations", title: "Évaluations & Examens" },
  { path: "/dashboard/attendance", title: "Présences & Cahier de texte" },
  { path: "/dashboard/payments", title: "Paiements & Facturation" },
  { path: "/dashboard/travels", title: "Procédures voyage" },
  { path: "/dashboard/pos", title: "Caisse / POS" },
  { path: "/dashboard/tasks", title: "Tâches" },
  { path: "/dashboard/expenses", title: "Dépenses" },
  { path: "/dashboard/calendar", title: "Calendrier" },
  { path: "/dashboard/tresorerie", title: "Trésorerie" },
  { path: "/dashboard/billing", title: "Abonnement" },
  { path: "/dashboard/organization", title: "Organisation" },
  { path: "/dashboard/teacher/students", title: "Mes Étudiants" },
];

/** Titre affiché sur la route racine /dashboard (et en repli). */
const DEFAULT_TITLE = "Tableau de bord";

/**
 * Résout le titre de l'en-tête pour le chemin courant : égalité stricte pour
 * la racine /dashboard, sinon préfixe sur frontière de segment avec priorité
 * à l'entrée la plus spécifique.
 */
function resolveHeaderTitle(pathname: string | null): string {
  if (!pathname) {
    return DEFAULT_TITLE;
  }

  if (pathname === "/dashboard") {
    return DEFAULT_TITLE;
  }

  for (const entry of DASHBOARD_ROUTE_TITLES) {
    if (pathname === entry.path || pathname.startsWith(`${entry.path}/`)) {
      return entry.title;
    }
  }

  return DEFAULT_TITLE;
}

export function DashboardHeaderTitle() {
  const pathname = usePathname();
  const title = resolveHeaderTitle(pathname);

  return (
    <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
  );
}
