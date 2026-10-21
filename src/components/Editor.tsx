"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { anton, instrumentSerif, interTight } from "@/lib/fonts";
import { frameTimes, grabFull, grabThumb, loadImage, loadVideo } from "@/lib/frames";
import { clampCrop, drawGridOverlay, render, renderMaskEditor, toSourcePoint, type Crop, type Fonts, type Scene, type Source } from "@/lib/render";
import { CONCEPTS, type Concept } from "@/lib/concepts";
import { cutout } from "@/lib/segment";
import { detectSubtitles, emptyMask, inpaint, preloadInpainting } from "@/lib/subtitles";
import { FLAG_LABEL, analyze, preloadDetector, rank, type Analysis, type Scored } from "@/lib/scoring";
import { DEFAULT_LINES, H, LINE_STYLE_LABEL, PALETTES, TEMPLATES, W, type Align, type Line, type LineStyle, type Palette } from "@/lib/templates";

const FRAME_COUNT = 24;
const NO_CROP: Crop = { zoom: 1, offX: 0, offY: 0 };

type Frame = Scored & { t: number; thumb: string };

const ALIGN_LABEL: Record<Align, string> = { left: "Gauche", center: "Centre", right: "Droite" };

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Une seule opération de lecture vidéo à la fois (les seeks concurrents se marchent dessus).
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const loadId = useRef(0);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const lastPaint = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const [source, setSource] = useState<Source | null>(null);
  const [fileName, setFileName] = useState("");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pickedT, setPickedT] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [lines, setLines] = useState<Line[]>(DEFAULT_LINES);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [align, setAlign] = useState<Align>("left");
  const [palette, setPalette] = useState<Palette>(PALETTES[0]);
  const [crop, setCrop] = useState<Crop>(NO_CROP);
  const [shade, setShade] = useState(true);
  const [boost, setBoost] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [fontsReady, setFontsReady] = useState(false);
  const [depth, setDepth] = useState(false);
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [subject, setSubject] = useState<{ of: Source; cut: Source } | null>(null);
  const [segError, setSegError] = useState("");

  // Effacement des sous-titres. Liés à l'image d'origine : changer d'image les invalide.
  const [cleaned, setCleaned] = useState<{ of: Source; img: Source } | null>(null);
  const [maskEdit, setMaskEdit] = useState<{ of: Source; canvas: HTMLCanvasElement } | null>(null);
  const [maskTick, setMaskTick] = useState(0);
  const [brush, setBrush] = useState({ size: 40, erase: false });
  const [cleaning, setCleaning] = useState(false);
  const [cleanError, setCleanError] = useState("");

  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const fonts: Fonts = useMemo(
    () => ({ sans: interTight.style.fontFamily, serif: instrumentSerif.style.fontFamily, condensed: anton.style.fontFamily }),
    [],
  );
  const shown = cleaned && cleaned.of === source ? cleaned.img : source;
  const editingMask = maskEdit && maskEdit.of === source ? maskEdit.canvas : null;
  const cut = depth && subject && subject.of === shown ? subject.cut : null;
  const segmenting = depth && !!shown && !cut && !segError;
  const effectiveAlign = template.aligns.includes(align) ? align : template.aligns[0];

  const scene: Scene = useMemo(
    () => ({ source: shown, subject: cut, crop, template, palette, align: effectiveAlign, lines, shade, boost }),
    [shown, cut, crop, template, palette, effectiveAlign, lines, shade, boost],
  );

  useEffect(() => {
    Promise.all([
      ...["600", "700", "800", "900"].map((w) => document.fonts.load(`${w} 100px ${fonts.sans}`)),
      document.fonts.load(`italic 400 100px ${fonts.serif}`),
      document.fonts.load(`400 100px ${fonts.condensed}`),
    ]).then(() => setFontsReady(true));
    preloadDetector();
  }, [fonts]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !fontsReady) return;
    if (editingMask && source) {
      renderMaskEditor(ctx, source, crop, editingMask);
      return;
    }
    render(ctx, scene, fonts);
    if (showGrid) drawGridOverlay(ctx);
  }, [scene, showGrid, fonts, fontsReady, editingMask, source, crop, maskTick]);

  function applyConcept(c: Concept) {
    setConceptId(c.id);
    setLines(c.lines.map((l) => ({ ...l })));
    setTemplateId(c.template);
    setAlign(c.align);
    setDepth(c.template === "behind");
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  // Détourage de la personne, recalculé quand l'image change.
  useEffect(() => {
    if (!depth || !shown) return;
    let alive = true;
    setSegError("");
    cutout(shown).then(
      (c) => alive && setSubject({ of: shown, cut: c }),
      (e) => {
        console.warn(e);
        if (alive) setSegError("Détourage impossible (modèle non chargé, connexion ?).");
      },
    );
    return () => {
      alive = false;
    };
  }, [depth, shown]);

  // Taille d'affichage de l'aperçu : la plus grande possible en 9:16 dans l'espace dispo.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const h = Math.min(height, (width * H) / W);
      setStage({ w: (h * W) / H, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(fn, fn);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const pickFrame = useCallback(
    async (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      setPickedT(t);
      const src = await enqueue(() => grabFull(v, t));
      setSource(src);
      setCrop((c) => clampCrop(src, c));
    },
    [enqueue],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const id = ++loadId.current;
      setError("");
      setFrames([]);
      setPickedT(null);
      setProgress(null);
      setCrop(NO_CROP);
      setFileName(file.name);
      if (videoRef.current) URL.revokeObjectURL(videoRef.current.src);
      videoRef.current = null;

      try {
        if (file.type.startsWith("image/")) {
          setSource(await loadImage(file));
          return;
        }
        const v = await loadVideo(file);
        if (id !== loadId.current) return;
        videoRef.current = v;
        setSource(null);

        const times = frameTimes(v.duration, FRAME_COUNT);
        const raw: { t: number; thumb: string; a: Analysis }[] = [];
        setProgress({ done: 0, total: times.length });
        for (const t of times) {
          const c = await enqueue(() => grabThumb(v, t));
          const a = await analyze(c);
          if (id !== loadId.current) return;
          raw.push({ t, thumb: c.toDataURL("image/jpeg", 0.75), a });
          const scored = rank(raw.map((r) => r.a));
          setFrames(raw.map((r, j) => ({ ...scored[j], t: r.t, thumb: r.thumb })));
          setProgress({ done: raw.length, total: times.length });
          if (raw.length === 1) setSource(await enqueue(() => grabFull(v, t)));
        }
        setProgress(null);
        const scored = rank(raw.map((r) => r.a));
        const best = raw[scored.indexOf(scored.reduce((a, b) => (b.score > a.score ? b : a)))];
        await pickFrame(best.t);
      } catch (e) {
        setProgress(null);
        setError(e instanceof Error ? e.message : "Fichier illisible.");
      }
    },
    [enqueue, pickFrame],
  );

  const step = (frames.length > 0 || progress ? 3 : 2) + (source ? 1 : 0);
  const sorted = useMemo(() => [...frames].sort((a, b) => b.score - a.score), [frames]);
  const good = sorted.filter((f) => f.flags.length === 0);
  const rejected = sorted.filter((f) => f.flags.length > 0);
  const visible = showRejected ? sorted : good;

  async function exportImage(type: "image/jpeg" | "image/png") {
    await document.fonts.ready;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    render(c.getContext("2d")!, scene, fonts);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.93));
    if (!blob) return;
    const slug =
      lines
        .map((l) => l.text)
        .join(" ")
        .replace(/\*/g, "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) || "miniature";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.${type === "image/png" ? "png" : "jpg"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ——— Sous-titres ———
  function startCleaning() {
    if (!source) return;
    setCleanError("");
    preloadInpainting();
    setMaskEdit({ of: source, canvas: detectSubtitles(source) });
  }

  async function runCleaning() {
    if (!source || !editingMask) return;
    setCleaning(true);
    setCleanError("");
    try {
      const img = await inpaint(source, editingMask);
      setCleaned({ of: source, img });
      setMaskEdit(null);
    } catch (e) {
      console.warn(e);
      setCleanError("Effacement impossible (modèle non chargé, connexion ?).");
    } finally {
      setCleaning(false);
    }
  }

  // Pinceau : ajoute ou gomme de la zone à effacer.
  function paint(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!source || !editingMask) return;
    const r = e.currentTarget.getBoundingClientRect();
    const k = W / r.width;
    const p = toSourcePoint(source, crop, (e.clientX - r.left) * k, (e.clientY - r.top) * k);
    const ctx = editingMask.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = brush.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = ctx.fillStyle = "#FF0000";
    ctx.lineWidth = (brush.size * k) / p.scale;
    ctx.lineCap = "round";
    ctx.beginPath();
    const from = lastPaint.current ?? p;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    lastPaint.current = p;
    setMaskTick((t) => t + 1);
  }

  // ——— Cadrage à la souris ———
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!source) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (editingMask) {
      lastPaint.current = null;
      paint(e);
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, crop };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (editingMask) {
      if (e.buttons) paint(e);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const scale = W / e.currentTarget.clientWidth;
    setCrop(clampCrop(source, { ...d.crop, offX: d.crop.offX + (e.clientX - d.x) * scale, offY: d.crop.offY + (e.clientY - d.y) * scale }));
  }
  function setZoom(zoom: number) {
    setCrop((c) => clampCrop(source, { ...c, zoom }));
  }

  return (
    <main
      className="flex h-screen overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
    >
      {/* ——— Panneau de contrôle ——— */}
      <aside className="w-[420px] shrink-0 overflow-y-auto border-r border-white/10 bg-[#111114] px-6 py-6">
        <div className="mb-7 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Miniamaker</h1>
          <span className="text-xs text-white/40">Prototype · 9:16</span>
        </div>

        <Section n={1} title="Source">
          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-white/20 px-4 py-5 text-sm transition hover:border-white/40 hover:bg-white/5"
          >
            <span className="font-medium">Importer une vidéo ou une image</span>
            <span className="text-xs text-white/45">{fileName || "ou glisse un fichier n'importe où"}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*,image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
        </Section>

        {(frames.length > 0 || progress) && (
          <Section n={2} title="Choisir l'image">
            <div className="mb-3 flex items-center justify-between text-xs text-white/50">
              <span>
                {progress
                  ? `Analyse ${progress.done}/${progress.total}…`
                  : `${good.length} bonnes images · ${rejected.length} écartées`}
              </span>
              {rejected.length > 0 && (
                <button className="underline-offset-2 hover:underline" onClick={() => setShowRejected((s) => !s)}>
                  {showRejected ? "Masquer les écartées" : "Voir les écartées"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {visible.map((f) => (
                <button
                  key={f.t}
                  onClick={() => pickFrame(f.t)}
                  title={`${f.t.toFixed(1)} s`}
                  className={`relative aspect-[9/16] overflow-hidden rounded-lg ring-2 transition ${
                    pickedT === f.t ? "ring-white" : "ring-transparent hover:ring-white/40"
                  } ${f.flags.length ? "opacity-60" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.thumb} alt="" className="h-full w-full object-cover" />
                  {f.flags.length > 0 && (
                    <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/75 px-1 py-0.5 text-[10px] leading-tight text-red-300">
                      {FLAG_LABEL[f.flags[0]]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Section>
        )}

        {source && (
          <Section n={step - 1} title="Sous-titres incrustés">
            {editingMask ? (
              <>
                <p className="mb-3 text-xs text-white/50">
                  En rouge : ce qui va être effacé. Corrige au pinceau dans l&apos;aperçu si besoin.
                </p>
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex rounded-lg bg-white/5 p-1 text-xs">
                    {[
                      { erase: false, label: "Ajouter" },
                      { erase: true, label: "Gommer" },
                    ].map((m) => (
                      <button
                        key={m.label}
                        onClick={() => setBrush((b) => ({ ...b, erase: m.erase }))}
                        className={`rounded-md px-3 py-1.5 transition ${brush.erase === m.erase ? "bg-white/15" : "text-white/50 hover:text-white"}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={120}
                    value={brush.size}
                    onChange={(e) => setBrush((b) => ({ ...b, size: +e.target.value }))}
                    className="flex-1 accent-white"
                    title="Taille du pinceau"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={runCleaning}
                    disabled={cleaning}
                    className="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-50"
                  >
                    {cleaning ? "Effacement…" : "Effacer"}
                  </button>
                  <button
                    onClick={() => {
                      setMaskEdit({ of: source, canvas: emptyMask(source) });
                    }}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5"
                  >
                    Vider
                  </button>
                  <button onClick={() => setMaskEdit(null)} className="rounded-lg px-3 py-2 text-xs text-white/50 hover:text-white">
                    Annuler
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={startCleaning}
                  className="flex-1 rounded-lg border border-white/15 py-2 text-xs font-medium hover:bg-white/5"
                >
                  {cleaned?.of === source ? "Retoucher l'effacement" : "Effacer les sous-titres"}
                </button>
                {cleaned?.of === source && (
                  <button onClick={() => setCleaned(null)} className="text-xs text-white/50 hover:text-white">
                    Image d&apos;origine
                  </button>
                )}
              </div>
            )}
            {cleanError && <p className="mt-2 text-xs text-red-300">{cleanError}</p>}
          </Section>
        )}

        <Section n={step} title="Concept">
          <div className="flex flex-wrap gap-1.5">
            {CONCEPTS.map((c) => (
              <button
                key={c.id}
                onClick={() => applyConcept(c)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  c.id === conceptId ? "border-white bg-white text-black" : "border-white/10 text-white/70 hover:border-white/30 hover:text-white"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/40">Pré-remplit la structure du texte et le template. Remplace ensuite le texte d&apos;exemple.</p>
        </Section>

        <Section n={step + 1} title="Texte">
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2">
                <input
                  value={line.text}
                  onChange={(e) => updateLine(i, { text: e.target.value })}
                  placeholder="Texte de la ligne"
                  className="mb-2 w-full bg-transparent px-1 text-sm outline-none placeholder:text-white/30"
                />
                <div className="flex items-center gap-1">
                  {(Object.keys(LINE_STYLE_LABEL) as LineStyle[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => updateLine(i, { style: st })}
                      className={`rounded-md px-1.5 py-1 text-[11px] transition ${
                        line.style === st ? "bg-white/20 text-white" : "text-white/45 hover:text-white"
                      }`}
                    >
                      {LINE_STYLE_LABEL[st]}
                    </button>
                  ))}
                  <button
                    onClick={() => updateLine(i, { accent: !line.accent })}
                    title="Ligne en couleur"
                    className={`ml-auto h-5 w-5 rounded-full ring-1 ring-white/30 ${line.accent ? "" : "opacity-40"}`}
                    style={{ background: line.accent ? palette.accent : "#FFFFFF" }}
                  />
                  <button
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    title="Supprimer la ligne"
                    className="ml-1 px-1 text-sm text-white/35 hover:text-white"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          {lines.length < 5 && (
            <button
              onClick={() => setLines((ls) => [...ls, { text: "", style: "normal", accent: false }])}
              className="mt-2 w-full rounded-lg border border-dashed border-white/15 py-2 text-xs text-white/50 hover:border-white/30 hover:text-white"
            >
              + Ajouter une ligne
            </button>
          )}
          <p className="mt-2 text-xs text-white/40">
            Une ligne saisie = une ligne sur la mini. Entoure un mot d&apos;astérisques pour le mettre en couleur :{" "}
            <code className="text-white/60">*entreprise*</code>
          </p>
        </Section>

        <Section n={step + 2} title="Style">
          <div className="mb-4 grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTemplateId(t.id);
                  // Le détourage n'a de sens que si le texte est derrière la tête.
                  setDepth(t.id === "behind");
                }}
                title={t.description}
                className={`rounded-lg border px-2 py-2.5 text-xs transition ${
                  t.id === templateId ? "border-white bg-white text-black" : "border-white/10 hover:border-white/30"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div className="mb-4 flex rounded-lg bg-white/5 p-1">
            {template.aligns.map((a) => (
              <button
                key={a}
                onClick={() => setAlign(a)}
                className={`flex-1 rounded-md py-1.5 text-xs transition ${a === effectiveAlign ? "bg-white/15" : "text-white/50 hover:text-white"}`}
              >
                {ALIGN_LABEL[a]}
              </button>
            ))}
          </div>

          <div className="mb-4 flex items-center gap-2">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPalette(p)}
                title={p.name}
                className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-[#111114] transition ${
                  palette.id === p.id ? "ring-white" : "ring-transparent"
                }`}
                style={{ background: p.accent }}
              />
            ))}
            <label
              title="Couleur du client"
              className={`relative h-8 w-8 cursor-pointer overflow-hidden rounded-full ring-2 ring-offset-2 ring-offset-[#111114] ${
                palette.id === "custom" ? "ring-white" : "ring-transparent"
              }`}
              style={{ background: palette.id === "custom" ? palette.accent : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
            >
              <input
                type="color"
                className="absolute inset-0 opacity-0"
                value={palette.accent}
                onChange={(e) => setPalette({ id: "custom", name: "Perso", text: "#FFFFFF", accent: e.target.value.toUpperCase() })}
              />
            </label>
          </div>

          <div className="space-y-2">
            <Toggle label="Détourer la personne (texte derrière)" on={depth} set={setDepth} />
            {segmenting && <p className="text-xs text-white/45">Détourage en cours…</p>}
            {depth && segError && <p className="text-xs text-red-300">{segError}</p>}
            <Toggle label="Dégradé derrière le texte" on={shade} set={setShade} />
            <Toggle label="Booster l'image (contraste, couleurs)" on={boost} set={setBoost} />
          </div>
        </Section>

        <Section n={step + 3} title="Cadrage">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.01}
              value={crop.zoom}
              onChange={(e) => setZoom(+e.target.value)}
              className="flex-1 accent-white"
              disabled={!source}
            />
            <button className="text-xs text-white/50 hover:text-white" onClick={() => setCrop(NO_CROP)}>
              Réinitialiser
            </button>
          </div>
          <p className="mt-1.5 text-xs text-white/40">Glisse l&apos;image dans l&apos;aperçu pour la recadrer.</p>
        </Section>
      </aside>

      {/* ——— Aperçu ——— */}
      <section className="relative flex flex-1 flex-col items-center px-8 py-5">
        <div className="mb-4 flex w-full max-w-[640px] items-center justify-between gap-3">
          <div className="flex gap-1.5 text-xs">
            <Chip on={showGrid} onClick={() => setShowGrid((g) => !g)}>
              Recadrage grille profil (3:4)
            </Chip>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportImage("image/png")}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium hover:bg-white/5"
            >
              PNG
            </button>
            <button onClick={() => exportImage("image/jpeg")} className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90">
              Exporter en JPG
            </button>
          </div>
        </div>

        <div ref={stageRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => {
              drag.current = null;
              lastPaint.current = null;
            }}
            onWheel={(e) => source && setZoom(Math.max(1, Math.min(2.5, crop.zoom - e.deltaY * 0.002)))}
            style={{ width: stage.w, height: stage.h }}
            className={`rounded-2xl shadow-2xl shadow-black/60 ${editingMask ? "cursor-crosshair" : source ? "cursor-grab active:cursor-grabbing" : ""}`}
          />
        </div>

        {dragOver && (
          <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-3xl border-2 border-dashed border-white/50 bg-black/60 text-lg font-medium">
            Dépose ta vidéo ou ton image
          </div>
        )}
      </section>
    </main>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px]">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex w-full items-center justify-between text-sm text-white/80">
      {label}
      <span className={`relative h-5 w-9 rounded-full transition ${on ? "bg-white" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${on ? "left-[18px] bg-black" : "left-0.5 bg-white/70"}`} />
      </span>
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 transition ${on ? "border-white/40 bg-white/10" : "border-white/10 text-white/50 hover:text-white"}`}
    >
      {children}
    </button>
  );
}
