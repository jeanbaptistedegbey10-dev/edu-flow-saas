"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Fournisseur de thème global (clair / sombre / système).
 *
 * Configuration imposée :
 * - `attribute="class"` : le thème sombre s'applique via la classe `.dark`
 *   sur `<html>` (variant Tailwind `@custom-variant dark (&:is(.dark *))`) ;
 * - `defaultTheme="light"` : premier rendu en mode clair ;
 * - `enableSystem={true}` : suit la préférence OS quand l'utilisateur
 *   choisit « Système » ;
 * - `disableTransitionOnChange` : évite les transitions parasites au basculement.
 */
export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={true}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
