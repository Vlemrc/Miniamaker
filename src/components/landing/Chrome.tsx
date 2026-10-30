import Link from "next/link";

// En-tête et pied de page communs à la landing et à la page de téléchargement.

export function Logo() {
  return (
    <Link href="/" className="focus-ring flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-white">
      <span className="grid h-7 w-[18px] place-items-end rounded-[4px] bg-white/90 p-[3px]">
        <span className="h-1 w-full rounded-[1px] bg-[#4D8DFF]" />
      </span>
      Miniamaker
    </Link>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0b0b0d]/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1 text-sm text-white/60">
          <Link href="/#fonctions" className="focus-ring hidden rounded-md px-3 py-1.5 hover:text-white sm:block">
            Fonctions
          </Link>
          <Link href="/#faq" className="focus-ring hidden rounded-md px-3 py-1.5 hover:text-white sm:block">
            FAQ
          </Link>
          <Link href="/app" className="focus-ring hidden rounded-md px-3 py-1.5 hover:text-white sm:block">
            Essayer en ligne
          </Link>
          <Link
            href="/download"
            className="focus-ring ml-1 rounded-full bg-white px-4 py-1.5 font-medium text-black transition hover:bg-white/85"
          >
            Télécharger
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <Logo />
          <p>Des miniatures verticales en série, toujours dans le même style.</p>
        </div>
        <div className="flex gap-5">
          <Link href="/download" className="focus-ring rounded hover:text-white">
            Télécharger
          </Link>
          <Link href="/app" className="focus-ring rounded hover:text-white">
            Essayer en ligne
          </Link>
          <Link href="/#faq" className="focus-ring rounded hover:text-white">
            FAQ
          </Link>
        </div>
      </div>
    </footer>
  );
}
