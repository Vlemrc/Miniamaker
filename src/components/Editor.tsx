"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FontPicker from "@/components/FontPicker";
import TemplateEditor from "@/components/TemplateEditor";
import { FONT_ROLE_NAME, anton, instrumentSerif, interTight } from "@/lib/fonts";
import { GOOGLE_FONTS, loadGoogleFont } from "@/lib/googleFonts";
import { frameTimes, grabFull, grabThumb, loadImage, loadVideo } from "@/lib/frames";
import { GRID_H, clampCrop, clampGridTop, drawGridOverlay, gridHit, drawZoneOverlay, render, linePositions, zoneRect, renderMaskEditor, toSourcePoint, type Crop, type Fonts, type Scene, type Source } from "@/lib/render";
import type { Concept } from "@/lib/concepts";
import { HISTORY_MAX, cleanLines, demoKit, storage, uid, type HistoryItem, type Kit } from "@/lib/kits";
import { blobToSource, loadMedia, saveMedia, sourceToBlob, updateMedia, type SavedMedia } from "@/lib/media";
import { cutout } from "@/lib/segment";
import { StretchSwitch } from "@/components/ui/stretch-switch";
import { IOSSpinner } from "@/components/amicro/ios-spinner";
import { detectSubtitles, emptyMask, inpaint, preloadInpainting } from "@/lib/subtitles";
import { FLAG_LABEL, analyze, preloadDetector, rank, type Analysis, type Scored } from "@/lib/scoring";
import { DEFAULT_LINES, H, LINE_STYLE_LABEL, PALETTES, SAFE, TEMPLATES, W, type Align, type Line, type LineStyle, type Palette, type Template } from "@/lib/templates";

const FRAME_COUNT = 24;
const NO_CROP: Crop = { zoom: 1, offX: 0, offY: 0 };

type Frame = Scored & { t: number; thumb: string };
type ZoneMode = "move" | "left" | "right";

