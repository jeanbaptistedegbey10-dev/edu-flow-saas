"use client";


import { type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  Globe,
  ExternalLink,
  Share2,
  MessageCircle,
  Mail,
  Phone,
  MapPin,
  Heart,
} from "lucide-react";
import { FOOTER_LINKS } from "@/data/content";

const socialIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe,
  ExternalLink,
  Share2,
  MessageCircle,
};

export default function Footer() {
  const pathname = usePathname();
  /** Vrai lorsque le Footer est affiché sur la page d'accueil. */
  const isHome = pathname === "/";

  /**
   * Résout les liens du footer : les ancres du landing (« #features »,
   * « #tarifs »…) doivent pointer vers « /#features » depuis les autres
   * pages (mentions légales, contact…).
   */
  const resolveHref = (href: string) =>
    href.startsWith("#") && !isHome ? `/${href}` : href;

  /** Clic logo : retour fluide en haut de page lorsqu'on est déjà sur l'accueil. */
  const handleLogoClick = (e: MouseEvent) => {
    if (isHome) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <footer className="relative bg-ink-900 border-t border-white/10">
      {/* Top glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" onClick={handleLogoClick} className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand/20 border border-brand/30">
                <GraduationCap className="w-5 h-5 text-brand-light" />
              </div>
              <span className="text-xl font-bold text-white">
                Edu<span className="text-brand-light">Flow</span>
              </span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed max-w-sm mb-6">
              La plateforme d&apos;accompagnement de reference pour les etudiants africains souhaitant poursuivre leurs etudes a l&apos;international.
            </p>
            {/* Social Icons */}
            <div className="flex items-center gap-3">
              {FOOTER_LINKS.social.map((social) => {
                const Icon = socialIcons[social.icon];
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    aria-label={social.label}
                    className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-brand/20 hover:border-brand/30 transition-all"
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-white mb-4">
              Produit
            </h4>
            <ul className="space-y-3">
              {FOOTER_LINKS.product.map((link) => (
                <li key={link.label}>
                  <Link
                    href={resolveHref(link.href)}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-white mb-4">
              Entreprise
            </h4>
            <ul className="space-y-3">
              {FOOTER_LINKS.company.map((link) => (
                <li key={link.label}>
                  <Link
                    href={resolveHref(link.href)}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-white mb-4">
              Legal
            </h4>
            <ul className="space-y-3">
              {FOOTER_LINKS.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    href={resolveHref(link.href)}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Contact Info Bar */}
        <div className="py-6 border-t border-white/10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400">
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-brand-light" />
                contact@eduflow.com
              </span>
              <span className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-brand-light" />
                +229 00 00 00 00
              </span>
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-brand-light" />
                Cotonou, Benin
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-6 border-t border-white/5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} EduFlow par Digital Infotech. Tous droits reserves.
            </p>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              Fait avec <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> au Benin
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
