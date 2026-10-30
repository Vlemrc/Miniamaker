// Processus principal de l'app de bureau : une fenêtre qui affiche l'éditeur exporté par Next (`out/`).
// Les fichiers sont servis par un protocole `app://` plutôt qu'en file:// : les chemins absolus
// (/_next, /ort, /mediapipe) marchent tels quels, et localStorage, IndexedDB et le cache des
// modèles ont une origine stable d'une version à l'autre.
const { app, BrowserWindow, net, protocol, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const SCHEME = "app";
const HOST = "miniamaker";
const ORIGIN = `${SCHEME}://${HOST}`;
const ROOT = path.join(__dirname, "..", "out");

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// `/app/` → out/app/index.html ; un fichier introuvable renvoie la 404 de Next.
function resolve(urlPath) {
  const file = path.normalize(path.join(ROOT, decodeURIComponent(urlPath)));
  if (!file.startsWith(ROOT)) return null;
  for (const candidate of [file, path.join(file, "index.html"), `${file}.html`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "Miniamaker",
    backgroundColor: "#0b0b0d",
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  win.once("ready-to-show", () => win.show());

  // Les liens externes s'ouvrent dans le navigateur ; un fichier lâché à côté de la zone
  // d'import ne doit pas remplacer l'éditeur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(ORIGIN)) return;
    event.preventDefault();
    if (url.startsWith("http")) shell.openExternal(url);
  });

  win.loadURL(`${ORIGIN}/app/`);
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, (request) => {
    const file = resolve(new URL(request.url).pathname);
    if (!file) return net.fetch(pathToFileURL(path.join(ROOT, "404.html")).toString());
    return net.fetch(pathToFileURL(file).toString());
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
