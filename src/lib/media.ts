import type { Source } from "./render";
import type { Scored } from "./scoring";

// Le média en cours (vidéo ou image, frames analysées, image nettoyée) est trop lourd pour
// localStorage : on le garde dans IndexedDB pour le retrouver après un rechargement.

export type SavedFrame = Scored & { t: number; thumb: string };

export type SavedMedia = {
  file: File;
  frames: SavedFrame[];
  pickedT: number | null;
  cleaned: Blob | null;
};

const DB = "miniamaker";
const STORE = "media";
const KEY = "current";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export async function loadMedia(): Promise<SavedMedia | null> {
  try {
    return (await run<SavedMedia | undefined>("readonly", (s) => s.get(KEY))) ?? null;
  } catch (e) {
    console.warn("Lecture du média impossible", e);
    return null;
  }
}

// Les écritures sont enchaînées pour qu'une mise à jour partielle ne passe pas avant le fichier.
let chain: Promise<unknown> = Promise.resolve();

export function saveMedia(media: SavedMedia) {
  chain = chain.then(() => run("readwrite", (s) => s.put(media, KEY))).catch((e) => console.warn("Sauvegarde du média impossible", e));
}

export function updateMedia(patch: Partial<Omit<SavedMedia, "file">>) {
  chain = chain
    .then(async () => {
      const current = await run<SavedMedia | undefined>("readonly", (s) => s.get(KEY));
      if (current) await run("readwrite", (s) => s.put({ ...current, ...patch }, KEY));
    })
    .catch((e) => console.warn("Sauvegarde du média impossible", e));
}

export async function sourceToBlob(src: Source): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = src.w;
  c.height = src.h;
  c.getContext("2d")!.drawImage(src.el, 0, 0);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

export async function blobToSource(blob: Blob): Promise<Source> {
  const bmp = await createImageBitmap(blob);
  return { el: bmp, w: bmp.width, h: bmp.height };
}
