// Construit l'app de bureau : export statique de Next, puis installeurs electron-builder.
// Les arguments sont passés à electron-builder (ex. `--mac`, `--win`, `--dir`).
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

run("next build", { DESKTOP: "1" });
// Les rushes de test de public/sources n'ont rien à faire dans l'installeur.
rmSync("out/sources", { recursive: true, force: true });
run(`electron-builder ${process.argv.slice(2).join(" ")}`);
