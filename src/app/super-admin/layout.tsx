import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ShieldCheckIcon } from "lucide-react";

import { getSuperAdminContext } from "@/lib/super-admin";
import { SuperAdminSidebar } from "@/components/super-admin/super-admin-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: "Back-office plateforme | EduFlow",
  description:
    "Administration des organisations, plans et licences EduFlow (réservé Super-Admin).",
  robots: { index: false, follow: false },
};

/**
 * Layout du back-office Super-Admin.
 *
 * Barrière de sécurité n°2 (après `src/proxy.ts`) : le rôle SUPER_ADMIN est
 * revalidé EN BASE à chaque rendu. Tout autre rôle — notamment les
 * administrateurs d'écoles (ADMIN) — est redirigé vers /dashboard sans
 * aucune information divulguée.
 *
 * Le layout intègre la `SuperAdminSidebar` (onglets Organisations,
 * 💰 Tarifs & Offres, Générateur de Licences, Factures & Paiements SaaS)
 * partagée entre toutes les routes `/super-admin/*`.
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  return (
    <SidebarProvider>
      <SuperAdminSidebar
        user={{ name: "Super Admin", email: admin.email, role: "SUPER_ADMIN" }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <div className="flex flex-1 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-600 dark:text-violet-400">
              <ShieldCheckIcon className="size-4" />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold tracking-tight">
                Back-office plateforme
              </p>
              <p className="text-xs text-muted-foreground">EduFlow — Super-Admin</p>
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col">
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

