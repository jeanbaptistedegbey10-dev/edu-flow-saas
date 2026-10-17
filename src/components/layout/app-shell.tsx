"use client";

import { usePathname } from "next/navigation";

import { HomeSidebar } from "./home-sidebar";

/**
 * Routes applicatives affichées avec la barre latérale du layout RACINE
 * (`src/app/layout.tsx`).
 *
 * - `/` : hub modulaire du tableau de bord (Étape 2) → Sidebar affichée.
 * - `/dashboard/*` et `/portal-sys-admin-sec/*` possèdent DÉJÀ leur propre
 *   `SidebarProvider` (AppSidebar / SuperAdminSidebar) : notre Sidebar y
 *   serait dupliquée → masquée ici.
 * - Les routes publiques (landing `/accueil`, `/login`, `/register`, pages
 *   légales, `/reports/...`) restent en pleine largeur.
 *
 * Pour rattacher une nouvelle route applicative au shell, ajoutez-la à ce
 * tableau (structure modulable).
 */
const SIDEBAR_ROUTES: readonly string[] = ["/"];

/** Vrai si `pathname` doit afficher la Sidebar du layout racine. */
function hasRootSidebar(pathname: string): boolean {
  return SIDEBAR_ROUTES.some((route) => pathname === route);
}

/**
 * Coquille applicative : Sidebar + zone de contenu principale.
 *
 * Composant client (nécessite `usePathname`) mais sans état : le rendu reste
 * déterministe et le HTML des routes publiques est strictement inchangé
 * (`<>{children}</>`).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!hasRootSidebar(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen w-full">
      <HomeSidebar />
      <main className="min-w-0 flex-1 bg-background">{children}</main>
    </div>
  );
}