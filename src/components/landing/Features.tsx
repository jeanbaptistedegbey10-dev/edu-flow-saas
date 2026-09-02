"use client";

import { useState } from "react";
import {
  Building2,
  IdCard,
  Home,
  ClipboardCheck,
  CheckCircle2,
} from "lucide-react";
import { FEATURES } from "@/data/content";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2,
  IdCard,
  Home,
  ClipboardCheck,
};

const colorMap: Record<string, { bg: string; border: string; text: string }> = {
  "campus-france": {
    bg: "bg-brand/10",
    border: "border-brand/20",
    text: "text-brand-light",
  },
  visa: {
    bg: "bg-mint/10",
    border: "border-mint/20",
    text: "text-mint",
  },
  accommodation: {
    bg: "bg-gold/10",
    border: "border-gold/20",
    text: "text-gold",
  },
  tracking: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    text: "text-purple-400",
  },
};

export default function Features() {
  const [activeTab, setActiveTab] = useState(FEATURES[0].id);
  const activeFeature = FEATURES.find((f) => f.id === activeTab) || FEATURES[0];
  const activeColor = colorMap[activeTab] || colorMap["campus-france"];

  return (
    <section id="features" className="relative py-24 bg-ink-800">
      {/* Background accents */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-mint/5 rounded-full blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Tout ce qu&apos;il vous faut pour {" "}
            <span className="text-gradient-brand">reussir votre mobilite</span>
          </h2>
          <p className="text-lg text-gray-400">
            Une plateforme complete qui couvre chaque etape de votre projet d&apos;etudes a l&apos;international.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {FEATURES.map((feature) => {
            const Icon = iconMap[feature.icon];
            const isActive = activeTab === feature.id;
            const colors = colorMap[feature.id] || colorMap["campus-france"];
            return (
              <button
                key={feature.id}
                onClick={() => setActiveTab(feature.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? `${colors.bg} ${colors.border} ${colors.text} border`
                    : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {feature.title}
              </button>
            );
          })}
        </div>

        {/* Active Feature Content */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Description */}
          <div className="space-y-6">
            <div
              className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${activeColor.bg} border ${activeColor.border}`}
            >
              {(() => {
                const Icon = iconMap[activeFeature.icon];
                return Icon ? (
                  <Icon className={`w-7 h-7 ${activeColor.text}`} />
                ) : null;
              })()}
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-white">
              {activeFeature.title}
            </h3>
            <p className="text-gray-400 text-lg leading-relaxed">
              {activeFeature.description}
            </p>
            <ul className="space-y-3">
              {activeFeature.items.map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle2 className={`w-5 h-5 mt-0.5 shrink-0 ${activeColor.text}`} />
                  <span className="text-gray-300">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visual Card */}
          <div className="relative">
            <div className="glass-card p-8 glow-brand">
              <div className="space-y-4">
                {activeFeature.items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div
                      className={`w-10 h-10 rounded-lg ${activeColor.bg} border ${activeColor.border} flex items-center justify-center`}
                    >
                      <CheckCircle2 className={`w-5 h-5 ${activeColor.text}`} />
                    </div>
                    <span className="text-white font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
