import { H, SAFE, W, contrastOn, type Align, type FontRole, type Line, type Palette, type Template, type Typo } from "./templates";

export type Source = { el: CanvasImageSource; w: number; h: number };
export type Crop = { zoom: number; offX: number; offY: number };
export type Fonts = Record<FontRole, string>;

export type Scene = {
  source: Source | null;
  subject: Source | null; // personne détourée, redessinée par-dessus le texte
  crop: Crop;
  template: Template;
  palette: Palette;
  align: Align;
  lines: Line[];
  shade: boolean;
  boost: boolean;
};

type Word = { text: string; hl: boolean; w: number };
type Placed = { index: number; line: Line; typo: Typo; size: number; words: Word[]; space: number; w: number; h: number; pad: number };

// ——— Image ———

function coverRect(src: Source, crop: Crop) {
  const s = Math.max(W / src.w, H / src.h) * crop.zoom;
  const dw = src.w * s;
  const dh = src.h * s;
  return { dw, dh, maxX: (dw - W) / 2, maxY: (dh - H) / 2 };
}

// Empêche de laisser des bords vides en déplaçant l'image.
export function clampCrop(src: Source | null, crop: Crop): Crop {
  if (!src) return crop;
  const { maxX, maxY } = coverRect(src, crop);
  return {
    zoom: crop.zoom,
    offX: Math.max(-maxX, Math.min(maxX, crop.offX)),
    offY: Math.max(-maxY, Math.min(maxY, crop.offY)),
  };
}

