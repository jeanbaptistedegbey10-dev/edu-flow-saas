"use client";

import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Stats from "@/components/landing/Stats";
import Features from "@/components/landing/Features";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
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
