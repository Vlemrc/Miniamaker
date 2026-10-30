import { anton, instrumentSerif, interTight } from "@/lib/fonts";

// Fausse miniature 9:16 pour la landing : fond « vidéo » dessiné en CSS, personne en silhouette,
// texte posé comme dans les templates. Les tailles sont en pixels du canvas 1080 × 1920,
// converties en unités de conteneur pour suivre la largeur de la carte.

type Font = "sans" | "serif" | "condensed";
export type MockLine = { text: string; size: number; font?: Font; weight?: number; upper?: boolean; accent?: boolean; tracking?: number };
export type Mock = {
  layout: "editorial" | "centered" | "impact" | "behind";
  accent: string;
  glow: string; // couleur dominante du « décor »
  align?: "left" | "center";
  lines: MockLine[];
};

const FAMILY: Record<Font, string> = {
  sans: interTight.style.fontFamily,
  serif: instrumentSerif.style.fontFamily,
  condensed: anton.style.fontFamily,
};

const cq = (px: number) => `${px / 10.8}cqw`;

function Line({ l, accent }: { l: MockLine; accent: string }) {
  const font = l.font ?? "sans";
  return (
    <span
      className="block"
      style={{
        fontFamily: FAMILY[font],
        fontWeight: l.weight ?? (font === "sans" ? 800 : 400),
        fontStyle: font === "serif" ? "italic" : undefined,
        fontSize: cq(l.size),
        lineHeight: font === "condensed" ? 0.98 : 1.02,
        letterSpacing: `${l.tracking ?? (font === "sans" ? -0.04 : 0)}em`,
        textTransform: l.upper ? "uppercase" : undefined,
        color: l.accent ? accent : "#fff",
        textShadow: "0 0.6cqw 3cqw rgba(0,0,0,0.35)",
      }}
    >
      {l.text}
    </span>
  );
}

function Person({ glow }: { glow: string }) {
  return (
    <svg viewBox="0 0 1080 1920" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`skin-${glow}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3330" />
          <stop offset="1" stopColor="#141212" />
        </linearGradient>
      </defs>
      <path
        d="M540 520c150 0 245 115 245 275 0 120-50 215-120 265l10 95c190 40 330 140 370 330l35 435H0l35-435c40-190 180-290 370-330l10-95c-70-50-120-145-120-265 0-160 95-275 245-275z"
        fill={`url(#skin-${glow})`}
      />
      <path
        d="M785 795c0 120-50 215-120 265l10 95c190 40 330 140 370 330"
        fill="none"
        stroke={glow}
        strokeOpacity="0.55"
        strokeWidth="10"
        style={{ filter: "blur(6px)" }}
      />
    </svg>
  );
}

export default function ThumbMock({ mock, className = "" }: { mock: Mock; className?: string }) {
  const { layout, accent, glow, align = "left", lines } = mock;
  const behind = layout === "behind";
  const place =
    layout === "editorial"
      ? { top: "59%", transform: "translateY(-50%)" }
      : behind
        ? { top: "12%" }
        : { bottom: "25%" };

  return (
    <div
      className={`relative aspect-[9/16] overflow-hidden rounded-[7%/4%] bg-[#121214] shadow-2xl ring-1 ring-white/10 ${className}`}
      style={{
        containerType: "inline-size",
        backgroundImage: `radial-gradient(120% 70% at 80% 20%, ${glow}55, transparent 60%), radial-gradient(90% 60% at 10% 90%, ${glow}22, transparent 70%), linear-gradient(180deg, #1c1c20, #0c0c0e)`,
      }}
    >
      {!behind && <Person glow={glow} />}
      <div
        className="absolute inset-x-0"
        style={{
          [behind ? "top" : "bottom"]: 0,
          height: behind ? "47%" : "60%",
          background: `linear-gradient(${behind ? "180deg" : "0deg"}, rgba(0,0,0,0.75), transparent)`,
        }}
      />
      <div
        className="absolute"
        style={{ left: cq(80), width: cq(920), textAlign: align, ...place }}
      >
        {lines.map((l, i) => (
          <Line key={i} l={l} accent={accent} />
        ))}
      </div>
      {/* Avec le détourage, la personne passe devant le titre. */}
      {behind && <Person glow={glow} />}
    </div>
  );
}

export const MOCKS: Mock[] = [
  {
    layout: "editorial",
    accent: "#4D8DFF",
    glow: "#4D8DFF",
    lines: [
      { text: "Des achats", size: 116 },
      { text: "sans contrat peuvent couler ton", size: 66, weight: 700, tracking: -0.03 },
      { text: "entreprise", size: 200, accent: true, tracking: -0.045 },
    ],
  },
  {
    layout: "impact",
    accent: "#FF7A1A",
    glow: "#FF7A1A",
    lines: [
      { text: "J'ai testé", size: 54, upper: true, tracking: 0.01 },
      { text: "30 jours", font: "condensed", size: 300, upper: true, accent: true },
      { text: "sans sucre", font: "condensed", size: 170, upper: true },
    ],
  },
  {
    layout: "behind",
    accent: "#FFE14D",
    glow: "#FFE14D",
    align: "center",
    lines: [{ text: "Stop", font: "condensed", size: 520, upper: true, accent: true }],
  },
  {
    layout: "centered",
    accent: "#2BFF88",
    glow: "#2BFF88",
    align: "center",
    lines: [
      { text: "Comment j'ai", size: 82, weight: 600, tracking: -0.02 },
      { text: "doublé", size: 250, weight: 900, upper: true, accent: true, tracking: -0.02 },
      { text: "mon CA en 6 mois", size: 82, weight: 600, tracking: -0.02 },
    ],
  },
  {
    layout: "editorial",
    accent: "#E6DCF5",
    glow: "#9B7BD6",
    lines: [
      { text: "Le vrai", size: 116 },
      { text: "secret", font: "serif", size: 210, accent: true },
      { text: "des agences", size: 116 },
    ],
  },
];
