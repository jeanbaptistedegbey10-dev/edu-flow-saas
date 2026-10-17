"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Entrée de navigation de la Sidebar du layout racine. */
export interface SidebarItem {
  /** Libellé affiché. */
  label: string;
  /** Route cible. */
  href: string;
  /** Icône lucide-react. */
  icon: LucideIcon;
  /** Correspondance stricte de l'URL (entrées racine type « / »). */
  exact?: boolean;
}

/** Section (groupe) de la Sidebar — structure modulable. */
export interface SidebarSection {
  title: string;
  items: readonly SidebarItem[];
}

/**
 * Sections de la Sidebar du hub (`/`). Ajouter une entrée ici suffit à
 * l'afficher dans la barre latérale du layout racine.
 */
export const HOME_SIDEBAR_SECTIONS: readonly SidebarSection[] = [
  {
    title: "Pilotage",
    items: [
      {
        label: "Tableau de bord",
        href: "/",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    title: "Modules",
    items: [
      { label: "Communauté", href: "/dashboard/students", icon: Users },
      { label: "Finances", href: "/dashboard/tresorerie", icon: Wallet },
      {
        label: "Cultes & Événements",
        href: "/dashboard/calendar",
        icon: CalendarDays,
      },
      {
        label: "Rapports & Clôture",
        href: "/dashboard/classes",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    title: "Raccourcis",
    items: [
      { label: "Cours", href: "/dashboard/courses", icon: BookOpen },
      { label: "Paramètres", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

/**
 * Barre latérale du layout racine (hub `/`).
 *
 * Éléments actifs : classe `.is-active` (styles `.ds-nav-item` dans
 * globals.css) — fond violet profond, texte lavande, liseré lavande à gauche.
 * Cachée sous `lg` (mobile) : le hub reste pleine largeur, la navigation se
 * fait alors via les cartes de modules.
 */
export function HomeSidebar() {
  const pathname = usePathname();

  /** Vrai si l'entrée correspond à la page courante. */
  const isActive = (item: SidebarItem): boolean =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      {/* Marque */}
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <span className="grid size-9 place-items-center rounded-lg border border-lavande/30 bg-violet-core/20">
          <GraduationCap className="size-5 text-lavande" aria-hidden="true" />
        </span>
        <span className="text-lg font-bold">
          Edu<span className="text-lavande">Flow</span>
        </span>
      </div>

      {/* Sections modulables */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Navigation principale">
        {HOME_SIDEBAR_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`ds-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                        active
                          ? "is-active"
                          : "text-sidebar-foreground/80"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      {active ? (
                        <ChevronRight
                          className="ml-auto size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Pied de Sidebar : site public */}
      <div className="space-y-1 border-t border-sidebar-border p-3">
        <Link
          href="/accueil"
          className="ds-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80"
        >
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          Site public
        </Link>
      </div>
    </aside>
  );
}