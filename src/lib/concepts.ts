import type { Align, Line } from "./templates";

// Concepts récurrents : chaque concept pré-remplit une structure de lignes et un template.
// Le texte d'exemple est à remplacer ; seule la structure (styles, étiquette) fait le concept.
// Liste provisoire, à faire valider par le client.

export type Concept = {
  id: string;
  name: string;
  template: string;
  align: Align;
  lines: Line[];
};

const l = (text: string, style: Line["style"], accent = false): Line => ({ text, style, accent });

export const CONCEPTS: Concept[] = [
  {
    id: "true-false",
    name: "Vrai ou faux",
    template: "centered",
    align: "center",
    lines: [l("Vrai ou faux ?", "label", true), l("Le cold call", "normal"), l("c'est mort", "big")],
  },
  {
    id: "top3",
    name: "Top 3",
    template: "editorial",
    align: "left",
    lines: [l("Top 3", "label", true), l("des outils pour", "small"), l("prospecter", "big")],
  },
  {
    id: "before-after",
    name: "Avant / après",
    template: "centered",
    align: "center",
    lines: [l("Avant → après", "label", true), l("Mon chiffre d'affaires", "normal"), l("x3", "big")],
  },
  {
    id: "mistake",
    name: "Erreur à éviter",
    template: "editorial",
    align: "left",
    lines: [l("L'erreur que", "normal"), l("tout le monde", "serif"), l("fait", "big", true)],
  },
  {
    id: "why",
    name: "Pourquoi…",
    template: "editorial",
    align: "left",
    lines: [l("Pourquoi", "normal"), l("personne", "big", true), l("ne répond à tes appels", "small")],
  },
  {
    id: "howto",
    name: "Comment / astuce",
    template: "editorial",
    align: "left",
    lines: [l("Comment", "normal"), l("doubler", "serif", true), l("tes rendez-vous", "normal")],
  },
  {
    id: "hot-take",
    name: "Avis tranché",
    template: "impact",
    align: "left",
    lines: [l("Avis impopulaire", "label", true), l("Arrête de", "normal"), l("relancer", "big")],
  },
  {
    id: "number",
    name: "Chiffre clé",
    template: "centered",
    align: "center",
    lines: [l("+300 %", "big", true), l("de rendez-vous", "normal"), l("en un mois", "small")],
  },
  {
    id: "quote",
    name: "Citation",
    template: "editorial",
    align: "left",
    lines: [l("« Le meilleur closer", "serif"), l("c'est celui qui écoute »", "normal"), l("Prénom Nom", "label")],
  },
  {
    id: "behind",
    name: "Titre derrière",
    template: "behind",
    align: "center",
    lines: [l("Le secret du", "small", true), l("cold call", "big")],
  },
];
