import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ShieldCheckIcon } from "lucide-react";

import { getSuperAdminContext } from "@/lib/super-admin";

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
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-violet-600 text-white">
              <ShieldCheckIcon className="size-5" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">
                Back-office EduFlow
              </p>
              <p className="text-xs text-muted-foreground">
                Plateforme — accès Super-Admin
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{admin.email}</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
