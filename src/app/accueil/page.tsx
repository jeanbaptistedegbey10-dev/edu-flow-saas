import type { Metadata } from "next";

import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Stats from "@/components/landing/Stats";
import Features from "@/components/landing/Features";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";

/**
 * Landing publique EduFlow — déplacée ici depuis `/` à l'Étape 2 (le hub du
 * tableau de bord occupe désormais la racine). Les composants internes sont
 * des composants clients autonomes : ce conteneur reste un Server Component
 * et peut donc exporter ses `metadata`.
 */
export const metadata: Metadata = {
  title: "EduFlow — Plateforme de gestion de centre de formation",
  description:
    "Plateforme SaaS de gestion pour centres de formation et agences de mobilité internationale : inscriptions, finances, calendrier et rapports.",
};

export default function AccueilPage() {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-ink-900 text-white">
      <Navbar />
      <Hero />
      <Stats />
      <Features />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  );
}