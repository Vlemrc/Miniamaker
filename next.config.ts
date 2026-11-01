import type { NextConfig } from "next";

// Pour l'app de bureau (DESKTOP=1), le site est exporté en fichiers statiques dans `out/`,
// que la fenêtre Electron sert elle-même. Chaque page devient `<route>/index.html`.
// Son propre dossier de build laisse `.next` à un `next dev` lancé en parallèle. Avec un `distDir`,
// l'export atterrit dans ce dossier : scripts/build-desktop.mjs le déplace ensuite dans `out/`.
const desktop = process.env.DESKTOP === "1";

const nextConfig: NextConfig = desktop ? { output: "export", trailingSlash: true, distDir: ".next-desktop" } : {};

export default nextConfig;
