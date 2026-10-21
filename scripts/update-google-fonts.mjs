// Régénère la liste des Google Fonts utilisables (src/data/google-fonts.json).
// Usage : node scripts/update-google-fonts.mjs
import { writeFileSync } from "node:fs";

const CATEGORY = { "Sans Serif": "sans", Serif: "serif", Display: "display", Handwriting: "script", Monospace: "mono" };

const res = await fetch("https://fonts.google.com/metadata/fonts");
const { familyMetadataList } = await res.json();

const fonts = familyMetadataList
  .filter((f) => f.subsets.includes("latin") && f.isOpenSource)
  .sort((a, b) => a.popularity - b.popularity)
  .map((f) => {
    const styles = Object.keys(f.fonts);
    const weights = [...new Set(styles.map((s) => parseInt(s, 10)))].sort((a, b) => a - b);
    return { f: f.family, c: CATEGORY[f.category] ?? "sans", w: weights, i: styles.some((s) => s.endsWith("i")) };
  });

writeFileSync("src/data/google-fonts.json", JSON.stringify(fonts));
console.log(`${fonts.length} polices`);
