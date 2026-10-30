// Liens de téléchargement : les installeurs sont publiés dans les releases GitHub.
// `latest/download/<fichier>` pointe toujours vers la dernière version, sans changer la page.
export const RELEASES = "https://github.com/Vlemrc/Miniamaker/releases/latest/download";

export type Platform = "mac" | "windows";

export const DOWNLOADS: Record<Platform, { name: string; file: string; format: string; requirements: string }> = {
  mac: { name: "macOS", file: "Miniamaker.dmg", format: ".dmg", requirements: "macOS 12 ou plus récent · Apple Silicon et Intel" },
  windows: { name: "Windows", file: "Miniamaker-Setup.exe", format: ".exe", requirements: "Windows 10 ou 11 · 64 bits" },
};

export const downloadUrl = (p: Platform) => `${RELEASES}/${DOWNLOADS[p].file}`;
