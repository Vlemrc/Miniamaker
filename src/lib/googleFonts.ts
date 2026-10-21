import list from "@/data/google-fonts.json";

// Toutes les Google Fonts (liste figée par scripts/update-google-fonts.mjs, triée par popularité).
// Les fichiers de police sont chargés à la demande depuis fonts.googleapis.com.

export type GoogleFont = { f: string; c: "sans" | "serif" | "display" | "script" | "mono"; w: number[]; i: boolean };

export const GOOGLE_FONTS = list as GoogleFont[];

export const CATEGORY_LABEL: Record<GoogleFont["c"], string> = {
  sans: "Sans",
  serif: "Serif",
  display: "Display",
  script: "Manuscrite",
  mono: "Mono",
};

const loaded = new Map<string, Promise<void>>();

function addStylesheet(href: string) {
  return new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Police introuvable : ${href}`));
    document.head.appendChild(link);
  });
}

const familyParam = (family: string) => encodeURIComponent(family).replace(/%20/g, "+");

// Charge une graisse (et éventuellement l'italique) d'une police, prête à être dessinée dans le canvas.
export function loadGoogleFont(family: string, weight: number, italic: boolean) {
  const key = `${family}|${weight}|${italic}`;
  let p = loaded.get(key);
  if (!p) {
    const axis = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
    p = addStylesheet(`https://fonts.googleapis.com/css2?family=${familyParam(family)}:${axis}&display=block`)
      .then(() => document.fonts.load(`${italic ? "italic " : ""}${weight} 100px "${family}"`))
      .then(() => undefined);
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}

// Aperçu dans la liste : ne charge que les lettres du nom de la police (quelques Ko).
export function previewGoogleFont(family: string) {
  const key = `preview|${family}`;
  if (!loaded.has(key)) {
    const p = addStylesheet(`https://fonts.googleapis.com/css2?family=${familyParam(family)}&text=${encodeURIComponent(family)}&display=swap`);
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
}

export function closestWeight(font: GoogleFont, wanted: number) {
  return font.w.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), font.w[0]);
}
