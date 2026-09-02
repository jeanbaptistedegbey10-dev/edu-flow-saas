"use client";

import React from "react";
import { ArrowRight, Play, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export const Hero = () => {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden bg-[#0A0D14]">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-brand/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Copywriting */}
          <div className="lg:col-span-6 space-y-8 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold">
              <span>✨</span> La plateforme N°1 pour Centres de Langues & Agences de Voyage
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.15]">
              Pilotez vos cours de <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-teal-300 to-emerald-400">langues & procédures d'immigration</span> en toute simplicité
            </h1>

            <p className="text-gray-400 text-lg leading-relaxed max-w-xl">
              Gérez vos étudiants, sessions de cours, dossiers de voyage et caisse POS depuis une seule plateforme moderne. Disponible en ligne ou hors-ligne.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/register"
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-500 hover:to-blue-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all duration-200 flex items-center gap-2"
              >
                Essai Gratuit 14 jours
                <ArrowRight className="w-4 h-4" />
              </Link>

              <a
                href="#tarifs"
                className="px-6 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm transition-all duration-200 flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                Voir les Tarifs
              </a>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <div className="flex -space-x-2 overflow-hidden">
                <span className="inline-block h-8 w-8 rounded-full bg-blue-500 ring-2 ring-[#0A0D14]" />
                <span className="inline-block h-8 w-8 rounded-full bg-teal-500 ring-2 ring-[#0A0D14]" />
                <span className="inline-block h-8 w-8 rounded-full bg-amber-500 ring-2 ring-[#0A0D14]" />
              </div>
              <span className="text-sm text-gray-400 font-medium">
                <strong className="text-white">+50 centres</strong> nous font confiance
              </span>
            </div>
          </div>

          {/* Right Column: Visual Dashboard Mockup */}
          <div className="lg:col-span-6">
            <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-2xl">
              <div className="rounded-xl bg-[#0F172A] p-5 border border-white/5 space-y-6">
                
                {/* Dashboard Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <span className="text-xs text-gray-400 uppercase tracking-wider block">Tableau de bord</span>
                    <h3 className="text-lg font-bold text-white">Suivi Étudiant</h3>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> En direct
                  </span>
                </div>

                {/* Student Info Card */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">
                      KA
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Koffi Adjoua</p>
                      <p className="text-xs text-gray-400">Étudiant : Allemand B2</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                    Actif
                  </span>
                </div>

                {/* Status Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                    <span className="text-xs text-gray-400 font-medium">📖 Cours</span>
                    <p className="text-xl font-bold text-white">B2</p>
                    <p className="text-xs text-gray-400">Allemand • 85% présence</p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                    <span className="text-xs text-gray-400 font-medium">✈️ Visa</span>
                    <p className="text-xl font-bold text-white">Étape 3/4</p>
                    <p className="text-xs text-gray-400">RDV Consulat</p>
                  </div>
                </div>

                {/* Pipeline Checklist */}
                <div className="space-y-2.5 pt-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase">Pipeline Visa - Allemagne</p>
                  
                  <div className="flex items-center justify-between text-xs text-gray-300">
                    <span className="flex items-center gap-2">📂 Dossier déposé</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-gray-300">
                    <span className="flex items-center gap-2">📋 Documents vérifiés</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-gray-300">
                    <span className="flex items-center gap-2">📅 RDV Consulat</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400 opacity-60">
                    <span className="flex items-center gap-2">🎓 Visa obtenu</span>
                    <span className="w-4 h-4 rounded-full border border-gray-600" />
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};