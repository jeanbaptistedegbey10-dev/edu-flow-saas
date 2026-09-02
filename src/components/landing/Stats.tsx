import { GraduationCap, ShieldCheck, Globe, Star } from "lucide-react";
import { STATS } from "@/data/content";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  GraduationCap,
  ShieldCheck,
  Globe,
  Star,
};

export default function Stats() {
  return (
    <section className="relative py-16 bg-ink-900">
      {/* Subtle top border glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((stat, index) => {
            const Icon = iconMap[stat.icon];
            return (
              <div
                key={index}
                className="glass-card glass-card-hover p-6 text-center group"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 mb-4 group-hover:bg-brand/20 transition-colors">
                  {Icon && <Icon className="w-6 h-6 text-brand-light" />}
                </div>
                <div className="text-3xl font-bold text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-400">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
