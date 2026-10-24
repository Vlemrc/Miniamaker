"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABEL, GOOGLE_FONTS, closestWeight, previewGoogleFont, type GoogleFont } from "@/lib/googleFonts";
import type { Line } from "@/lib/templates";

const MAX_RESULTS = 60;

type Props = {
  value: Line["font"];
  templateFont: string; // nom de la police prévue par le style de la ligne
  templateWeight: number;
  onChange: (font: Line["font"]) => void;
  defaultLabel?: string;
};

export default function FontPicker({ value, templateFont, templateWeight, onChange, defaultLabel = "Police du template" }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GoogleFont["c"] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GOOGLE_FONTS.filter((f) => (!category || f.c === category) && (!q || f.f.toLowerCase().includes(q))).slice(0, MAX_RESULTS);
  }, [query, category]);

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/40 p-2">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Chercher parmi ${GOOGLE_FONTS.length} Google Fonts`}
        className="mb-2 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none focus:border-white/30"
      />
      <div className="mb-2 flex flex-wrap gap-1">
        {[null, ...(Object.keys(CATEGORY_LABEL) as GoogleFont["c"][])].map((c) => (
          <button
            key={c ?? "all"}
            onClick={() => setCategory(c)}
            className={`rounded-full px-2 py-0.5 text-[11px] transition ${category === c ? "bg-white/20 text-white" : "text-white/45 hover:text-white"}`}
          >
            {c ? CATEGORY_LABEL[c] : "Toutes"}
          </button>
        ))}
      </div>
      <div className="max-h-64 overflow-y-auto">
        <button
          onClick={() => onChange(undefined)}
          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10 ${!value ? "bg-white/10" : ""}`}
        >
          <span>{defaultLabel}</span>
          <span className="text-[11px] text-white/40">{templateFont}</span>
        </button>
        {results.map((f) => (
          <FontRow key={f.f} font={f} selected={value?.family === f.f} onPick={() => onChange({ family: f.f, weight: closestWeight(f, templateWeight), italic: false })} />
        ))}
        {results.length === 0 && <p className="px-2 py-3 text-xs text-white/40">Aucune police trouvée.</p>}
      </div>
    </div>
  );
}

function FontRow({ font, selected, onPick }: { font: GoogleFont; selected: boolean; onPick: () => void }) {
  useEffect(() => previewGoogleFont(font.f), [font.f]);
  return (
    <button
      onClick={onPick}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-white/10 ${selected ? "bg-white/10" : ""}`}
    >
      <span className="truncate text-base" style={{ fontFamily: `"${font.f}", system-ui` }}>
        {font.f}
      </span>
      <span className="ml-2 shrink-0 text-[11px] text-white/40">{CATEGORY_LABEL[font.c]}</span>
    </button>
  );
}
