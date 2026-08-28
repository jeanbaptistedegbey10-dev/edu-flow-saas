import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavigationProgressBar } from "@/components/providers/navigation-progress";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Barre de progression globale : s'anime dès qu'un lien interne est
            cliqué (Sidebar, cartes…) ou qu'une Server Action démarre. */}
        <Suspense fallback={null}>
          <NavigationProgressBar />
        </Suspense>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
