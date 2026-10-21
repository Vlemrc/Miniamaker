import type { InferenceSession } from "onnxruntime-web";
import type { Source } from "./render";

// Effacement des sous-titres incrustés :
// 1. détection automatique → masque (modifiable au pinceau dans l'éditeur) ;
// 2. reconstruction de la zone masquée avec MI-GAN (modèle d'inpainting, ~28 Mo, exécuté dans le navigateur).

const MODEL = "https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx";

// ——— Masque ———

// Le masque est un canvas à la taille de la source : pixel opaque = zone à effacer.
export function emptyMask(src: Source) {
  const c = document.createElement("canvas");
  c.width = src.w;
  c.height = src.h;
  return c;
}

// Dilatation binaire carrée (séparable, via sommes cumulées).
function dilate(m: Uint8Array, w: number, h: number, rx: number, ry: number) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const row = new Int32Array(w + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x + 1] = row[x] + m[y * w + x];
    for (let x = 0; x < w; x++) tmp[y * w + x] = row[Math.min(w, x + rx + 1)] - row[Math.max(0, x - rx)] > 0 ? 1 : 0;
  }
  const col = new Int32Array(h + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y + 1] = col[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) out[y * w + x] = col[Math.min(h, y + ry + 1)] - col[Math.max(0, y - ry)] > 0 ? 1 : 0;
  }
  return out;
}

// Composantes connexes (4-voisinage) : renvoie les étiquettes et le nombre de composantes.
function label(m: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || labels[i]) continue;
    n++;
    let top = 0;
    stack[top++] = i;
    labels[i] = n;
    while (top) {
      const p = stack[--top];
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q >= 0 && q < w * h && m[q] && !labels[q]) {
          labels[q] = n;
          stack[top++] = q;
        }
      }
    }
  }
  return { labels, n };
}

// Repère le texte blanc cerné de sombre (contour / ombre des sous-titres) et regroupe par ligne.
export function detectSubtitles(src: Source): HTMLCanvasElement {
  const w = src.w;
  const h = src.h;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src.el, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;

  const white = new Uint8Array(w * h);
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    white[i] = l > 205 && sat < 45 ? 1 : 0;
    dark[i] = l < 90 ? 1 : 0;
  }
  const u = Math.max(1, Math.round(w / 1080)); // unité ~1 px pour une image 1080 de large
  const nearDark = dilate(dark, w, h, 6 * u, 6 * u);
  const cand = new Uint8Array(w * h);
  const yMin = Math.floor(h * 0.2); // les sous-titres ne sont jamais tout en haut
  for (let i = yMin * w; i < w * h; i++) cand[i] = white[i] & nearDark[i];

  // Regroupe les lettres d'une même ligne, puis filtre ce qui ne ressemble pas à une ligne de texte.
  const { labels, n } = label(dilate(cand, w, h, 25 * u, 6 * u), w, h);
  const box = Array.from({ length: n + 1 }, () => ({ x0: w, y0: h, x1: 0, y1: 0, count: 0 }));
  for (let i = 0; i < w * h; i++) {
    const k = labels[i];
    if (!k) continue;
    const b = box[k];
    const x = i % w;
    const y = (i - x) / w;
    if (x < b.x0) b.x0 = x;
    if (x > b.x1) b.x1 = x;
    if (y < b.y0) b.y0 = y;
    if (y > b.y1) b.y1 = y;
    if (cand[i]) b.count++;
  }
  const keep = box.map((b) => {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    return bh > h * 0.012 && bh < h * 0.12 && bw > w * 0.04 && b.count / (bw * bh) > 0.04;
  });
  const text = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) text[i] = cand[i] && keep[labels[i]] ? 1 : 0;

  // Sous-titres sur bandeau blanc : on prend tout le blanc relié au texte détecté
  // (sauf les grandes zones blanches, type chemise ou mur).
  const whites = label(white, w, h);
  const size = new Int32Array(whites.n + 1);
  const touched = new Uint8Array(whites.n + 1);
  for (let i = 0; i < w * h; i++) {
    const k = whites.labels[i];
    if (!k) continue;
    size[k]++;
    if (text[i]) touched[k] = 1;
  }
  for (let i = 0; i < w * h; i++) {
    const k = whites.labels[i];
    if (k && touched[k] && size[k] < w * h * 0.08) text[i] = 1;
  }

  // On élargit pour couvrir le contour et l'ombre portée.
  const hole = dilate(text, w, h, 10 * u, 10 * u);
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    if (!hole[i]) continue;
    out.data[i * 4] = 255;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

