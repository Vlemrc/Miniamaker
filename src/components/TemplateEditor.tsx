"use client";

import { useState } from "react";
import FontPicker from "@/components/FontPicker";
import { FONT_ROLE_NAME, FONT_ROLE_WEIGHTS } from "@/lib/fonts";
import { GOOGLE_FONTS } from "@/lib/googleFonts";
import { H, LINE_STYLE_LABEL, W, type Align, type LineStyle, type Template, type Typo } from "@/lib/templates";

const ALIGN_LABEL: Record<Align, string> = { left: "Gauche", center: "Centre", right: "Droite" };
const ANCHOR_LABEL: Record<Template["anchor"], string> = { top: "Haut", center: "Centre", bottom: "Bas" };

type Props = {
  template: Template;
  onChange: (t: Template) => void;
  onDuplicate: () => void;
  onDelete: (() => void) | null;
  onClose: () => void;
};

// Réglages d'un template du kit. La zone de texte se règle aussi à la souris dans l'aperçu.
export default function TemplateEditor({ template: t, onChange, onDuplicate, onDelete, onClose }: Props) {
  const [style, setStyle] = useState<LineStyle>("normal");
  const [picking, setPicking] = useState(false);
  const typo = t.styles[style];

  const set = (patch: Partial<Template>) => onChange({ ...t, ...patch });
  const setTypo = (patch: Partial<Typo>) => onChange({ ...t, styles: { ...t.styles, [style]: { ...typo, ...patch } } });

  const gf = typo.family ? GOOGLE_FONTS.find((f) => f.f === typo.family) : null;
  const weights: readonly number[] = gf ? gf.w : FONT_ROLE_WEIGHTS[typo.font];

  return (
    <div className="rounded-xl border border-white/15 bg-white/[0.03] p-3">
      <div className="mb-3 flex items-center gap-2">
        <input
          value={t.name}
          onChange={(e) => set({ name: e.target.value })}
          className="min-w-0 flex-1 rounded-md bg-white/5 px-2 py-1.5 text-sm font-medium outline-none focus:bg-white/10"
          title="Nom du template"
        />
        <button onClick={onClose} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90">
          OK
        </button>
      </div>

      <Group title="Zone de texte" hint="Déplace la zone dans l'aperçu, ou tire ses bords gauche et droit.">
        <Seg options={["top", "center", "bottom"] as const} value={t.anchor} label={(a) => ANCHOR_LABEL[a]} onChange={(anchor) => set({ anchor })} />
        <Slider label="Position verticale" min={0} max={H} value={t.anchorY} onChange={(anchorY) => set({ anchorY })} />
        <Slider label="Marge gauche" min={0} max={W - 200} value={t.x} onChange={(x) => set({ x, width: Math.min(t.width, W - x) })} />
        <Slider label="Largeur" min={200} max={W - t.x} value={t.width} onChange={(width) => set({ width })} />
        <Slider label="Hauteur max" min={200} max={1440} value={t.maxHeight} onChange={(maxHeight) => set({ maxHeight })} />
        <div className="flex items-center justify-between text-xs text-white/60">
          Alignements proposés
          <div className="flex gap-1">
            {(["left", "center", "right"] as Align[]).map((a) => {
              const on = t.aligns.includes(a);
              return (
                <button
                  key={a}
                  onClick={() => {
                    const aligns = on ? t.aligns.filter((x) => x !== a) : [...t.aligns, a];
                    if (aligns.length) set({ aligns });
                  }}
                  className={`rounded-md px-2 py-1 text-[11px] ${on ? "bg-white/20 text-white" : "bg-white/5 text-white/40"}`}
                >
                  {ALIGN_LABEL[a]}
                </button>
              );
            })}
          </div>
        </div>
      </Group>

      <Group title="Styles de ligne">
        <div className="mb-2 flex flex-wrap gap-1">
          {(Object.keys(LINE_STYLE_LABEL) as LineStyle[]).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStyle(st);
                setPicking(false);
              }}
              className={`rounded-md px-2 py-1 text-[11px] ${st === style ? "bg-white/20 text-white" : "text-white/45 hover:text-white"}`}
            >
              {LINE_STYLE_LABEL[st]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPicking((p) => !p)}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${picking ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
          >
            <span className="text-white/40">Aa</span>
            <span className="truncate" style={typo.family ? { fontFamily: `"${typo.family}", system-ui` } : undefined}>
              {typo.family ?? FONT_ROLE_NAME[typo.font]}
            </span>
          </button>
          <select
            value={typo.weight}
            onChange={(e) => setTypo({ weight: +e.target.value })}
            title="Graisse"
            className="rounded-md bg-white/5 px-1 py-1 text-xs outline-none"
          >
            {weights.map((w) => (
              <option key={w} value={w} className="bg-neutral-900">
                {w}
              </option>
            ))}
          </select>
          {gf?.i && (
            <button
              onClick={() => setTypo({ italic: !typo.italic })}
              title="Italique"
              className={`rounded-md px-2 py-1 text-xs italic ${typo.italic ? "bg-white/20" : "bg-white/5 text-white/50"}`}
            >
              I
            </button>
          )}
        </div>
        {picking && (
          <FontPicker
            value={typo.family ? { family: typo.family, weight: typo.weight, italic: !!typo.italic } : undefined}
            templateFont={FONT_ROLE_NAME[typo.font]}
            templateWeight={typo.weight}
            defaultLabel="Police par défaut"
            onChange={(font) => {
              setTypo(
                font
                  ? { family: font.family, weight: font.weight, italic: font.italic }
                  : { family: undefined, weight: FONT_ROLE_WEIGHTS[typo.font].at(-1)!, italic: typo.font === "serif" },
              );
              setPicking(false);
            }}
          />
        )}
        <Slider label="Taille" min={30} max={400} value={typo.size} onChange={(size) => setTypo({ size })} />
        <Slider label="Interlettrage" min={-0.1} max={0.2} step={0.005} value={typo.tracking} onChange={(tracking) => setTypo({ tracking })} />
        <Slider label="Interligne" min={0.8} max={1.8} step={0.01} value={typo.lineHeight} onChange={(lineHeight) => setTypo({ lineHeight })} />
        <Check label="Capitales" on={typo.uppercase} set={(uppercase) => setTypo({ uppercase })} />
        <Check label="Remplir la largeur" on={!!typo.fill} set={(fill) => setTypo({ fill })} />
      </Group>

      <Group title="Effets">
        <Seg options={["top", "bottom"] as const} value={t.shade.from} label={(f) => `Dégradé en ${f === "top" ? "haut" : "bas"}`} onChange={(from) => set({ shade: { ...t.shade, from } })} />
        <Slider label="Intensité du dégradé" min={0} max={1} step={0.01} value={t.shade.opacity} onChange={(opacity) => set({ shade: { ...t.shade, opacity } })} />
        <Slider label="Hauteur du dégradé" min={200} max={H} value={t.shade.size} onChange={(size) => set({ shade: { ...t.shade, size } })} />
        <Slider label="Ombre du texte" min={0} max={0.4} step={0.01} value={t.shadow} onChange={(shadow) => set({ shadow })} />
        <Check label="Personne devant le texte (détourage auto)" on={!!t.subjectInFront} set={(subjectInFront) => set({ subjectInFront })} />
      </Group>

      <div className="flex gap-2">
        <button onClick={onDuplicate} className="flex-1 rounded-lg border border-white/15 py-2 text-xs hover:bg-white/5">
          Dupliquer
        </button>
        {onDelete && (
          <button onClick={onDelete} className="rounded-lg px-3 py-2 text-xs text-red-300/80 hover:bg-red-500/10 hover:text-red-300">
            Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{title}</h3>
      {hint && <p className="text-[11px] text-white/35">{hint}</p>}
      {children}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs text-white/60">
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums text-white/40">{step < 1 ? value.toFixed(2) : Math.round(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-white" />
    </label>
  );
}

function Seg<T extends string>({ options, value, label, onChange }: { options: readonly T[]; value: T; label: (o: T) => string; onChange: (o: T) => void }) {
  return (
    <div className="flex rounded-lg bg-white/5 p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 rounded-md py-1 text-[11px] transition ${o === value ? "bg-white/15" : "text-white/50 hover:text-white"}`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function Check({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex w-full items-center justify-between text-xs text-white/60">
      {label}
      <span className={`relative h-4 w-7 rounded-full transition ${on ? "bg-white" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${on ? "left-[14px] bg-black" : "left-0.5 bg-white/70"}`} />
      </span>
    </button>
  );
}
