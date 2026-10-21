import type { FaceLandmarker } from "@mediapipe/tasks-vision";

const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type Analysis = {
  sharpness: number;
  faces: number;
  blink: number | null; // 0 = yeux grands ouverts, 1 = fermés
  jaw: number | null; // ouverture de la bouche
};

export type Flag = "closed" | "mouth" | "blurry" | "noface";

export type Scored = Analysis & { score: number; flags: Flag[] };

let landmarker: Promise<FaceLandmarker | null> | null = null;

// Chargé une seule fois. Si ça échoue (hors ligne…), on trie seulement sur la netteté.
function getLandmarker() {
  landmarker ??= (async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
      const create = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: "IMAGE",
          numFaces: 2,
          outputFaceBlendshapes: true,
        });
      return await create("GPU").catch(() => create("CPU"));
    } catch (e) {
      console.warn("Détection de visage indisponible", e);
      return null;
    }
  })();
  return landmarker;
}

export function preloadDetector() {
  void getLandmarker();
}

// Variance du Laplacien sur une version réduite en niveaux de gris : plus c'est haut, plus c'est net.
function sharpness(src: HTMLCanvasElement) {
  const w = 192;
  const h = Math.round((w * src.height) / src.width);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      sum += l;
      sum2 += l * l;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

export async function analyze(c: HTMLCanvasElement): Promise<Analysis> {
  const sharp = sharpness(c);
  const lm = await getLandmarker();
  if (!lm) return { sharpness: sharp, faces: 0, blink: null, jaw: null };
  const res = lm.detect(c);
  const shapes = res.faceBlendshapes?.[0]?.categories;
  if (!shapes) return { sharpness: sharp, faces: res.faceLandmarks.length, blink: null, jaw: null };
  const get = (name: string) => shapes.find((s) => s.categoryName === name)?.score ?? 0;
  return {
    sharpness: sharp,
    faces: res.faceLandmarks.length,
    blink: Math.max(get("eyeBlinkLeft"), get("eyeBlinkRight")),
    jaw: get("jawOpen"),
  };
}

// Note chaque image relativement aux autres de la même vidéo.
export function rank(items: Analysis[]): Scored[] {
  // Comparé à la médiane (et non au max) : une seule image très détaillée,
  // comme un carton titre, ne doit pas faire passer toutes les autres pour floues.
  const sorted = items.map((a) => a.sharpness).sort((a, b) => a - b);
  const median = Math.max(sorted[Math.floor(sorted.length / 2)], 1e-6);
  const anyFace = items.some((a) => a.faces > 0);
  return items.map((a) => {
    const sharp = Math.min(1, a.sharpness / (median * 1.5));
    const flags: Flag[] = [];
    if (a.blink !== null && a.blink > 0.45) flags.push("closed");
    if (a.jaw !== null && a.jaw > 0.4) flags.push("mouth");
    if (a.sharpness < median * 0.5) flags.push("blurry");
    if (anyFace && a.faces === 0) flags.push("noface");
    const eyes = a.blink === null ? 0.6 : 1 - a.blink;
    const mouth = a.jaw === null ? 0.8 : 1 - Math.min(a.jaw, 1);
    const score = 0.4 * eyes + 0.2 * mouth + 0.4 * sharp - flags.length * 0.25;
    return { ...a, score, flags };
  });
}

export const FLAG_LABEL: Record<Flag, string> = {
  closed: "Yeux fermés",
  mouth: "Bouche ouverte",
  blurry: "Flou",
  noface: "Pas de visage",
};
