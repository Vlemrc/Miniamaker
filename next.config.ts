import type { NextConfig } from "next";

// Pour l'app de bureau (DESKTOP=1), le site est exporté en fichiers statiques dans `out/`,
// que la fenêtre Electron sert elle-même. Chaque page devient `<route>/index.html`.
const desktop = process.env.DESKTOP === "1";

const nextConfig: NextConfig = desktop ? { output: "export", trailingSlash: true } : {};

export default nextConfig;
