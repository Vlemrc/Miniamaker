import type { Source } from "./render";

const THUMB_W = 360;

export async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error("Ce navigateur ne sait pas lire cette vidéo (format HEVC ?). Essaie sous Safari ou exporte-la en H.264."));
  });
  if (!v.videoWidth || !Number.isFinite(v.duration)) throw new Error("Vidéo illisible.");
  return v;
}

function seek(v: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve) => {
    if (Math.abs(v.currentTime - t) < 0.001) return resolve();
    v.addEventListener("seeked", () => resolve(), { once: true });
    v.currentTime = t;
  });
}

export function frameTimes(duration: number, count: number) {
  // On évite les tout premiers et derniers instants (fondus, mains sur le téléphone…).
  return Array.from({ length: count }, (_, i) => duration * (0.03 + (0.94 * i) / (count - 1)));
}

// Capture une petite image pour la grille et l'analyse.
export async function grabThumb(v: HTMLVideoElement, t: number) {
  await seek(v, t);
  const c = document.createElement("canvas");
  c.width = THUMB_W;
  c.height = Math.round((THUMB_W * v.videoHeight) / v.videoWidth);
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return c;
}

// Capture l'image en pleine résolution une fois choisie.
export async function grabFull(v: HTMLVideoElement, t: number): Promise<Source> {
  await seek(v, t);
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d")!.drawImage(v, 0, 0);
  return { el: c, w: c.width, h: c.height };
}

export async function loadImage(file: File): Promise<Source> {
  const bmp = await createImageBitmap(file);
  return { el: bmp, w: bmp.width, h: bmp.height };
}
