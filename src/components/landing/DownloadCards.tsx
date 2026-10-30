"use client";

import Link from "next/link";
import { DOWNLOADS, downloadUrl, type Platform } from "@/lib/site";
import { AppleIcon, WindowsIcon, usePlatform } from "@/components/landing/DownloadButtons";

const ICON: Record<Platform, typeof AppleIcon> = { mac: AppleIcon, windows: WindowsIcon };

const INSTALL: Record<Platform, string> = {
  mac: "Ouvrez le .dmg, puis glissez Miniamaker dans le dossier Applications.",
  windows: "Lancez l'installeur, Miniamaker s'ouvre à la fin de l'installation.",
};

// Les deux plateformes côte à côte, celle du visiteur en premier et mise en avant.
export function DownloadCards() {
  const platform = usePlatform();
  const order: Platform[] = platform === "mac" ? ["mac", "windows"] : ["windows", "mac"];

  return (
    <div className="mx-auto mt-14 max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-2">
        {order.map((p, i) => {
          const d = DOWNLOADS[p];
          const Icon = ICON[p];
          const primary = i === 0;
          return (
            <div
              key={p}
              className={`flex flex-col rounded-3xl p-7 ring-1 ${
                primary ? "bg-white/[0.06] ring-white/15" : "bg-white/[0.02] ring-white/[0.07]"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-8 w-8 text-white" />
                {primary && <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70">Votre système</span>}
              </div>
              <h2 className="mt-8 text-2xl font-semibold tracking-tight">{d.name}</h2>
              <p className="mt-1 text-sm text-white/45">{d.requirements}</p>
              <p className="mt-5 flex-1 text-sm leading-relaxed text-white/55">{INSTALL[p]}</p>
              <a
                href={downloadUrl(p)}
                className={`focus-ring mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-medium transition ${
                  primary ? "bg-white text-black hover:bg-white/85" : "bg-white/[0.06] text-white ring-1 ring-white/10 hover:bg-white/10"
                }`}
              >
                Télécharger {d.format}
              </a>
            </div>
          );
        })}
      </div>
      <p className="mt-10 text-center text-sm text-white/45">
        Pas envie d&apos;installer ?{" "}
        <Link href="/app" className="focus-ring rounded text-white underline-offset-4 hover:underline">
          Essayez dans le navigateur
        </Link>
        .
      </p>
    </div>
  );
}
