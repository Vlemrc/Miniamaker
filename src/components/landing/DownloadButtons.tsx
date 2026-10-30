"use client";

import { useEffect, useState } from "react";
import { DOWNLOADS, downloadUrl, type Platform } from "@/lib/site";

// Devine le système du visiteur pour mettre le bon installeur en avant (Mac par défaut).
function detectPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = `${nav.userAgentData?.platform ?? ""} ${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  return p.includes("win") ? "windows" : "mac";
}

export function usePlatform() {
  const [platform, setPlatform] = useState<Platform>("mac");
  useEffect(() => setPlatform(detectPlatform()), []);
  return platform;
}

export function AppleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.84c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.67 1.37-.58.67-1.09 1.76-.95 2.8 1.01.08 2.05-.52 2.68-1.28z" />
    </svg>
  );
}

export function WindowsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M3 5.5 10.4 4.5v7H3v-6zm0 13 7.4 1v-7H3v6zm8.3 1.1L21 21v-8.5h-9.7v7.1zm0-15.2v7.1H21V3l-9.7 1.4z" />
    </svg>
  );
}

const ICON: Record<Platform, typeof AppleIcon> = { mac: AppleIcon, windows: WindowsIcon };

export function DownloadButton({ platform, primary = true }: { platform: Platform; primary?: boolean }) {
  const Icon = ICON[platform];
  return (
    <a
      href={downloadUrl(platform)}
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-medium transition ${
        primary ? "bg-white text-black hover:bg-white/85" : "bg-white/[0.06] text-white ring-1 ring-white/10 hover:bg-white/10"
      }`}
    >
      <Icon />
      Télécharger pour {DOWNLOADS[platform].name}
    </a>
  );
}

// Bouton principal pour le système détecté, lien discret vers l'autre.
export function SmartDownload() {
  const platform = usePlatform();
  const other: Platform = platform === "mac" ? "windows" : "mac";
  return (
    <div className="flex flex-col items-center gap-3">
      <DownloadButton platform={platform} />
      <a href={downloadUrl(other)} className="focus-ring rounded text-sm text-white/45 hover:text-white">
        Aussi pour {DOWNLOADS[other].name}
      </a>
    </div>
  );
}