// ——— Reconstruction ———

let session: Promise<InferenceSession> | null = null;

async function loadModel() {
  // Le modèle est gardé en cache navigateur après le premier téléchargement.
  const cache = await caches.open("miniamaker-models").catch(() => null);
  let res = await cache?.match(MODEL);
  if (!res) {
    res = await fetch(MODEL);
    if (!res.ok) throw new Error("Téléchargement du modèle impossible.");
    await cache?.put(MODEL, res.clone());
  }
  return res.arrayBuffer();
}

function getSession() {
  session ??= (async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = "/ort/";
    return ort.InferenceSession.create(await loadModel(), { executionProviders: ["wasm"] });
  })();
  session.catch(() => (session = null));
  return session;
}

export function preloadInpainting() {
  void getSession().catch(() => undefined);
}

export async function inpaint(src: Source, mask: HTMLCanvasElement): Promise<Source> {
  const [sess, ort] = await Promise.all([getSession(), import("onnxruntime-web")]);
  const { w, h } = src;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src.el, 0, 0);
  const rgba = ctx.getImageData(0, 0, w, h);

  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  const ma = mctx.getImageData(0, 0, w, h).data;
  const hole = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) hole[i] = ma[i * 4 + 3] > 127 ? 1 : 0;

  // Une passe par ligne de sous-titres : le modèle travaille en 512 px autour de la zone,
  // donc des petites zones séparées gardent plus de détail qu'une seule grande.
  const u = Math.max(1, Math.round(w / 1080));
  const { labels, n } = label(dilate(hole, w, h, 40 * u, 12 * u), w, h);

  let image = new Uint8Array(3 * w * h);
  for (let i = 0; i < w * h; i++) {
    image[i] = rgba.data[i * 4];
    image[w * h + i] = rgba.data[i * 4 + 1];
    image[2 * w * h + i] = rgba.data[i * 4 + 2];
  }
  const [imgName, maskName] = sess.inputNames.some((x) => /mask/i.test(x))
    ? [sess.inputNames.find((x) => !/mask/i.test(x))!, sess.inputNames.find((x) => /mask/i.test(x))!]
    : [sess.inputNames[0], sess.inputNames[1]];

  for (let k = 1; k <= n; k++) {
    const m = new Uint8Array(w * h);
    let any = false;
    for (let i = 0; i < w * h; i++) {
      const isHole = hole[i] === 1 && labels[i] === k;
      m[i] = isHole ? 0 : 255; // MI-GAN : 255 = à garder, 0 = à reconstruire
      any ||= isHole;
    }
    if (!any) continue;
    const out = await sess.run({
      [imgName]: new ort.Tensor("uint8", image, [1, 3, h, w]),
      [maskName]: new ort.Tensor("uint8", m, [1, 1, h, w]),
    });
    image = new Uint8Array((out[sess.outputNames[0]].data as Uint8Array).slice());
  }

  for (let i = 0; i < w * h; i++) {
    rgba.data[i * 4] = image[i];
    rgba.data[i * 4 + 1] = image[w * h + i];
    rgba.data[i * 4 + 2] = image[2 * w * h + i];
  }
  ctx.putImageData(rgba, 0, 0);
  return { el: c, w, h };
}