function drawSource(ctx: CanvasRenderingContext2D, src: Source | null, crop: Crop, boost: boolean, subject = false) {
  if (!src) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#3a3a44");
    g.addColorStop(1, "#15151a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const { dw, dh } = coverRect(src, crop);
  ctx.save();
  if (boost) ctx.filter = "contrast(1.08) saturate(1.18) brightness(1.03)";
  if (subject) {
    // Légère ombre autour de la personne pour la détacher du texte.
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 12;
  }
  ctx.drawImage(src.el, (W - dw) / 2 + crop.offX, (H - dh) / 2 + crop.offY, dw, dh);
  ctx.restore();
}

// Coordonnées canvas (1080 × 1920) → coordonnées dans l'image source, plus l'échelle appliquée.
export function toSourcePoint(src: Source, crop: Crop, x: number, y: number) {
  const { dw, dh } = coverRect(src, crop);
  const s = dw / src.w;
  return { x: (x - ((W - dw) / 2 + crop.offX)) / s, y: (y - ((H - dh) / 2 + crop.offY)) / s, scale: s };
}

// Mode retouche du masque : l'image seule, avec la zone à effacer en rouge.
export function renderMaskEditor(ctx: CanvasRenderingContext2D, src: Source, crop: Crop, mask: HTMLCanvasElement) {
  ctx.clearRect(0, 0, W, H);
  drawSource(ctx, src, crop, false);
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawSource(ctx, { el: mask, w: src.w, h: src.h }, crop, false);
  ctx.restore();
}

function drawShade(ctx: CanvasRenderingContext2D, t: Template) {
  const { from, size, opacity } = t.shade;
  const g = from === "bottom" ? ctx.createLinearGradient(0, H, 0, H - size) : ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, `rgba(0,0,0,${opacity})`);
  g.addColorStop(0.45, `rgba(0,0,0,${opacity * 0.55})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  if (from === "bottom") ctx.fillRect(0, H - size, W, size);
  else ctx.fillRect(0, 0, W, size);
}

// ——— Texte ———

function setFont(ctx: CanvasRenderingContext2D, t: Typo, size: number, fonts: Fonts) {
  const family = t.family ? `"${t.family}", ${fonts[t.font]}` : fonts[t.font];
  ctx.font = `${t.italic ? "italic " : ""}${t.weight} ${size}px ${family}`;
  ctx.letterSpacing = `${t.tracking * size}px`;
}

// « ton *entreprise* » → les mots entre * passent dans la couleur d'accent.
function parse(raw: string, uppercase: boolean) {
  const out: { text: string; hl: boolean }[] = [];
  raw.split("*").forEach((part, i) => {
    for (const word of part.split(/\s+/).filter(Boolean)) {
      out.push({ text: uppercase ? word.toLocaleUpperCase("fr") : word, hl: i % 2 === 1 });
    }
  });
  return out;
}

function measure(ctx: CanvasRenderingContext2D, line: Line, typo: Typo, size: number, fonts: Fonts) {
  setFont(ctx, typo, size, fonts);
  const words = parse(line.text, typo.uppercase).map((t) => ({ ...t, w: ctx.measureText(t.text).width }));
  const space = ctx.measureText(" ").width;
  const w = words.reduce((s, x) => s + x.w, 0) + space * Math.max(0, words.length - 1);
  return { words, space, w };
}

// Une ligne saisie = une ligne affichée. Chaque ligne prend sa taille de style,
// réduite si elle dépasse la largeur ; les lignes « Gros » s'agrandissent pour remplir la largeur.
function layout(ctx: CanvasRenderingContext2D, s: Scene, fonts: Fonts): Placed[] {
  const t = s.template;
  const placed: Placed[] = [];
  for (const [index, line] of s.lines.entries()) {
    if (!line.text.trim()) continue;
    const style = t.styles[line.style];
    // Police choisie sur la ligne : on garde la taille et la casse du style, pas l'interlettrage
    // (réglé pour la police du template).
    const typo: Typo = line.font ? { ...style, family: line.font.family, weight: line.font.weight, italic: line.font.italic, tracking: 0 } : style;
    const pad = line.style === "label" ? 0.5 : 0; // marge intérieure de l'étiquette, en em
    const ref = measure(ctx, line, typo, 100, fonts);
    const fitSize = t.width / (ref.w / 100 + pad * 2);
    const size = Math.min(typo.size, fitSize);
    placed.push({ index, line, typo, size, pad, ...measure(ctx, line, typo, size, fonts), h: size * typo.lineHeight });
  }
  // Trop haut au total : on réduit tout proportionnellement (sauf l'étiquette de tête, qui garde sa taille).
  const head = pinnedLabel(placed) ? placed[0].h : 0;
  const total = placed.reduce((sum, p) => sum + p.h, 0) - head;
  if (total > t.maxHeight - head) {
    const k = Math.max(0, t.maxHeight - head) / total;
    return placed.map((p, i) => (head && i === 0 ? p : { ...p, ...measure(ctx, p.line, p.typo, p.size * k, fonts), size: p.size * k, h: p.h * k }));
  }
  return placed;
}

// Une étiquette en première ligne annonce le format (« Avis tranché »…) : elle reste calée
// en haut de la zone de texte, quelle que soit la longueur du texte en dessous, pour que
// toutes les minis d'un même format l'aient à la même hauteur.
function pinnedLabel(placed: Placed[]) {
  return placed.length > 0 && placed[0].line.style === "label";
}

function lineX(t: Template, align: Align, w: number) {
  if (align === "center") return t.x + (t.width - w) / 2;
  if (align === "right") return t.x + t.width - w;
  return t.x;
}

function drawLine(ctx: CanvasRenderingContext2D, s: Scene, p: Placed, top: number, fonts: Fonts) {
  const { template: t, palette, align } = s;
  setFont(ctx, p.typo, p.size, fonts);
  ctx.textBaseline = "alphabetic";
  const ascent = ctx.measureText("H").actualBoundingBoxAscent;
  const padX = p.pad * p.size;
  let x = lineX(t, align, p.w + padX * 2);
  const baseline = top + (p.h + ascent) / 2;

  let color = p.line.accent ? palette.accent : palette.text;
  if (p.line.style === "label") {
    // Étiquette : pastille pleine (couleur d'accent ou blanche).
    const bg = p.line.accent ? palette.accent : "#FFFFFF";
    const pillH = p.h * 0.86;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, top + (p.h - pillH) / 2, p.w + padX * 2, pillH, pillH / 2);
    ctx.fill();
    color = contrastOn(bg);
    x += padX;
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = p.size * t.shadow;
    ctx.shadowOffsetY = p.size * 0.02;
  }
  for (const word of p.words) {
    ctx.fillStyle = word.hl && p.line.style !== "label" ? (p.line.accent ? palette.text : palette.accent) : color;
    ctx.fillText(word.text, x, baseline);
    x += word.w + p.space;
  }
  ctx.shadowColor = "transparent";
}

// ——— Rendu complet ———

// Position de chaque ligne : empilées selon l'ancrage du template, puis décalées une à une
// (glisser dans l'aperçu), sans jamais sortir de la bande visible dans la grille du profil.
export function linePositions(ctx: CanvasRenderingContext2D, s: Scene, fonts: Fonts) {
  const t = s.template;
  const placed = layout(ctx, s, fonts);
  const height = placed.reduce((sum, p) => sum + p.h, 0);
  let top = pinnedLabel(placed) ? zoneRect(t).y : t.anchor === "bottom" ? t.anchorY - height : t.anchor === "center" ? t.anchorY - height / 2 : t.anchorY;
  return placed.map((p) => {
    const base = top;
    top += p.h;
    const min = SAFE.gridTop + 20 - base;
    const max = Math.max(min, SAFE.gridBottom - 20 - p.h - base);
    const dy = Math.max(min, Math.min(max, p.line.dy ?? 0));
    return { p, top: base + dy, dy, min, max };
  });
}

export function render(ctx: CanvasRenderingContext2D, s: Scene, fonts: Fonts) {
  const t = s.template;
  ctx.clearRect(0, 0, W, H);
  drawSource(ctx, s.source, s.crop, s.boost);
  if (s.shade) drawShade(ctx, t);

  ctx.save();
  for (const { p, top } of linePositions(ctx, s, fonts)) drawLine(ctx, s, p, top, fonts);
  ctx.restore();

  if (s.subject) drawSource(ctx, s.subject, s.crop, s.boost, true);
}

// Repère affiché dans l'éditeur uniquement : la partie visible dans la grille du profil (recadrage 3:4).
export function drawGridOverlay(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, W, SAFE.gridTop);
  ctx.fillRect(0, SAFE.gridBottom, W, H - SAFE.gridBottom);
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, SAFE.gridTop, W - 3, SAFE.gridBottom - SAFE.gridTop);
  ctx.setLineDash([]);
  label(ctx, "Visible dans la grille du profil (3:4)", 24, SAFE.gridTop + 16);
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.letterSpacing = "0px";
  ctx.textBaseline = "top";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - 10, y - 6, w + 20, 44);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
}

// Zone de texte d'un template (rectangle où le bloc de texte peut s'étendre).
export function zoneRect(t: Template) {
  const top = t.anchor === "top" ? t.anchorY : t.anchor === "center" ? t.anchorY - t.maxHeight / 2 : t.anchorY - t.maxHeight;
  return { x: t.x, y: top, w: t.width, h: t.maxHeight };
}

// Repère de l'éditeur de templates : la zone, sa ligne d'ancrage et ses poignées.
export function drawZoneOverlay(ctx: CanvasRenderingContext2D, t: Template) {
  const z = zoneRect(t);
  ctx.save();
  ctx.fillStyle = "rgba(77,141,255,0.10)";
  ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = "rgba(77,141,255,0.95)";
  ctx.lineWidth = 3;
  ctx.strokeRect(z.x, z.y, z.w, z.h);
  ctx.setLineDash([]);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(z.x, t.anchorY);
  ctx.lineTo(z.x + z.w, t.anchorY);
  ctx.stroke();
  ctx.fillStyle = "rgba(77,141,255,1)";
  for (const hx of [z.x, z.x + z.w]) {
    ctx.beginPath();
    ctx.roundRect(hx - 9, z.y + z.h / 2 - 40, 18, 80, 9);
    ctx.fill();
  }
  ctx.restore();
}
