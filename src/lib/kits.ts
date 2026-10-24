import { CONCEPTS, type Concept } from "./concepts";
import { PALETTES, TEMPLATES, type Align, type Line, type Palette, type Template } from "./templates";

// Un kit de marque = tout ce qui fait le style d'un client : ses templates, ses couleurs, ses concepts.
export type Kit = {
  id: string;
  name: string;
  templates: Template[];
  colors: Palette[];
  concepts: Concept[];
};

// Ce qui était à l'écran à la dernière visite (l'image n'est pas gardée : trop lourde).
export type Draft = {
  kitId: string;
  lines: Line[];
  templateId: string;
  align: Align;
  palette: Palette;
  shade: boolean;
  boost: boolean;
  conceptId: string | null;
};

// Une mini exportée : vignette + réglages, pour la retrouver et repartir de son texte.
export type HistoryItem = {
  id: string;
  date: number;
  thumb: string;
  kitId: string;
  templateId: string;
  align: Align;
  palette: Palette;
  lines: Line[];
};

export const HISTORY_MAX = 24;

export const uid = () => Math.random().toString(36).slice(2, 10);

export function demoKit(): Kit {
  return { id: "demo", name: "Kit de démo", templates: structuredClone(TEMPLATES), colors: structuredClone(PALETTES), concepts: structuredClone(CONCEPTS) };
}

// ——— Sauvegarde locale (navigateur aujourd'hui, fichier dans l'app de bureau plus tard) ———

const KEYS = {
  kits: "miniamaker:kits",
  draft: "miniamaker:draft",
  history: "miniamaker:history",
} as const;

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Sauvegarde impossible", e);
  }
}

export const storage = {
  loadKits: () => load<Kit[]>(KEYS.kits),
  saveKits: (kits: Kit[]) => save(KEYS.kits, kits),
  loadDraft: () => load<Draft>(KEYS.draft),
  saveDraft: (draft: Draft) => save(KEYS.draft, draft),
  loadHistory: () => load<HistoryItem[]>(KEYS.history),
  saveHistory: (items: HistoryItem[]) => save(KEYS.history, items),
};

// Lignes « propres » à enregistrer dans un concept ou l'historique (sans position ni indication).
export function cleanLines(lines: Line[]): Line[] {
  return lines.map((l) => ({ text: l.text, style: l.style, accent: l.accent, ...(l.font ? { font: l.font } : {}) }));
}
