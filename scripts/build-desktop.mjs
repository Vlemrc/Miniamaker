// Construit l'app de bureau : export statique de Next dans `out/`, puis installeurs electron-builder.
// Les arguments sont passés à electron-builder (ex. `--mac`, `--win`, `--dir`) ; `--run` ouvre
// plutôt l'app dans Electron, sans rien empaqueter.
import { execSync } from "node:child_process";
import { renameSync, rmSync } from "node:fs";
import path from "node:path";

// node_modules/.bin dans le PATH : le script marche aussi lancé directement, hors `npm run`.
const PATH = [path.resolve("node_modules/.bin"), process.env.PATH].join(path.delimiter);
const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, PATH, ...env } });
const args = process.argv.slice(2);

run("next build", { DESKTOP: "1" });
rmSync("out", { recursive: true, force: true });
renameSync(".next-desktop", "out");
// Les rushes de test de public/sources n'ont rien à faire dans l'installeur.
rmSync("out/sources", { recursive: true, force: true });

if (args.includes("--run")) run("electron .");
else run(`electron-builder ${args.join(" ")}`);
