"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bascule Clair / Sombre accessible (icônes Soleil / Lune).
 *
 * - Sans effet de bord avant montage (`mounted`) : évite tout écart
 *   d'hydratation SSR (le premier rendu serveur reste en mode clair).
 * - `aria-label` dynamique + `title` pour l'accessibilité.
 * - Compatible clair ET sombre (`text-muted-foreground`, hover `bg-accent`).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
      title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}

/** Alias conservé pour compatibilité (`ModeToggle` demandé dans la consigne). */
export const ModeToggle = ThemeToggle;
