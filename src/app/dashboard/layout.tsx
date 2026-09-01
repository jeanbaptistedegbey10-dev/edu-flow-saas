import { connection } from "next/server";

import { auth } from "@/auth";
import { getCurrentOrganizationBranding } from "@/actions/organization";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getLicenseStateForCurrentUser } from "@/lib/license-check";
import {
  AlertTriangleIcon,
  Bell,
  Building2,
  Clock3Icon,
  Search,
} from "lucide-react";
import Link from "next/link";

/**
 * Bannière d'état de la licence / de l'essai, affichée en haut du tableau de
 * bord :
 * - essai actif expirant dans moins de 7 jours → avertissement ambre ;
 * - essai / licence expiré(e) ou plan inactif → alerte rouge (accès en
 *   écriture désactivé).
 */
function LicenseBanner({
  trialDaysLeft,
  restricted,
}: {
  trialDaysLeft: number | null;
  restricted: boolean;
}) {
  if (!restricted && trialDaysLeft === null) {
    return null;
  }

  const isExpired = restricted;

  return (
    <Link
      href={isExpired ? "/dashboard/billing?reason=TRIAL_EXPIRED" : "/dashboard/billing"}
      className={
        "flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium transition-colors " +
        (isExpired
          ? "bg-red-600 text-white hover:bg-red-700"
          : "bg-amber-100 text-amber-900 hover:bg-amber-200")
      }
    >
      {isExpired ? (
        <>
          <AlertTriangleIcon className="size-4 shrink-0" />
          Votre essai a expiré — les fonctionnalités de création et de
          modification sont désactivées.
        </>
      ) : (
        <>
          <Clock3Icon className="size-4 shrink-0" />
          Il vous reste {trialDaysLeft} jour{trialDaysLeft !== null && trialDaysLeft > 1 ? "s" : ""} d&apos;essai gratuit.
        </>
      )}
    </Link>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Rendu dynamique SSR garanti pour TOUTES les routes /dashboard/* :
  // `connection()` interrompt le pré-rendu statique dès l'entrée du layout
  // (les routes filles héritent du rendu à la demande). C'est la méthode
  // préconisée par la doc locale Next.js 16 (02-route-segment-config) —
  // les exports `export const dynamic` / `export const revalidate` ne sont
  // plus utilisés dans ce projet.
  await connection();

  // Session NextAuth résolue côté serveur puis transmise au composant
  // client `AppSidebar` (évite un SessionProvider dédié côté client).
  const session = await auth();

  // Journal de diagnostic : observable dans les logs Vercel pour vérifier si la
  // session est présente ou null lors de l'accès au tableau de bord.
  // Note : pas de redirection 307 ici. La sécurité est assurée par le proxy
  // (src/proxy.ts) qui protège /dashboard/*. La redirection serveur dans le
  // layout générait un code HTTP 307 vers /login sur Vercel.
  console.log(
    "[DASHBOARD SESSION STATUS]:",
    session ? "Connecté" : "Non connecté",
  );

  // Identité visuelle de l'organisation (logo + nom) affichée dans l'en-tête.
  // Dégradation gracieuse : monogramme par défaut si indisponible.
  const branding = await getCurrentOrganizationBranding();

  // État de la licence / de l'essai pour la bannière d'avertissement.
  const license = await getLicenseStateForCurrentUser();

  return (
    <SidebarProvider>
      <AppSidebar user={session?.user} />
      <SidebarInset>
        <LicenseBanner
          trialDaysLeft={license?.trialDaysLeft ?? null}
          restricted={license?.restrictionReason !== null}
        />
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <div className="flex flex-1 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
              {branding?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL arbitraire (data: ou http(s)) non couverte par next/image sans config dédiée.
                <img
                  src={branding.logoUrl}
                  alt={`Logo ${branding.name}`}
                  className="size-full object-contain"
                />
              ) : (
                <Building2 className="size-4" />
              )}
            </div>
            <div className="min-w-0 leading-tight">
              <h1 className="text-xl font-semibold tracking-tight">
                Tableau de bord
              </h1>
              {branding?.name ? (
                <p className="truncate text-xs text-muted-foreground">
                  {branding.name}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Rechercher"
            >
              <Search className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex flex-1 flex-col">
          {/* Conteneur élargi : occupe pleinement les écrans 1080p (Full HD) */}
          <div className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}