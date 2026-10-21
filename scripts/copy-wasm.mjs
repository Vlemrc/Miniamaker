// Copie les fichiers wasm (MediaPipe, onnxruntime) dans public/ pour les servir en local.
import { cpSync, mkdirSync, readdirSync } from "node:fs";

cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe", { recursive: true });

mkdirSync("public/ort", { recursive: true });
for (const f of readdirSync("node_modules/onnxruntime-web/dist")) {
  if (/^ort-wasm-simd-threaded\.(jsep\.)?(wasm|mjs)$/.test(f)) cpSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
}
