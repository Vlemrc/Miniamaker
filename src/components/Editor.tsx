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
import { detectSubtitles, emptyMask, inpaint, maskCoverage, preloadInpainting } from "@/lib/subtitles";
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
  // « Sans sous-titres » : dès qu'une image est choisie, les sous-titres sont repérés et l'image
  // nettoyée est préparée en arrière-plan, pour que l'interrupteur réponde tout de suite.
  const [wantClean, setWantClean] = useState(false);
  const [auto, setAuto] = useState<{ of: Source; mask: HTMLCanvasElement; img: Source | null; empty: boolean } | null>(null);
  const inpaintQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [advanced, setAdvanced] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const lineRefs = useRef<(HTMLInputElement | null)[]>([]);

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
  // Pendant le choix de l'image, l'aperçu montre l'image seule : le texte vient à l'étape suivante.
  const preview: Scene = useMemo(() => (phase === "image" ? { ...scene, lines: [], shade: false } : scene), [phase, scene]);
  const gridShown = showGrid && phase === "design";

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
    render(ctx, preview, fonts);
    if (gridShown) drawGridOverlay(ctx, gridTop);
    if (editingTemplate && phase === "design") drawZoneOverlay(ctx, template);
  }, [started, preview, gridShown, gridTop, fonts, fontsReady, editingMask, source, crop, maskTick, fontsTick, editingTemplate, template, phase]);

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
        if (!saved?.cleaned || id !== loadId.current) return;
        setCleaned({ of: src, img: await blobToSource(saved.cleaned) });
        setWantClean(true);
      };
      preloadInpainting();

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
  useEffect(() => {
    if (!source) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      const mask = detectSubtitles(source);
      const empty = maskCoverage(mask) < 0.0005;
      setAuto({ of: source, mask, img: null, empty });
      if (empty) return;
      // Une reconstruction à la fois : on peut cliquer plusieurs images d'affilée.
      const job = inpaintQueue.current.then(() => (alive ? inpaint(source, mask) : null));
      inpaintQueue.current = job.catch(() => undefined);
      job.then(
        (img) => img && alive && setAuto((a) => (a?.of === source ? { ...a, img } : a)),
        (e) => {
          console.warn(e);
          if (alive) setCleanError("Effacement impossible (modèle non chargé, connexion ?).");
        },
      );
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [source]);

  // Interrupteur allumé : l'image nettoyée remplace l'originale dès qu'elle est prête.
  useEffect(() => {
    if (!wantClean || !source || cleaned?.of === source || auto?.of !== source || !auto.img) return;
    setCleaned({ of: source, img: auto.img });
    sourceToBlob(auto.img).then((b) => updateMedia({ cleaned: b }));
  }, [wantClean, source, auto, cleaned]);

  const noSubtitles = !!source && auto?.of === source && auto.empty;
  const cleanPending = wantClean && !!source && cleaned?.of !== source && !noSubtitles && !cleanError;

  function toggleClean(on: boolean) {
    setWantClean(on);
    setCleanError("");
    if (!on) {
      setCleaned(null);
      updateMedia({ cleaned: null });
    }
  }

  // Retouche au pinceau, à partir de ce qui a été repéré automatiquement.
  function startRetouch() {
    if (!source) return;
    setCleanError("");
    preloadInpainting();
    const canvas = emptyMask(source);
    canvas.getContext("2d")!.drawImage(auto?.of === source ? auto.mask : detectSubtitles(source), 0, 0);
    setMaskEdit({ of: source, canvas });
  }

  async function runCleaning() {
    if (!source || !editingMask) return;
    setCleaning(true);
    setCleanError("");
    try {
      const img = await inpaint(source, editingMask);
      setAuto({ of: source, mask: editingMask, img, empty: false });
      setCleaned({ of: source, img });
      setWantClean(true);
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
    return linePositions(ctx, preview, fonts).findLast((l) => y >= l.top - 8 && y <= l.top + l.p.h + 8) ?? null;
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
    if (!gridShown) return false;
    const r = e.currentTarget.getBoundingClientRect();
    return gridHit(gridTop, ((e.clientY - r.top) * H) / r.height);
  }

  function insideGrid(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!gridShown) return false;
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

  const historyGrid = (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
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
            className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-xs leading-none text-white group-hover:flex"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );

  // ——— Étape 1 : un seul geste, apporter une vidéo ou une image ———
  if (!started) {
    return (
      <main className="flex h-screen flex-col items-center overflow-y-auto px-6 py-16" {...dropHandlers}>
        {fileInput}
        {!restoring && (
          <div className="my-auto flex w-full max-w-xl flex-col items-center text-center">
            <h1 className="mb-2 text-3xl font-semibold tracking-tight">Miniamaker</h1>
            <p className="mb-10 text-base text-white/55">Des miniatures 9:16 à partir de ta vidéo, en quelques clics.</p>
            <button
              onClick={() => inputRef.current?.click()}
              className={`flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-6 py-16 transition ${
                dragOver ? "border-white/60 bg-white/10" : "border-white/20 hover:border-white/40 hover:bg-white/5"
              }`}
            >
              <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl leading-none text-black">+</span>
              <span className="text-lg font-medium">Importer une vidéo ou une image</span>
              <span className="text-sm text-white/45">ou glisse un fichier ici</span>
            </button>
            {error && <p className="mt-4 w-full rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
            {history.length > 0 && (
              <div className="mt-14 w-full text-left">
                <p className="mb-3 text-sm text-white/50">Dernières minis · clique pour reprendre leur texte et leur style</p>
                {historyGrid}
              </div>
            )}
          </div>
        )}
      </main>
    );
  }

  const steps = [
    { id: "video" as const, label: "Vidéo", done: true },
    { id: "image" as const, label: "Image", done: phase === "design" },
    { id: "design" as const, label: "Texte", done: false },
  ];

  return (
    <main className="flex h-screen flex-col overflow-hidden" {...dropHandlers}>
      {fileInput}

      {/* ——— Barre du haut : étapes, kit du client, export ——— */}
      <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-white/10 bg-[#0e0e11] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-base font-semibold tracking-tight">Miniamaker</span>
          <button
            onClick={() => inputRef.current?.click()}
            title="Changer de vidéo"
            className="min-w-0 truncate rounded-md px-2 py-1 text-sm text-white/45 hover:bg-white/5 hover:text-white"
          >
            {fileName}
          </button>
        </div>

        <nav className="flex items-center gap-1 rounded-full bg-white/5 p-1 text-sm">
          {steps.map((s, i) => {
            const active = s.id === phase;
            return (
              <button
                key={s.id}
                onClick={() => (s.id === "video" ? inputRef.current?.click() : setPhase(s.id))}
                disabled={(s.id === "design" && !source) || !!editingMask}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition disabled:opacity-40 ${
                  active ? "bg-white text-black" : "text-white/60 hover:text-white"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    active ? "bg-black text-white" : s.done ? "bg-white/20 text-white" : "bg-white/10"
                  }`}
                >
                  {s.done && !active ? "✓" : i + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] py-1 pl-3 pr-1">
            <span className="text-xs uppercase tracking-wider text-white/35">Kit</span>
            <select
              value={kit.id}
              onChange={(e) => selectKit(e.target.value)}
              className="max-w-40 rounded-md bg-transparent px-1 py-1 text-sm font-medium outline-none"
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
          {phase === "design" && (
            <>
              <button
                onClick={() => exportImage("image/png")}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium hover:bg-white/5"
              >
                PNG
              </button>
              <button
                onClick={() => exportImage("image/jpeg")}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
                Exporter en JPG
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ——— Gauche : la grille d'images (étape 2) ou le texte (étape 3) ——— */}
        {phase === "image" ? (
          <section ref={panelRef} className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
            {hasFrames ? (
              <>
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Choisis l&apos;image</h2>
                    <p className="mt-1 flex items-center gap-2 text-sm text-white/50">
                      {progress && <IOSSpinner className="h-4 w-4" />}
                      {progress
                        ? `Analyse de la vidéo… ${progress.done}/${progress.total}`
                        : `Les meilleures en premier · ${rejected.length} écartée${rejected.length > 1 ? "s" : ""} (floues, yeux fermés…)`}
                    </p>
                  </div>
                  {rejected.length > 0 && (
                    <button
                      className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/60 hover:border-white/30 hover:text-white"
                      onClick={() => setShowRejected((s) => !s)}
                    >
                      {showRejected ? "Masquer les écartées" : "Voir les écartées"}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                  {visible.map((f, i) => (
                    <button
                      key={f.t}
                      onClick={() => pickFrame(f.t)}
                      title={`${f.t.toFixed(1)} s`}
                      className={`relative aspect-[9/16] overflow-hidden rounded-xl ring-[3px] transition ${
                        pickedT === f.t ? "ring-white" : "ring-transparent hover:ring-white/40"
                      } ${f.flags.length ? "opacity-60" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.thumb} alt="" className="h-full w-full object-cover" />
                      {i === 0 && !f.flags.length && !progress && (
                        <span className="absolute left-2 top-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-black">Meilleure</span>
                      )}
                      {f.flags.length > 0 && (
                        <span className="absolute inset-x-2 bottom-2 truncate rounded-md bg-black/75 px-1.5 py-1 text-xs leading-tight text-red-300">
                          {FLAG_LABEL[f.flags[0]]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <h2 className="text-xl font-semibold tracking-tight">C&apos;est une image</h2>
                <p className="mt-2 max-w-sm text-sm text-white/50">Rien à choisir : enlève les sous-titres si besoin, puis passe au texte.</p>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
                >
                  Importer une vidéo à la place
                </button>
              </div>
            )}
          </section>
        ) : (
          <aside ref={panelRef} className="w-[380px] shrink-0 overflow-y-auto border-r border-white/10 bg-[#111114] px-6 py-7">
            <Group title="Quel genre de mini ?">
              <div className="flex flex-wrap gap-2">
                {kit.concepts.map((c) => (
                  <span key={c.id} className="group relative">
                    <button
                      onClick={() => applyConcept(c)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                        c.id === conceptId ? "border-white bg-white text-black" : "border-white/10 text-white/75 hover:border-white/30 hover:text-white"
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
              </div>
            </Group>

            <Group title="Ton texte">
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div key={i} className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 focus-within:border-white/30">
                    <input
                      ref={(el) => {
                        lineRefs.current[i] = el;
                      }}
                      value={line.text}
                      onChange={(e) => updateLine(i, { text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || lines.length >= 5) return;
                        e.preventDefault();
                        setLines((ls) => [...ls.slice(0, i + 1), { text: "", style: "normal", accent: false }, ...ls.slice(i + 1)]);
                        setTimeout(() => lineRefs.current[i + 1]?.focus());
                      }}
                      placeholder={line.hint ?? "Une ligne de texte"}
                      className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-white/30"
                    />
                    <button
                      onClick={() => updateLine(i, { accent: !line.accent })}
                      title={line.accent ? "Ligne en couleur (cliquer pour la mettre en blanc)" : "Mettre la ligne en couleur"}
                      className={`h-5 w-5 shrink-0 rounded-full ring-1 ring-white/30 transition ${line.accent ? "" : "opacity-40 hover:opacity-80"}`}
                      style={{ background: line.accent ? palette.accent : "#FFFFFF" }}
                    />
                    <button
                      onClick={() => {
                        setLines((ls) => ls.filter((_, j) => j !== i));
                        setFontLine(null);
                      }}
                      title="Supprimer la ligne"
                      className="shrink-0 text-lg leading-none text-white/0 transition group-hover:text-white/40 hover:!text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {lines.length < 5 && (
                <button
                  onClick={() => {
                    setLines((ls) => [...ls, { text: "", style: "normal", accent: false }]);
                    setTimeout(() => lineRefs.current[lines.length]?.focus());
                  }}
                  className="mt-2 w-full rounded-xl border border-dashed border-white/15 py-2 text-sm text-white/50 hover:border-white/30 hover:text-white"
                >
                  + Ajouter une ligne
                </button>
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-white/40">
                Une ligne ici = une ligne sur la mini. Pour colorer un seul mot, entoure-le d&apos;astérisques :{" "}
                <code className="text-white/65">*entreprise*</code>
              </p>
            </Group>

            {history.length > 0 && (
              <div className="border-t border-white/10 pt-5">
                <button
                  onClick={() => setShowHistory((s) => !s)}
                  className="flex w-full items-center justify-between text-sm text-white/55 hover:text-white"
                >
                  Reprendre une mini précédente
                  <span className={`transition-transform ${showHistory ? "rotate-180" : ""}`}>⌄</span>
                </button>
                {showHistory && <div className="mt-3">{historyGrid}</div>}
              </div>
            )}
          </aside>
        )}

        {/* ——— Aperçu ——— */}
        <section
          className={`relative flex min-w-0 flex-col items-center px-8 py-6 ${
            phase === "image" ? "w-[40%] max-w-[560px] shrink-0 border-l border-white/10 bg-[#0e0e11]" : "flex-1"
          }`}
        >
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

          {phase === "image" ? (
            <div className="mt-5 w-full max-w-[420px] shrink-0">
              {editingMask ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="mb-3 text-sm text-white/60">En rouge : ce qui sera effacé. Peins dans l&apos;aperçu pour corriger.</p>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex rounded-lg bg-white/5 p-1 text-sm">
                      {[
                        { erase: false, label: "Ajouter" },
                        { erase: true, label: "Gommer" },
                      ].map((m) => (
                        <button
                          key={m.label}
                          onClick={() => setBrush((b) => ({ ...b, erase: m.erase }))}
                          className={`rounded-md px-3 py-1 transition ${brush.erase === m.erase ? "bg-white/15" : "text-white/50 hover:text-white"}`}
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
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50"
                    >
                      {cleaning && <IOSSpinner className="h-4 w-4" />}
                      {cleaning ? "Effacement…" : "Effacer"}
                    </button>
                    <button
                      onClick={() => source && setMaskEdit({ of: source, canvas: emptyMask(source) })}
                      className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5"
                    >
                      Vider
                    </button>
                    <button onClick={() => setMaskEdit(null)} className="rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="min-w-0">
                    <StretchSwitch
                      checked={wantClean}
                      onChange={toggleClean}
                      disabled={!source}
                      label={<span className="text-[15px] font-medium text-white">Sans sous-titres</span>}
                    />
                    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/45">
                      {cleanPending && <IOSSpinner className="h-3.5 w-3.5" />}
                      {cleanError
                        ? <span className="text-red-300">{cleanError}</span>
                        : cleanPending
                          ? "Effacement…"
                          : noSubtitles
                            ? "Aucun sous-titre repéré sur cette image"
                            : wantClean
                              ? "Sous-titres effacés"
                              : "Repérés et prêts à être effacés"}
                    </p>
                  </div>
                  <button onClick={startRetouch} disabled={!source} className="shrink-0 text-sm text-white/55 hover:text-white disabled:opacity-40">
                    {noSubtitles ? "Effacer à la main" : "Retoucher"}
                  </button>
                </div>
              )}
              <button
                onClick={() => setPhase("design")}
                disabled={!source || !!editingMask}
                className="mt-3 w-full rounded-xl bg-white py-3 text-[15px] font-semibold text-black transition hover:bg-white/90 disabled:opacity-30"
              >
                Écrire le texte →
              </button>
            </div>
          ) : (
            <p className="mt-4 shrink-0 text-[13px] text-white/40">
              Glisse une ligne pour la déplacer · glisse l&apos;image pour la recadrer · molette pour zoomer
            </p>
          )}

          {dragOver && (
            <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-3xl border-2 border-dashed border-white/50 bg-black/60 text-lg font-medium">
              Dépose ta vidéo ou ton image
            </div>
          )}
        </section>

        {/* ——— Droite (étape 3) : la forme ——— */}
        {phase === "design" && (
          <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-white/10 bg-[#111114] px-6 py-7">
            <Group title="Style">
              <div className="grid grid-cols-3 gap-2.5">
                {kit.templates.map((t) => (
                  <TemplateThumb
                    key={t.id}
                    name={t.name}
                    title={t.description}
                    active={t.id === template.id}
                    onClick={() => selectTemplate(t)}
                    fonts={fonts}
                    ready={fontsReady}
                    fontsTick={fontsTick}
                    scene={{
                      ...scene,
                      template: t,
                      align: t.aligns.includes(align) ? align : t.aligns[0],
                      subject: t.subjectInFront ? (subject?.of === shown ? subject.cut : null) : null,
                      lines: scene.lines.map((l) => ({ ...l, dy: 0 })),
                    }}
                  />
                ))}
              </div>
              {template.aligns.length > 1 && (
                <div className="mt-3 flex rounded-lg bg-white/5 p-1">
                  {template.aligns.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAlign(a)}
                      className={`flex-1 rounded-md py-1.5 text-sm transition ${a === effectiveAlign ? "bg-white/15" : "text-white/50 hover:text-white"}`}
                    >
                      {ALIGN_LABEL[a]}
                    </button>
                  ))}
                </div>
              )}
            </Group>

            <Group title="Couleur">
              <div className="flex flex-wrap items-center gap-2.5">
                {kit.colors.map((p) => (
                  <span key={p.id} className="group relative">
                    <button
                      onClick={() => setPalette(p)}
                      title={p.name}
                      className={`block h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-[#111114] transition ${
                        palette.id === p.id ? "ring-white" : "ring-transparent hover:ring-white/30"
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
            </Group>

            <Group title="Effets">
              <div className="space-y-3">
                <Toggle label="Texte derrière la personne" on={depth} set={setDepth} />
                {segmenting && (
                  <p className="flex items-center gap-2 text-[13px] text-white/45">
                    <IOSSpinner className="h-3.5 w-3.5" />
                    Détourage en cours…
                  </p>
                )}
                {depth && segError && <p className="text-[13px] text-red-300">{segError}</p>}
                <Toggle label="Dégradé derrière le texte" on={shade} set={setShade} />
              </div>
            </Group>

            <div className="border-t border-white/10 pt-5">
              <button
                onClick={() => setAdvanced((a) => !a)}
                className="flex w-full items-center justify-between text-sm text-white/55 hover:text-white"
              >
                Réglages avancés
                <span className={`transition-transform ${advanced ? "rotate-180" : ""}`}>⌄</span>
              </button>

              {advanced && (
                <div className="mt-5 space-y-7">
                  <div className="space-y-3">
                    <Toggle label="Booster l'image (contraste, couleurs)" on={boost} set={setBoost} />
                    <Toggle label="Repère de la grille du profil (3:4)" on={showGrid} set={setShowGrid} />
                  </div>

                  <div>
                    <p className="mb-2 text-[13px] text-white/50">Zoom de l&apos;image</p>
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
                        className="text-[13px] text-white/50 hover:text-white"
                        onClick={() => {
                          setCrop(NO_CROP);
                          resetLinePositions();
                        }}
                      >
                        Réinitialiser
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[13px] text-white/50">Style et police de chaque ligne</p>
                    <div className="space-y-2">
                      {lines.map((line, i) => (
                        <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-[13px] text-white/70">{line.text || line.hint || `Ligne ${i + 1}`}</span>
                            <select
                              value={line.style}
                              onChange={(e) => updateLine(i, { style: e.target.value as LineStyle })}
                              className="rounded-md bg-white/5 px-1.5 py-1 text-[13px] outline-none"
                            >
                              {(Object.keys(LINE_STYLE_LABEL) as LineStyle[]).map((st) => (
                                <option key={st} value={st} className="bg-neutral-900">
                                  {LINE_STYLE_LABEL[st]}
                                </option>
                              ))}
                            </select>
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
                  </div>

                  <div>
                    {editingTemplate ? (
                      <TemplateEditor
                        template={template}
                        onChange={updateTemplate}
                        onDuplicate={duplicateTemplate}
                        onDelete={kit.templates.length > 1 ? deleteTemplate : null}
                        onClose={() => setEditingTemplate(false)}
                      />
                    ) : (
                      <button
                        onClick={() => setEditingTemplate(true)}
                        className="w-full rounded-lg border border-white/10 py-2 text-[13px] text-white/60 hover:border-white/30 hover:text-white"
                      >
                        Modifier le style « {template.name} » du kit
                      </button>
                    )}
                    <button
                      onClick={saveConcept}
                      title="Enregistre le texte, les styles et le template actuels comme concept du kit"
                      className="mt-2 w-full rounded-lg border border-dashed border-white/15 py-2 text-[13px] text-white/50 hover:border-white/30 hover:text-white"
                    >
                      Enregistrer comme nouveau genre de mini
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

// Vignette d'un style : la mini en cours, rendue avec ce template (petit format, redessinée après coup).
function TemplateThumb({
  name,
  title,
  active,
  onClick,
  scene,
  fonts,
  ready,
  fontsTick,
}: {
  name: string;
  title: string;
  active: boolean;
  onClick: () => void;
  scene: Scene;
  fonts: Fonts;
  ready: boolean;
  fontsTick: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !ready) return;
    const id = setTimeout(() => {
      const ctx = c.getContext("2d")!;
      ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
      render(ctx, scene, fonts);
    }, 150);
    return () => clearTimeout(id);
  }, [scene, fonts, ready, fontsTick]);
  return (
    <button onClick={onClick} title={title} className="group text-left">
      <canvas
        ref={ref}
        width={216}
        height={384}
        className={`aspect-[9/16] w-full rounded-lg bg-white/5 ring-2 transition ${active ? "ring-white" : "ring-transparent group-hover:ring-white/30"}`}
      />
      <span className={`mt-1.5 block truncate text-[13px] ${active ? "text-white" : "text-white/50"}`}>{name}</span>
    </button>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return <StretchSwitch checked={on} onChange={set} label={<span className="text-sm font-normal text-white/80">{label}</span>} />;
}
