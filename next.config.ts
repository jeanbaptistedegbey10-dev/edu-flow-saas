import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Route d'administration obfusquée (back-office Super-Admin)
// ---------------------------------------------------------------------------
// Le back-office vit dans le segment de route interne `portal-sys-admin-sec`
// (défaut de NEXT_PUBLIC_SUPER_ADMIN_ROUTE). Si la variable est personnalisée
// (ex : /manage-ops-7f3a), un rewrite RUNTIME (ici, à chaud) fait pointer le
// chemin configuré vers le segment interne. Le matcher du proxy étant une
// constante statique, la barrière JWT s'applique sur le chemin par défaut ;
// le chemin configuré reste protégé par la barrière DB du layout
// (src/lib/super-admin.ts → getSuperAdminContext).
const DEFAULT_ADMIN_ROUTE = "/portal-sys-admin-sec";
const configuredAdminRoute = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPER_ADMIN_ROUTE?.trim();
  if (!raw) return DEFAULT_ADMIN_ROUTE;
  const route = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "");
  if (!route || route === "/" || route === "/super-admin") {
    return DEFAULT_ADMIN_ROUTE;
  }
  return route;
})();

// ---------------------------------------------------------------------------
// Phase 4 — Packaging Self-Hosted (Docker) & Bureau (Desktop Windows offline)
// ---------------------------------------------------------------------------
// « Standalone output » : `next build` émet `.next/standalone/` contenant
// UNIQUEMENT les fichiers nécessaires à l'exécution (server.js + node_modules
// tracés). C'est la base de l'image Docker multi-stage (`Dockerfile`) et du
// wrapper Electron desktop (`desktop/electron/main.cjs`).
//
// ⚠️ Sur Vercel, `output: "standalone"` casse le packaging final du déploiement
// (Error: ENOENT: no such file or directory, open '.next/next-server.js.nft.json') :
// Vercel utilise son propre Build Output API et n'a PAS besoin de standalone
// (réservé à l'auto-hébergement Docker). La sortie n'est donc activée QUE
// lorsque la variable d'environnement NEXT_OUTPUT_STANDALONE=1 est définie —
// ce que font le Dockerfile (étape builder) et `scripts/build-desktop.mjs`.
//
// Les avertissements relatifs à l'optimisation dynamique (ex : route
// /dashboard/students qui utilise `headers`) restent des logs de build
// non bloquants : la route est simplement rendue dynamiquement.
const nextConfig: NextConfig = {
  output:
    process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,

  async rewrites() {
    // Route par défaut : le segment de route App Router est déjà le bon —
    // aucun rewrite nécessaire (et le proxy couvre la barrière JWT).
    if (configuredAdminRoute === DEFAULT_ADMIN_ROUTE) {
      return [];
    }

    // Route personnalisée : pont vers le segment interne (racine + sous-pages).
    return [
      { source: configuredAdminRoute, destination: DEFAULT_ADMIN_ROUTE },
      {
        source: `${configuredAdminRoute}/:path*`,
        destination: `${DEFAULT_ADMIN_ROUTE}/:path*`,
      },
    ];
  },
};

export default nextConfig;

