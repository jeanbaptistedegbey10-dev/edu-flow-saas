"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, GraduationCap, IdCard, CreditCard } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-ink-900">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand/20 rounded-full blur-3xl animate-float" />
        <div className="absolute top-1/3 -right-32 w-80 h-80 bg-mint/10 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-brand/10 rounded-full blur-3xl animate-pulse-glow" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand-light text-sm">
              <GraduationCap className="w-4 h-4" />
              <span>Nouveau : Pipeline Visa integre</span>
            </div>

            {/* Heading */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              Pilotez vos cours de langues &amp; procédures d'immigration{" "}
              <span className="text-gradient-brand">en toute simplicité</span>
            </h1>

            {/* Description */}
            <p className="text-lg text-gray-400 max-w-xl leading-relaxed">
              Gérez vos étudiants, sessions de cours, dossiers de voyage et caisse POS depuis une seule plateforme moderne. Disponible en ligne ou hors-ligne.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-white bg-brand hover:bg-brand-dark rounded-xl transition-all hover:shadow-xl hover:shadow-brand/25 hover:-translate-y-0.5"
              >
                Essai Gratuit 14 jours
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#tarifs"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 rounded-xl transition-all"
              >
                Voir les Tarifs
              </a>
            </div>

            {/* Proof Text */}
            <div className="flex items-center gap-2 pt-4">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-brand/30 border-2 border-ink-900 flex items-center justify-center text-xs text-white font-bold">A</div>
                <div className="w-8 h-8 rounded-full bg-mint/30 border-2 border-ink-900 flex items-center justify-center text-xs text-white font-bold">M</div>
                <div className="w-8 h-8 rounded-full bg-gold/30 border-2 border-ink-900 flex items-center justify-center text-xs text-white font-bold">S</div>
              </div>
              <span className="text-sm text-gray-400 font-medium">+50 centres nous font confiance</span>
            </div>
          </div>

          {/* Right Content - Dashboard Preview */}
          <div className="relative">
            <div className="glass-card p-6 glow-brand space-y-5">
              {/* Dashboard Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/20 border border-brand/30 flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-brand-light" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Tableau de bord</h3>
                    <p className="text-xs text-gray-400">EduFlow Centre</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-xs font-medium text-mint bg-mint/10 rounded-full border border-mint/20">En ligne</span>
              </div>
              {/* Student Tracking Card */}
              <div className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="w-11 h-11 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5 text-brand-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">Koffi Adjoua</p>
                  <p className="text-xs text-gray-400">German B2</p>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium text-mint bg-mint/10 rounded-full border border-mint/20">Actif</span>
              </div>

              {/* Course Status */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-brand-light" />
                    <span className="text-sm font-medium text-white">Assiduite aux cours</span>
                  </div>
                  <span className="text-sm font-bold text-mint">85%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand to-mint rounded-full" style={{ width: "85%" }} />
                </div>
                <p className="text-xs text-gray-500 mt-2">34/40 sessions assistees ce mois</p>
              </div>

              {/* Visa Pipeline */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <IdCard className="w-4 h-4 text-brand-light" />
                    <span className="text-sm font-medium text-white">Pipeline Visa</span>
                  </div>
                  <span className="text-xs text-gray-400">Etape 3/4</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-1">
                    <div className="h-2 flex-1 rounded-full bg-mint" />
                    <div className="h-2 flex-1 rounded-full bg-mint" />
                    <div className="h-2 flex-1 rounded-full bg-brand animate-pulse" />
                    <div className="h-2 flex-1 rounded-full bg-white/10" />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">Consulat RDV</span>
                  <span className="text-xs font-medium text-brand-light">En cours</span>
                </div>
              </div>

              {/* Checklist */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-4 h-4 text-gold" />
                  <span className="text-sm font-medium text-white">Checklist documents</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-mint" />
                    <span className="text-xs text-gray-300">Passeport valide</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-mint" />
                    <span className="text-xs text-gray-300">Lettre d'acceptation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-brand flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                    </div>
                    <span className="text-xs text-gray-300">Preuve financiere</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-white/20" />
                    <span className="text-xs text-gray-500">Formulaire consulaire</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Badge */}
            <div className="absolute -bottom-4 -left-4 glass-card px-4 py-2 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-mint animate-pulse" />
              <span className="text-sm text-gray-300">25 000+ etudiants geres</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
