import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ---------------------------------------------------------------------------
  // Phase 4 — Packaging Self-Hosted (Docker) & Bureau (Desktop Windows offline)
  // ---------------------------------------------------------------------------
  // « Standalone output » : `next build` émet `.next/standalone/` contenant
  // UNIQUEMENT les fichiers nécessaires à l'exécution (server.js + node_modules
  // tracés). C'est la base de l'image Docker multi-stage (`Dockerfile`) et du
  // wrapper Electron desktop (`desktop/electron/main.cjs`).
  // Les avertissements relatifs à l'optimisation dynamique (ex : route
  // /dashboard/students qui utilise `headers`) restent des logs de build
  // non bloquants : la route est simplement rendue dynamiquement.
  output: "standalone",
};

export default nextConfig;
