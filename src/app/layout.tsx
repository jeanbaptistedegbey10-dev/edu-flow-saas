import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavigationProgressBar } from "@/components/providers/navigation-progress";
import { AppShell } from "@/components/layout/app-shell";
import CookieBanner from "@/components/cookie-banner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduFlow SaaS - Centre de Formation",
  description: "Plateforme SaaS de gestion pour centres de formation et agences de mobilité internationale",
  // Toutes les icônes pointent vers des actifs DE LA PLATEFORME, servis
  // statiquement depuis `public/` (jamais traités par Turbopack au build) :
  //
  //   - `/favicon.ico` : ICO multi-tailles 16/32/48/64/128/256 px, produit à
  //     partir du logo par `node scripts/generate-favicon.mjs`. C'est aussi
  //     l'URL demandée implicitement par les navigateurs pour `/favicon.ico`.
  //   - `/logo.png`    : logo EduFlow 512x512 RGBA, même source que l'ICO.
  //
  // AUCUNE référence au favicon ni aux actifs Vercel d'origine : le fichier
  // `src/app/favicon.ico` du squelette « Create Next App » a été SUPPRIMÉ. Sa
  // présence créait une route App Router `/favicon.ico` prioritaire sur
  // `public/`, ce qui exposait le logo Vercel aux navigateurs.
  //
  // `src/app/icon.png` reste le fallback automatique de la convention `icon`
  // de l'App Router (mêmes octets que `public/logo.png`, régénérable via
  // `node scripts/generate-default-logo.mjs`).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64 128x128 256x256" },
      { url: "/logo.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/logo.png", type: "image/png", sizes: "512x512" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Étape 2 — mode sombre PAR DÉFAUT : la classe `dark` posée sur <html>
    // alimente le variant Tailwind `dark:` (`@custom-variant dark (&:is(.dark *))`
    // dans globals.css). `suppressHydrationWarning` évite les faux positifs
    // d'hydratation si un script navigateur ajuste les classes côté client.
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Barre de progression globale : s'anime dès qu'un lien interne est
            cliqué (Sidebar, cartes…) ou qu'une Server Action démarre. */}
        <Suspense fallback={null}>
          <NavigationProgressBar />
        </Suspense>
        {/* Étape 2 — coquille applicative : barre latérale (Sidebar) + zone de
            contenu principale aux couleurs du thème. AppShell n'affiche la
            Sidebar que sur les routes applicatives (hub `/`) ; les routes
            publiques et celles possédant déjà leur propre Sidebar
            (/dashboard, /portal-sys-admin-sec) restent intactes. */}
        <TooltipProvider>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
        {/* Bandeau de consentement RGPD : le choix (accepter / refuser) est
            persisté dans `localStorage`, il ne réapparaît donc plus ensuite. */}
        <CookieBanner />
      </body>
    </html>
  );
}
