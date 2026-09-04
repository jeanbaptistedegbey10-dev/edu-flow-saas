"use client";

import { useState, useEffect, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X, GraduationCap } from "lucide-react";
import { NAV_LINKS } from "@/data/content";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  /** Vrai lorsque la Navbar est affichée sur la page d'accueil. */
  const isHome = pathname === "/";

  /**
   * Clic sur le logo : sur la page d'accueil, retour fluide en haut du Hero ;
   * sur les autres pages, navigation classique vers « / ».
   */
  const handleLogoClick = (e: MouseEvent) => {
    setIsMobileOpen(false);
    if (isHome) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-ink-900/80 backdrop-blur-md border-b border-white/10 shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" onClick={handleLogoClick} className="flex items-center gap-2 group">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand/20 border border-brand/30 group-hover:bg-brand/30 transition-colors">
              <GraduationCap className="w-5 h-5 text-brand-light" />
            </div>
            <span className="text-xl font-bold text-white">
              Edu<span className="text-brand-light">Flow</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={isHome ? link.href : `/${link.href}`}
                className="text-sm text-gray-300 hover:text-white transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-brand after:transition-all hover:after:w-full"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
            >
              Connexion
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all hover:shadow-lg hover:shadow-brand/25"
            >
              Essai Gratuit
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="md:hidden p-2 text-gray-300 hover:text-white"
            aria-label="Toggle menu"
          >
            {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ${
            isMobileOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="py-4 space-y-3 border-t border-white/10">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={isHome ? link.href : `/${link.href}`}
                onClick={() => setIsMobileOpen(false)}
                className="block py-2 text-gray-300 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 space-y-2 border-t border-white/10">
              <Link
                href="/login"
                className="block w-full text-center py-2 text-sm text-gray-300 hover:text-white border border-white/10 rounded-lg transition-colors"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="block w-full text-center py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all"
              >
                Essai Gratuit
              </Link>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