const ALIGN_LABEL: Record<Align, string> = { left: "Gauche", center: "Centre", right: "Droite" };

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Une seule opération de lecture vidéo à la fois (les seeks concurrents se marchent dessus).
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const loadId = useRef(0);
  const drag = useRef<
    | { kind: "image"; x: number; y: number; crop: Crop }
    | { kind: "line"; index: number; y: number; dy: number; min: number; max: number }
    | { kind: "zone"; mode: ZoneMode; x: number; y: number; t: Template }
    | { kind: "grid"; y: number; top: number }
    | null
  >(null);
  // Clic maintenu dans la bande 3:4 : si le pointeur reste immobile un instant, on déplace la bande.
  const hold = useRef<{ timer: number; x: number; y: number; top: number } | null>(null);
  const lastPaint = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const [source, setSource] = useState<Source | null>(null);
  const [fileName, setFileName] = useState("");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pickedT, setPickedT] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // Parcours : d'abord on choisit l'image (cadre de la vidéo, sous-titres), puis on fait la mini.
  const [phase, setPhase] = useState<"image" | "design">("image");
  // Le temps de vérifier s'il y a un média de la dernière visite (évite un flash de l'accueil).
  const [restoring, setRestoring] = useState(true);
  // Tant qu'aucun média n'est chargé, on n'affiche que l'accueil (pas d'aperçu ni de panneau).
  const started = fileName !== "" && !error;

  const [lines, setLines] = useState<Line[]>(DEFAULT_LINES);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [align, setAlign] = useState<Align>("left");
  const [palette, setPalette] = useState<Palette>(PALETTES[0]);
  const [crop, setCrop] = useState<Crop>(NO_CROP);
  const [shade, setShade] = useState(true);
  const [boost, setBoost] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [gridTop, setGridTop] = useState(SAFE.gridTop);
  const [overGrid, setOverGrid] = useState(false);
  const [holdingGrid, setHoldingGrid] = useState(false);
  const [fontLine, setFontLine] = useState<number | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const [overText, setOverText] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [depth, setDepth] = useState(false);
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [subject, setSubject] = useState<{ of: Source; cut: Source } | null>(null);

  // Kits de marque, brouillon et historique : sauvegardés localement.
  const [kits, setKits] = useState<Kit[]>(() => [demoKit()]);
  const [kitId, setKitId] = useState("demo");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [overZone, setOverZone] = useState<ZoneMode | null>(null);
  const [segError, setSegError] = useState("");

  // Effacement des sous-titres. Liés à l'image d'origine : changer d'image les invalide.
  const [cleaned, setCleaned] = useState<{ of: Source; img: Source } | null>(null);
  const [maskEdit, setMaskEdit] = useState<{ of: Source; canvas: HTMLCanvasElement } | null>(null);
  const [maskTick, setMaskTick] = useState(0);
  const [brush, setBrush] = useState({ size: 40, erase: false });
  const [cleaning, setCleaning] = useState(false);
  const [cleanError, setCleanError] = useState("");

  const kit = kits.find((k) => k.id === kitId) ?? kits[0];
  const template = kit.templates.find((t) => t.id === templateId) ?? kit.templates[0];
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
    () => ({ source: shown, subject: cut, crop, template, palette, align: effectiveAlign, lines, shade, boost, gridTop }),
    [shown, cut, crop, template, palette, effectiveAlign, lines, shade, boost, gridTop],
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
    if (showGrid) drawGridOverlay(ctx, gridTop);
    if (editingTemplate) drawZoneOverlay(ctx, template);
  }, [started, scene, showGrid, gridTop, fonts, fontsReady, editingMask, source, crop, maskTick, fontsTick, editingTemplate, template]);

  // Google Fonts choisies sur les lignes ou dans le template : chargées à la demande, puis on redessine.
  const lineFonts = JSON.stringify([
    ...lines.flatMap((l) => (l.font ? [l.font] : [])),
    ...Object.values(template.styles).flatMap((st) => (st.family ? [{ family: st.family, weight: st.weight, italic: !!st.italic }] : [])),
  ]);
  useEffect(() => {
    for (const f of JSON.parse(lineFonts) as NonNullable<Line["font"]>[]) {
      loadGoogleFont(f.family, f.weight, f.italic).then(
        () => setFontsTick((t) => t + 1),
        (e) => console.warn(e),
      );
    }
  }, [lineFonts]);

  // Changer de concept garde le texte déjà saisi : il est reversé, dans l'ordre, dans les lignes
  // du nouveau concept (qui en impose les styles). Les étiquettes du concept (« Vrai ou faux ? »…)
  // gardent leur texte ; les lignes sans texte affichent l'exemple du concept en indication.
  function applyConcept(c: Concept) {
    setConceptId(c.id);
    setLines((current) => {
      const texts = current.filter((l) => l.style !== "label" && l.text.trim()).map((l) => l.text);
      if (!texts.length) return c.lines.map((l) => ({ ...l }));
      const next = c.lines.map((l) => (l.style === "label" ? { ...l } : { ...l, text: texts.shift() ?? "", hint: l.text }));
      return [...next, ...texts.map((text) => ({ text, style: "normal" as const, accent: false }))];
    });
    setTemplateId(c.template);
    setAlign(c.align);
    setDepth(!!kit.templates.find((t) => t.id === c.template)?.subjectInFront);
    setEditingTemplate(false);
  }

  // ——— Kits, sauvegarde et historique ———

  // Au premier affichage : on reprend les kits, le brouillon et l'historique enregistrés.
  useEffect(() => {
    const savedKits = storage.loadKits();
    if (savedKits?.length) setKits(savedKits);
    const d = storage.loadDraft();
    if (d) {
      setKitId(d.kitId);
      setLines(d.lines);
      setTemplateId(d.templateId);
      setAlign(d.align);
      setPalette(d.palette);
      setShade(d.shade);
      setBoost(d.boost);
      setConceptId(d.conceptId);
      if (d.crop) setCrop(d.crop);
      if (d.gridTop !== undefined) setGridTop(d.gridTop);
      if (d.showGrid !== undefined) setShowGrid(d.showGrid);
      if (d.depth !== undefined) setDepth(d.depth);
    }
    setHistory(storage.loadHistory() ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) storage.saveKits(kits);
  }, [kits, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(
      () => storage.saveDraft({ kitId, lines, templateId, align, palette, shade, boost, conceptId, crop, gridTop, showGrid, depth }),
      300,
    );
    return () => clearTimeout(id);
  }, [loaded, kitId, lines, templateId, align, palette, shade, boost, conceptId, crop, gridTop, showGrid, depth]);

  useEffect(() => {
    if (loaded) storage.saveHistory(history);
  }, [history, loaded]);

  function updateKit(fn: (k: Kit) => Kit) {
    setKits((ks) => ks.map((k) => (k.id === kit.id ? fn(k) : k)));
  }

  function selectKit(id: string) {
    const k = kits.find((x) => x.id === id);
    if (!k) return;
    setKitId(id);
    setTemplateId(k.templates[0].id);
    setPalette(k.colors[0] ?? PALETTES[0]);
    setConceptId(null);
    setEditingTemplate(false);
  }

  function newKit() {
    const name = prompt("Nom du nouveau kit (ex. le nom du client) :", "Nouveau client");
    if (!name?.trim()) return;
    // On part d'une copie du kit actuel : plus rapide que de tout refaire.
    const k: Kit = { ...structuredClone(kit), id: uid(), name: name.trim() };
    setKits((ks) => [...ks, k]);
    setKitId(k.id);
  }

  function renameKit() {
    const name = prompt("Nouveau nom du kit :", kit.name);
    if (name?.trim()) updateKit((k) => ({ ...k, name: name.trim() }));
  }

  function deleteKit() {
    if (kits.length < 2 || !confirm(`Supprimer le kit « ${kit.name} » ? Ses templates, couleurs et concepts seront perdus.`)) return;
    const rest = kits.filter((k) => k.id !== kit.id);
    setKits(rest);
    selectKit(rest[0].id);
    setKitId(rest[0].id);
  }

  function selectTemplate(t: Template) {
    setTemplateId(t.id);
    resetLinePositions();
    setDepth(!!t.subjectInFront);
  }

  function updateTemplate(t: Template) {
    updateKit((k) => ({ ...k, templates: k.templates.map((x) => (x.id === t.id ? t : x)) }));
  }

  function duplicateTemplate() {
    const t: Template = { ...structuredClone(template), id: uid(), name: `${template.name} (copie)` };
    updateKit((k) => ({ ...k, templates: [...k.templates, t] }));
    setTemplateId(t.id);
  }

  function deleteTemplate() {
    if (kit.templates.length < 2 || !confirm(`Supprimer le template « ${template.name} » ?`)) return;
    const rest = kit.templates.filter((t) => t.id !== template.id);
    updateKit((k) => ({ ...k, templates: rest }));
    setTemplateId(rest[0].id);
    setEditingTemplate(false);
  }

  function saveConcept() {
    const name = prompt("Nom du concept (ex. « Vrai ou faux ») :");
    if (!name?.trim()) return;
    const c: Concept = { id: uid(), name: name.trim(), template: template.id, align: effectiveAlign, lines: cleanLines(lines) };
    updateKit((k) => ({ ...k, concepts: [...k.concepts, c] }));
    setConceptId(c.id);
  }

  function deleteConcept(c: Concept) {
    if (!confirm(`Supprimer le concept « ${c.name} » ?`)) return;
    updateKit((k) => ({ ...k, concepts: k.concepts.filter((x) => x.id !== c.id) }));
  }

  function addColor(hex: string) {
    const p: Palette = { id: uid(), name: hex, text: "#FFFFFF", accent: hex.toUpperCase() };
    updateKit((k) => ({ ...k, colors: [...k.colors, p] }));
    setPalette(p);
  }

  function deleteColor(p: Palette) {
    updateKit((k) => ({ ...k, colors: k.colors.filter((x) => x.id !== p.id) }));
  }

  function restoreFromHistory(h: HistoryItem) {
    if (kits.some((k) => k.id === h.kitId)) setKitId(h.kitId);
    setTemplateId(h.templateId);
    setAlign(h.align);
    setPalette(h.palette);
    setLines(h.lines.map((l) => ({ ...l })));
    setConceptId(null);
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

  // Nouvelle étape : on repart du haut du panneau.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [phase]);

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
  }, [started]);

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
      updateMedia({ pickedT: t, cleaned: null });
      const src = await enqueue(() => grabFull(v, t));
      setSource(src);
      setCrop((c) => clampCrop(src, c));
    },
    [enqueue],
  );

  // `saved` : on rouvre le média de la dernière visite, sans refaire l'analyse ni perdre le cadrage.
  const handleFile = useCallback(
    async (file: File, saved?: SavedMedia) => {
      const id = ++loadId.current;
      setError("");
      setFrames([]);
      setPickedT(null);
      setProgress(null);
      setFileName(file.name);
      setPhase(saved ? "design" : "image");
      if (videoRef.current) URL.revokeObjectURL(videoRef.current.src);
      videoRef.current = null;
      if (!saved) {
        setCrop(NO_CROP);
        saveMedia({ file, frames: [], pickedT: null, cleaned: null });
      }
      const restoreCleaned = async (src: Source) => {
        if (saved?.cleaned && id === loadId.current) setCleaned({ of: src, img: await blobToSource(saved.cleaned) });
      };

      try {
        if (file.type.startsWith("image/")) {
          const src = await loadImage(file);
          setSource(src);
          await restoreCleaned(src);
          return;
        }
        const v = await loadVideo(file);
        if (id !== loadId.current) return;
        videoRef.current = v;
        setSource(null);

        if (saved && saved.frames.length === FRAME_COUNT) {
          setFrames(saved.frames);
          const t = saved.pickedT ?? saved.frames.reduce((a, b) => (b.score > a.score ? b : a)).t;
          setPickedT(t);
          const src = await enqueue(() => grabFull(v, t));
          if (id !== loadId.current) return;
          setSource(src);
          await restoreCleaned(src);
          return;
        }

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
        updateMedia({ frames: raw.map((r, j) => ({ ...scored[j], t: r.t, thumb: r.thumb })) });
        const best = raw[scored.indexOf(scored.reduce((a, b) => (b.score > a.score ? b : a)))];
        await pickFrame(best.t);
      } catch (e) {
        setProgress(null);
        setError(e instanceof Error ? e.message : "Fichier illisible.");
      }
    },
    [enqueue, pickFrame],
  );

  // Au premier affichage : on rouvre la vidéo ou l'image de la dernière visite.
  useEffect(() => {
    const id = loadId.current;
    loadMedia()
      .then((m) => {
        if (m && id === loadId.current) handleFile(m.file, m);
      })
      .finally(() => setRestoring(false));
  }, [handleFile]);

  const hasFrames = frames.length > 0 || !!progress;
  const sorted = useMemo(() => [...frames].sort((a, b) => b.score - a.score), [frames]);
  const good = sorted.filter((f) => f.flags.length === 0);
  const rejected = sorted.filter((f) => f.flags.length > 0);
  const visible = showRejected ? sorted : good;

  async function exportImage(type: "image/jpeg" | "image/png") {
    await Promise.all(lines.flatMap((l) => (l.font ? [loadGoogleFont(l.font.family, l.font.weight, l.font.italic)] : [])));
    await document.fonts.ready;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    render(c.getContext("2d")!, scene, fonts);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.93));
    if (!blob) return;

    // Vignette pour l'historique.
    const thumb = document.createElement("canvas");
    thumb.width = 216;
    thumb.height = 384;
    thumb.getContext("2d")!.drawImage(c, 0, 0, thumb.width, thumb.height);
    const item: HistoryItem = {
      id: uid(),
      date: Date.now(),
      thumb: thumb.toDataURL("image/jpeg", 0.7),
      kitId: kit.id,
      templateId: template.id,
      align: effectiveAlign,
      palette,
      lines: cleanLines(lines),
    };
    setHistory((hs) => [item, ...hs].slice(0, HISTORY_MAX));
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
      sourceToBlob(img).then((b) => updateMedia({ cleaned: b }));
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

  // ——— Souris dans l'aperçu : glisser une ligne (verticalement) ou recadrer l'image ———
  // La ligne sous le pointeur (la dernière dessinée l'emporte si elles se chevauchent).
  function textHit(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const y = ((e.clientY - r.top) * H) / r.height;
    return linePositions(ctx, scene, fonts).findLast((l) => y >= l.top - 8 && y <= l.top + l.p.h + 8) ?? null;
  }

  function resetLinePositions() {
    setLines((ls) => ls.map((l) => ({ ...l, dy: 0 })));
  }

  // Éditeur de templates : la zone de texte sous le pointeur (déplacer ou tirer un bord).
  function zoneHit(e: React.PointerEvent<HTMLCanvasElement>): ZoneMode | null {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) * W) / r.width;
    const y = ((e.clientY - r.top) * H) / r.height;
    const z = zoneRect(template);
    if (y < z.y || y > z.y + z.h || x < z.x - 30 || x > z.x + z.w + 30) return null;
    if (Math.abs(x - z.x) < 30) return "left";
    if (Math.abs(x - (z.x + z.w)) < 30) return "right";
    return "move";
  }

  function gridHitAt(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!showGrid) return false;
    const r = e.currentTarget.getBoundingClientRect();
    return gridHit(gridTop, ((e.clientY - r.top) * H) / r.height);
  }

  function insideGrid(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!showGrid) return false;
    const r = e.currentTarget.getBoundingClientRect();
    const y = ((e.clientY - r.top) * H) / r.height;
    return y >= gridTop && y <= gridTop + GRID_H;
  }

  function cancelHold() {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (editingMask) {
      e.currentTarget.setPointerCapture(e.pointerId);
      lastPaint.current = null;
      paint(e);
      return;
    }
    if (editingTemplate) {
      const mode = zoneHit(e);
      if (mode) {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { kind: "zone", mode, x: e.clientX, y: e.clientY, t: template };
        return;
      }
    }
    if (gridHitAt(e)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { kind: "grid", y: e.clientY, top: gridTop };
      return;
    }
    if (insideGrid(e)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const h = { x: e.clientX, y: e.clientY, top: gridTop };
      hold.current = {
        ...h,
        timer: window.setTimeout(() => {
          hold.current = null;
          drag.current = { kind: "grid", y: h.y, top: h.top };
          setHoldingGrid(true);
        }, 300),
      };
    }
    const hit = textHit(e);
    if (hit) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { kind: "line", index: hit.p.index, y: e.clientY, dy: hit.dy, min: hit.min, max: hit.max };
      return;
    }
    if (!source) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "image", x: e.clientX, y: e.clientY, crop };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (editingMask) {
      if (e.buttons) paint(e);
      return;
    }
    // Le pointeur bouge avant la fin du clic maintenu : c'est un glisser normal (texte ou image).
    if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 6) cancelHold();
    const d = drag.current;
    if (hold.current) return;
    if (!d) {
      setOverZone(editingTemplate ? zoneHit(e) : null);
      setOverGrid(gridHitAt(e));
      setOverText(!editingTemplate && !!textHit(e));
      return;
    }
    const scale = W / e.currentTarget.clientWidth;
    if (d.kind === "grid") {
      let top = d.top + (e.clientY - d.y) * scale;
      if (Math.abs(top - SAFE.gridTop) < 30) top = SAFE.gridTop; // aimant sur le recadrage centré
      setGridTop(clampGridTop(top));
      return;
    }
    if (d.kind === "zone") {
      const dx = Math.round((e.clientX - d.x) * scale);
      const dy = Math.round((e.clientY - d.y) * scale);
      const t = d.t;
      if (d.mode === "move") {
        updateTemplate({ ...t, x: Math.max(0, Math.min(W - t.width, t.x + dx)), anchorY: Math.max(0, Math.min(H, t.anchorY + dy)) });
      } else if (d.mode === "left") {
        const x = Math.max(0, Math.min(t.x + t.width - 200, t.x + dx));
        updateTemplate({ ...t, x, width: t.x + t.width - x });
      } else {
        updateTemplate({ ...t, width: Math.max(200, Math.min(W - t.x, t.width + dx)) });
      }
      return;
    }
    if (d.kind === "line") {
      let dy = d.dy + (e.clientY - d.y) * scale;
      if (Math.abs(dy) < 30) dy = 0; // aimant sur la position prévue par le template
      updateLine(d.index, { dy: Math.max(d.min, Math.min(d.max, dy)) });
      return;
    }
    setCrop(clampCrop(source, { ...d.crop, offX: d.crop.offX + (e.clientX - d.x) * scale, offY: d.crop.offY + (e.clientY - d.y) * scale }));
  }
  function setZoom(zoom: number) {
    setCrop((c) => clampCrop(source, { ...c, zoom }));
  }

  const fileInput = (
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
  );
  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
  };

  // ——— Accueil : un seul geste, apporter une vidéo ou une image ———
  if (!started) {
    return (
      <main className="flex h-screen items-center justify-center px-6" {...dropHandlers}>
        {fileInput}
        {!restoring && (
          <div className="flex w-full max-w-md flex-col items-center text-center">
            <h1 className="mb-2 text-2xl font-semibold tracking-tight">Miniamaker</h1>
            <p className="mb-8 text-sm text-white/50">Des miniatures 9:16 à partir de ta vidéo, en quelques clics.</p>
            <button
              onClick={() => inputRef.current?.click()}
              className={`flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-6 py-14 transition ${
                dragOver ? "border-white/60 bg-white/10" : "border-white/20 hover:border-white/40 hover:bg-white/5"
              }`}
            >
              <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl leading-none text-black">+</span>
              <span className="text-base font-medium">Importer une vidéo ou une image</span>
              <span className="text-xs text-white/45">ou glisse un fichier ici</span>
            </button>
            {error && <p className="mt-4 w-full rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden" {...dropHandlers}>
      {fileInput}
      {/* ——— Panneau de contrôle ——— */}
      <aside ref={panelRef} className="w-[420px] shrink-0 overflow-y-auto border-r border-white/10 bg-[#111114] px-6 py-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Miniamaker</h1>
          <span className="text-xs text-white/40">9:16</span>
        </div>

        {/* Kit de marque actif */}
        <div className="mb-7 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
          <span className="pl-1.5 text-[11px] uppercase tracking-wider text-white/35">Kit</span>
          <select
            value={kit.id}
            onChange={(e) => selectKit(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm font-medium outline-none"
          >
            {kits.map((k) => (
              <option key={k.id} value={k.id} className="bg-neutral-900">
                {k.name}
              </option>
            ))}
          </select>
          <IconBtn title="Nouveau kit (copie de celui-ci)" onClick={newKit}>
            +
          </IconBtn>
          <IconBtn title="Renommer le kit" onClick={renameKit}>
            ✎
          </IconBtn>
          {kits.length > 1 && (
            <IconBtn title="Supprimer le kit" onClick={deleteKit}>
              ×
            </IconBtn>
          )}
        </div>

        {/* Étapes */}
        <div className="mb-6 flex rounded-xl bg-white/5 p-1 text-xs">
          {[
            { id: "image" as const, label: hasFrames ? "1 · Choisir l'image" : "1 · Image" },
            { id: "design" as const, label: "2 · Texte et style" },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPhase(p.id)}
              disabled={p.id === "design" && !source}
              className={`flex-1 rounded-lg py-2 font-medium transition disabled:opacity-30 ${
                phase === p.id ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {phase === "image" && (
          <>
            <div className="mb-7 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-white/70" title={fileName}>
                {fileName}
              </span>
              <button onClick={() => inputRef.current?.click()} className="shrink-0 text-xs text-white/50 hover:text-white">
                Changer
              </button>
            </div>

            {hasFrames && (
              <Section n={1} title="Choisir l'image">
                <div className="mb-3 flex items-center justify-between text-xs text-white/50">
                  <span className="flex items-center gap-2">
                    {progress && <IOSSpinner className="h-3.5 w-3.5" />}
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
              <Section n={hasFrames ? 2 : 1} title="Sous-titres incrustés">
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
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-50"
                      >
                        {cleaning && <IOSSpinner className="h-3.5 w-3.5" />}
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
                      <button onClick={() => {
                        setCleaned(null);
                        updateMedia({ cleaned: null });
                      }} className="text-xs text-white/50 hover:text-white">
                        Image d&apos;origine
                      </button>
                    )}
                  </div>
                )}
                {cleanError && <p className="mt-2 text-xs text-red-300">{cleanError}</p>}
              </Section>
            )}

            <button
              onClick={() => setPhase("design")}
              disabled={!source || !!editingMask}
              className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-30"
            >
              Continuer · texte et style
            </button>
          </>
        )}

        {phase === "design" && (
          <>
            <Section n={1} title="Concept">
              <div className="flex flex-wrap gap-1.5">
                {kit.concepts.map((c) => (
                  <span key={c.id} className="group relative">
                    <button
                      onClick={() => applyConcept(c)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        c.id === conceptId ? "border-white bg-white text-black" : "border-white/10 text-white/70 hover:border-white/30 hover:text-white"
                      }`}
                    >
                      {c.name}
                    </button>
                    <button
                      onClick={() => deleteConcept(c)}
                      title="Supprimer le concept"
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-[10px] leading-none text-white group-hover:flex"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  onClick={saveConcept}
                  title="Enregistre le texte, les styles et le template actuels comme concept du kit"
                  className="rounded-full border border-dashed border-white/20 px-3 py-1.5 text-xs text-white/50 hover:border-white/40 hover:text-white"
                >
                  + Enregistrer l&apos;actuel
                </button>
              </div>
              <p className="mt-2 text-xs text-white/40">Applique une structure de texte et un template. Ton texte est conservé.</p>
            </Section>

            <Section n={2} title="Texte">
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <input
                      value={line.text}
                      onChange={(e) => updateLine(i, { text: e.target.value })}
                      placeholder={line.hint ?? "Texte de la ligne"}
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
                        onClick={() => {
                          setLines((ls) => ls.filter((_, j) => j !== i));
                          setFontLine(null);
                        }}
                        title="Supprimer la ligne"
                        className="ml-1 px-1 text-sm text-white/35 hover:text-white"
                      >
                        ×
                      </button>
                    </div>
                    <LineFont
                      line={line}
                      templateFont={FONT_ROLE_NAME[template.styles[line.style].font]}
                      open={fontLine === i}
                      onToggle={() => setFontLine(fontLine === i ? null : i)}
                      onChange={(font) => updateLine(i, { font })}
                    />
                    {fontLine === i && (
                      <FontPicker
                        value={line.font}
                        templateFont={FONT_ROLE_NAME[template.styles[line.style].font]}
                        templateWeight={template.styles[line.style].weight}
                        onChange={(font) => {
                          updateLine(i, { font });
                          setFontLine(null);
                        }}
                      />
                    )}
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

            <Section n={3} title="Style">
              <div className="mb-2 grid grid-cols-2 gap-2">
                {kit.templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    title={t.description}
                    className={`truncate rounded-lg border px-2 py-2.5 text-xs transition ${
                      t.id === template.id ? "border-white bg-white text-black" : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              {editingTemplate ? (
                <div className="mb-4">
                  <TemplateEditor
                    template={template}
                    onChange={updateTemplate}
                    onDuplicate={duplicateTemplate}
                    onDelete={kit.templates.length > 1 ? deleteTemplate : null}
                    onClose={() => setEditingTemplate(false)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingTemplate(true)}
                  className="mb-4 w-full rounded-lg border border-white/10 py-2 text-xs text-white/60 hover:border-white/30 hover:text-white"
                >
                  Modifier le template « {template.name} »
                </button>
              )}

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

              <div className="mb-4 flex flex-wrap items-center gap-2">
                {kit.colors.map((p) => (
                  <span key={p.id} className="group relative">
                    <button
                      onClick={() => setPalette(p)}
                      title={p.name}
                      className={`block h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-[#111114] transition ${
                        palette.id === p.id ? "ring-white" : "ring-transparent"
                      }`}
                      style={{ background: p.accent }}
                    />
                    {kit.colors.length > 1 && (
                      <button
                        onClick={() => deleteColor(p)}
                        title="Retirer la couleur du kit"
                        className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-[10px] leading-none text-white group-hover:flex"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                <ColorAdder onAdd={addColor} />
              </div>

              <div className="space-y-2">
                <Toggle label="Détourer la personne (texte derrière)" on={depth} set={setDepth} />
                {segmenting && (
                  <p className="flex items-center gap-2 text-xs text-white/45">
                    <IOSSpinner className="h-3.5 w-3.5" />
                    Détourage en cours…
                  </p>
                )}
                {depth && segError && <p className="text-xs text-red-300">{segError}</p>}
                <Toggle label="Dégradé derrière le texte" on={shade} set={setShade} />
                <Toggle label="Booster l'image (contraste, couleurs)" on={boost} set={setBoost} />
              </div>
            </Section>

            <Section n={4} title="Cadrage">
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
                <button
                  className="text-xs text-white/50 hover:text-white"
                  onClick={() => {
                    setCrop(NO_CROP);
                    resetLinePositions();
                  }}
                >
                  Réinitialiser
                </button>
              </div>
              <p className="mt-1.5 text-xs text-white/40">
                Dans l&apos;aperçu : glisse une ligne de texte pour la monter ou la descendre, glisse l&apos;image pour la recadrer.
              </p>
            </Section>

            {history.length > 0 && (
              <Section n={5} title="Dernières minis">
                <div className="grid grid-cols-4 gap-2">
                  {history.map((h) => (
                    <span key={h.id} className="group relative">
                      <button
                        onClick={() => restoreFromHistory(h)}
                        title={`Reprendre ce texte et ces réglages · ${new Date(h.date).toLocaleString("fr-FR")}`}
                        className="block aspect-[9/16] w-full overflow-hidden rounded-lg ring-2 ring-transparent transition hover:ring-white/40"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={h.thumb} alt="" className="h-full w-full object-cover" />
                      </button>
                      <button
                        onClick={() => setHistory((hs) => hs.filter((x) => x.id !== h.id))}
                        title="Retirer de l'historique"
                        className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-[10px] leading-none text-white group-hover:flex"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-white/40">Clique sur une mini pour reprendre son texte et ses réglages (pas l&apos;image).</p>
              </Section>
            )}
          </>
        )}
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
              cancelHold();
              setHoldingGrid(false);
              drag.current = null;
              lastPaint.current = null;
            }}
            onWheel={(e) => source && setZoom(Math.max(1, Math.min(2.5, crop.zoom - e.deltaY * 0.002)))}
            style={{ width: stage.w, height: stage.h }}
            onPointerLeave={() => {
              setOverText(false);
              setOverZone(null);
              setOverGrid(false);
            }}
            className={`rounded-2xl shadow-2xl shadow-black/60 ${
              editingMask
                ? "cursor-crosshair"
                : holdingGrid
                  ? "cursor-grabbing"
                    : overZone === "move"
                    ? "cursor-move"
                    : overZone
                      ? "cursor-ew-resize"
                      : overGrid || overText
                        ? "cursor-ns-resize"
                        : source
                          ? "cursor-grab active:cursor-grabbing"
                          : ""
            }`}
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

// Police de la ligne : celle du template, ou une Google Font avec sa graisse et l'italique.
function LineFont({
  line,
  templateFont,
  open,
  onToggle,
  onChange,
}: {
  line: Line;
  templateFont: string;
  open: boolean;
  onToggle: () => void;
  onChange: (font: Line["font"]) => void;
}) {
  const gf = line.font && GOOGLE_FONTS.find((f) => f.f === line.font!.family);
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button
        onClick={onToggle}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition ${
          open ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
        }`}
      >
        <span className="text-white/40">Aa</span>
        <span className="truncate" style={line.font ? { fontFamily: `"${line.font.family}", system-ui` } : undefined}>
          {line.font ? line.font.family : `Police du template · ${templateFont}`}
        </span>
      </button>
      {line.font && gf && (
        <>
          <select
            value={line.font.weight}
            onChange={(e) => onChange({ ...line.font!, weight: +e.target.value })}
            title="Graisse"
            className="rounded-md bg-white/5 px-1 py-1 text-xs outline-none"
          >
            {gf.w.map((w) => (
              <option key={w} value={w} className="bg-neutral-900">
                {w}
              </option>
            ))}
          </select>
          {gf.i && (
            <button
              onClick={() => onChange({ ...line.font!, italic: !line.font!.italic })}
              title="Italique"
              className={`rounded-md px-2 py-1 text-xs italic ${line.font.italic ? "bg-white/20" : "bg-white/5 text-white/50"}`}
            >
              I
            </button>
          )}
        </>
      )}
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="h-7 w-7 shrink-0 rounded-md text-sm text-white/50 hover:bg-white/10 hover:text-white">
      {children}
    </button>
  );
}

// Ajoute une couleur au kit : on choisit dans le sélecteur, elle est ajoutée quand on le valide
// (événement natif « change », pas l'« input » continu que React appelle onChange).
function ColorAdder({ onAdd }: { onAdd: (hex: string) => void }) {
  const [value, setValue] = useState("#FF5CC8");
  const ref = useRef<HTMLInputElement>(null);
  const addRef = useRef(onAdd);
  addRef.current = onAdd;
  useEffect(() => {
    const el = ref.current;
    const commit = () => el && addRef.current(el.value);
    el?.addEventListener("change", commit);
    return () => el?.removeEventListener("change", commit);
  }, []);
  return (
    <label
      title="Ajouter une couleur au kit"
      className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-white/30 text-sm text-white/60 hover:border-white/60"
    >
      +
      <input ref={ref} type="color" className="absolute inset-0 opacity-0" value={value} onChange={(e) => setValue(e.target.value)} />
    </label>
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
  return <StretchSwitch checked={on} onChange={set} label={<span className="text-sm font-normal text-white/80">{label}</span>} />;
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
