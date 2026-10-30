import type { Metadata } from "next";
import { Footer, Nav } from "@/components/landing/Chrome";
import { DownloadCards } from "@/components/landing/DownloadCards";
import { interTight } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Télécharger Miniamaker",
  description: "Miniamaker pour macOS et Windows.",
};

export default function DownloadPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#0b0b0d] text-white">
      <Nav />
      <main className="flex-1 px-4 pt-20 pb-28 sm:px-6 sm:pt-28">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className={`${interTight.className} text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold leading-[0.98] tracking-[-0.045em]`}>
            Télécharger Miniamaker
          </h1>
          <p className="mt-5 text-lg text-white/55">Sans compte. Vos vidéos restent sur votre ordinateur.</p>
        </div>
        <DownloadCards />
      </main>
      <Footer />
    </div>
  );
}
