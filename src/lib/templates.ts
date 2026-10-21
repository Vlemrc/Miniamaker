// Templates verrouillés : tout ce qui fait la « patte » est figé ici.
// Le texte est saisi ligne par ligne ; chaque ligne prend un des styles prévus par le template
// (taille, typo, graisse…). L'utilisateur ne choisit que le texte, le style de ligne,
// la couleur et une des variantes d'alignement autorisées.
// Coordonnées en pixels sur un canvas 1080 × 1920 (9:16).

export const W = 1080;
export const H = 1920;

export type Align = "left" | "center" | "right";
export type FontRole = "sans" | "serif" | "condensed";
export type LineStyle = "normal" | "small" | "big" | "serif" | "label";

export type Line = {
  text: string;
  style: LineStyle;
  accent: boolean;
  dy?: number; // décalage vertical choisi en glissant la ligne dans l'aperçu
  font?: { family: string; weight: number; italic: boolean }; // Google Font choisie à la place de celle du style
};

export type Typo = {
  font: FontRole;
  family?: string; // Google Font qui remplace la police du rôle (choix par ligne)
  weight: number;
  italic?: boolean;
  size: number; // taille visée ; réduite si la ligne est trop longue
  fill?: boolean; // la ligne s'agrandit pour remplir la largeur (jusqu'à `size`)
  uppercase: boolean;
  tracking: number; // en em
  lineHeight: number; // hauteur de ligne, multiplicateur de la taille
};

export type Template = {
  id: string;
  name: string;
  description: string;
  x: number;
  width: number;
  anchor: "top" | "center" | "bottom";
  anchorY: number;
  maxHeight: number;
  styles: Record<LineStyle, Typo>;
  shade: { from: "top" | "bottom"; size: number; opacity: number };
  shadow: number; // flou de l'ombre portée du texte, en fraction de la taille
  aligns: Align[];
};

export type Palette = { id: string; name: string; text: string; accent: string };

export const LINE_STYLE_LABEL: Record<LineStyle, string> = {
  normal: "Normal",
  small: "Petit",
  big: "Gros",
  serif: "Italique",
  label: "Étiquette",
};

// Sur le profil (Insta comme TikTok), la mini est recadrée au centre en 3:4 : y ∈ [240, 1680].
// Le texte doit rester dans cette bande. Pas besoin d'éviter l'interface du lecteur :
// la mini ne s'affiche que dans la grille, jamais sous les boutons.
export const SAFE = { gridTop: 240, gridBottom: 1680 };

const SERIF: Typo = { font: "serif", weight: 400, italic: true, size: 150, uppercase: false, tracking: -0.01, lineHeight: 0.98 };
const LABEL: Typo = { font: "sans", weight: 700, size: 62, uppercase: false, tracking: -0.01, lineHeight: 1.5 };

export const TEMPLATES: Template[] = [
  {
    id: "editorial",
    name: "Éditorial",
    description: "Linéale grasse en minuscules, tailles qui varient selon les lignes",
    x: 80,
    width: 920,
    anchor: "center",
    anchorY: 1130,
    maxHeight: 640,
    styles: {
      normal: { font: "sans", weight: 800, size: 116, uppercase: false, tracking: -0.04, lineHeight: 1.02 },
      small: { font: "sans", weight: 700, size: 66, uppercase: false, tracking: -0.03, lineHeight: 1.08 },
      big: { font: "sans", weight: 800, size: 250, fill: true, uppercase: false, tracking: -0.045, lineHeight: 0.95 },
      serif: SERIF,
      label: LABEL,
    },
    shade: { from: "bottom", size: 1100, opacity: 0.5 },
    shadow: 0.18,
    aligns: ["left", "center", "right"],
  },
  {
    id: "centered",
    name: "Centré",
    description: "Mot clé en capitales qui remplit la largeur, petites lignes autour",
    x: 80,
    width: 920,
    anchor: "bottom",
    anchorY: 1440,
    maxHeight: 640,
    styles: {
      normal: { font: "sans", weight: 600, size: 82, uppercase: false, tracking: -0.02, lineHeight: 1.1 },
      small: { font: "sans", weight: 600, size: 60, uppercase: false, tracking: -0.01, lineHeight: 1.15 },
      big: { font: "sans", weight: 900, size: 260, fill: true, uppercase: true, tracking: -0.02, lineHeight: 0.95 },
      serif: { ...SERIF, size: 120 },
      label: LABEL,
    },
    shade: { from: "bottom", size: 1200, opacity: 0.85 },
    shadow: 0.12,
    aligns: ["center", "left"],
  },
  {
    id: "impact",
    name: "Condensé",
    description: "Gros titres condensés en capitales, plus percutant",
    x: 80,
    width: 920,
    anchor: "bottom",
    anchorY: 1440,
    maxHeight: 680,
    styles: {
      normal: { font: "condensed", weight: 400, size: 170, uppercase: true, tracking: 0, lineHeight: 1.0 },
      small: { font: "sans", weight: 800, size: 54, uppercase: true, tracking: 0.01, lineHeight: 1.3 },
      big: { font: "condensed", weight: 400, size: 320, fill: true, uppercase: true, tracking: 0, lineHeight: 0.98 },
      serif: { ...SERIF, size: 130 },
      label: { ...LABEL, weight: 800, uppercase: true, tracking: 0.01 },
    },
    shade: { from: "bottom", size: 1100, opacity: 0.85 },
    shadow: 0.12,
    aligns: ["left", "center", "right"],
  },
  {
    id: "behind",
    name: "Derrière",
    description: "Très gros titre en haut, passe derrière la personne (avec le détourage)",
    x: 50,
    width: 980,
    anchor: "top",
    anchorY: 260,
    maxHeight: 760,
    styles: {
      normal: { font: "condensed", weight: 400, size: 200, uppercase: true, tracking: 0, lineHeight: 0.95 },
      small: { font: "sans", weight: 800, size: 54, uppercase: true, tracking: 0.01, lineHeight: 1.3 },
      big: { font: "condensed", weight: 400, size: 380, fill: true, uppercase: true, tracking: 0, lineHeight: 0.92 },
      serif: { ...SERIF, size: 140 },
      label: { ...LABEL, weight: 800, uppercase: true, tracking: 0.01 },
    },
    shade: { from: "top", size: 900, opacity: 0.55 },
    shadow: 0.08,
    aligns: ["center"],
  },
];

export const PALETTES: Palette[] = [
  { id: "blue", name: "Bleu", text: "#FFFFFF", accent: "#4D8DFF" },
  { id: "lilac", name: "Lilas", text: "#FFFFFF", accent: "#E6DCF5" },
  { id: "orange", name: "Orange", text: "#FFFFFF", accent: "#FF7A1A" },
  { id: "yellow", name: "Jaune", text: "#FFFFFF", accent: "#FFE14D" },
  { id: "green", name: "Vert", text: "#FFFFFF", accent: "#2BFF88" },
];

export const DEFAULT_LINES: Line[] = [
  { text: "Des achats", style: "normal", accent: false },
  { text: "sans contrat peuvent faire couler ton", style: "small", accent: false },
  { text: "entreprise", style: "big", accent: true },
];

// Texte lisible (noir ou blanc) posé sur une couleur donnée.
export function contrastOn(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#111111" : "#FFFFFF";
}
