import type { NextConfig } from "next";

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
};

export default nextConfig;
