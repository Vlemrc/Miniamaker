import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import type { Source } from "./render";

const MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

let segmenter: Promise<ImageSegmenter> | null = null;
const cache = new WeakMap<object, Promise<Source>>();

function getSegmenter() {
  segmenter ??= (async () => {
    const { ImageSegmenter, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
    const create = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    return create("GPU").catch(() => create("CPU"));
  })();
  segmenter.catch(() => (segmenter = null));
  return segmenter;
}

// Détoure la personne : renvoie l'image avec un fond transparent, à la même taille que la source.
export function cutout(src: Source): Promise<Source> {
  let p = cache.get(src.el as object);
  if (!p) {
    p = run(src);
    cache.set(src.el as object, p);
    p.catch(() => cache.delete(src.el as object));
  }
  return p;
}

async function run(src: Source): Promise<Source> {
  const seg = await getSegmenter();
  // Le modèle travaille en 256 px : inutile de lui donner du 4K.
  const scale = Math.min(1, 1024 / Math.max(src.w, src.h));
  const input = document.createElement("canvas");
  input.width = Math.round(src.w * scale);
  input.height = Math.round(src.h * scale);
  input.getContext("2d")!.drawImage(src.el, 0, 0, input.width, input.height);

  const res = seg.segment(input);
  const bg = res.confidenceMasks![0]; // catégorie 0 = arrière-plan
  const conf = bg.getAsFloat32Array();
  const mask = document.createElement("canvas");
  mask.width = bg.width;
  mask.height = bg.height;
  const mctx = mask.getContext("2d")!;
  const data = mctx.createImageData(bg.width, bg.height);
  for (let i = 0; i < conf.length; i++) {
    // Courbe un peu raide pour des bords nets sans halo.
    const a = Math.min(1, Math.max(0, (1 - conf[i] - 0.3) / 0.4));
    data.data[i * 4 + 3] = a * 255;
  }
  mctx.putImageData(data, 0, 0);
  res.close();

  const out = document.createElement("canvas");
  out.width = src.w;
  out.height = src.h;
  const ctx = out.getContext("2d")!;
  ctx.filter = `blur(${Math.max(1, src.w / 900)}px)`;
  ctx.drawImage(mask, 0, 0, src.w, src.h);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-in";
  ctx.drawImage(src.el, 0, 0);
  return { el: out, w: src.w, h: src.h };
}
