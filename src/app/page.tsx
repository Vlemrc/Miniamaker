import Link from "next/link";
import { Footer, Nav } from "@/components/landing/Chrome";
import { SmartDownload } from "@/components/landing/DownloadButtons";
import ThumbMock, { MOCKS } from "@/components/landing/ThumbMock";
import { instrumentSerif, interTight } from "@/lib/fonts";

const display = interTight.className;
const serif = instrumentSerif.className;

const STEPS = [
  { n: "01", title: "Importer", text: "Une vidéo ou une image, glissée dans la fenêtre." },
  { n: "02", title: "Choisir l'image", text: "24 captures de la vidéo, les floues et les yeux fermés en dernier." },
  { n: "03", title: "Écrire", text: "Le texte se place tout seul dans le template, à la bonne taille." },
  { n: "04", title: "Exporter", text: "Un clic : JPG ou PNG en 1080 × 1920, prêt à publier." },
];

const FEATURES = [
  {
    title: "Il choisit l'image pour vous",
    text: "Les captures sont triées par netteté et par détection de visage : yeux fermés et bouche ouverte passent à la fin.",
  },
  {
    title: "Sous-titres effacés",
    text: "Les sous-titres incrustés dans la vidéo sont repérés et l'image est reconstruite dessous. Un pinceau pour retoucher si besoin.",
  },
  {
    title: "Un kit par client",
    text: "Templates, couleurs et concepts enregistrés pour chaque client. On passe de l'un à l'autre sans rien refaire.",
  },
  {
    title: "Le titre passe derrière",
    text: "La personne est détourée automatiquement : le titre peut passer derrière sa tête, comme sur les comptes qui cartonnent.",
  },
  {
    title: "Pensé pour la grille",
    text: "Repères des zones TikTok et Reels, bande 3:4 du profil Instagram. Le titre s'ajuste pour ne jamais déborder.",
  },
  {
    title: "1 800 polices",
    text: "Chaque ligne peut prendre n'importe quelle Google Font, avec sa graisse et son italique.",
  },
];

const FAQ = [
  {
    q: "Sur quels systèmes ça marche ?",
    a: "Il y a une app pour macOS et une pour Windows. Le même outil tourne aussi dans le navigateur, sans rien installer.",
  },
  {
    q: "Mes vidéos sont-elles envoyées quelque part ?",
    a: "Non. L'analyse, l'effacement des sous-titres, le détourage et l'export se font sur votre machine. Seuls les modèles d'IA et les polices sont téléchargés.",
  },
  {
    q: "Faut-il une connexion internet ?",
    a: "Au premier usage, pour récupérer les modèles d'IA et les polices. Ensuite ils sont gardés en cache. Sans réseau, le tri des captures se fait seulement sur la netteté.",
  },
  {
    q: "Quels fichiers puis-je importer ?",
    a: "Les vidéos et les images courantes (MP4, MOV, JPG, PNG…). L'export se fait en JPG ou en PNG, en 1080 × 1920.",
  },
  {
    q: "Mes réglages sont-ils gardés ?",
    a: "Oui : les kits de marque, le brouillon en cours et les 24 dernières miniatures exportées restent sur votre ordinateur.",
  },
];

function SectionTitle({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">{kicker}</p>
      <h2 className={`${display} mt-3 text-[clamp(2rem,5vw,3.25rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white`}>
        {children}
      </h2>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b0b0d] text-white">
      <Nav />

      <main>
        {/* Accueil */}
        <section className="relative px-4 pt-20 pb-10 sm:px-6 sm:pt-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 mx-auto h-[520px] max-w-4xl opacity-60 blur-3xl"
            style={{ background: "radial-gradient(50% 50% at 50% 30%, rgba(77,141,255,0.25), transparent 70%)" }}
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-xs text-white/60 ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2BFF88]" />
              Reels · TikTok · Shorts
            </p>
            <h1 className={`${display} mt-6 text-[clamp(2.75rem,8vw,5.5rem)] font-extrabold leading-[0.95] tracking-[-0.045em]`}>
              Une mini en deux minutes.
              <br />
              <span className={`${serif} font-normal tracking-[-0.01em] text-[#4D8DFF] italic`}>Toujours dans votre style.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/60">
              Importez la vidéo, Miniamaker choisit la meilleure image, efface les sous-titres et pose votre titre dans le
              template du client. Il ne vous reste qu&apos;à exporter.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-start">
              <SmartDownload />
              <Link
                href="/app"
                className="focus-ring rounded-full px-5 py-3 text-[15px] font-medium text-white/80 ring-1 ring-white/10 transition hover:bg-white/[0.06] hover:text-white"
              >
                Essayer dans le navigateur
              </Link>
            </div>
          </div>

          {/* Éventail de miniatures */}
          <div className="relative mx-auto mt-16 flex h-[340px] max-w-5xl items-end justify-center sm:mt-20 sm:h-[520px]">
            {MOCKS.map((m, i) => {
              const offset = i - 2;
              return (
                <div
                  key={i}
                  className="absolute bottom-0 w-[150px] transition-transform duration-500 sm:w-[240px]"
                  style={{
                    transform: `translateX(${offset * 78}%) translateY(${Math.abs(offset) * 9}%) rotate(${offset * 5}deg)`,
                    zIndex: 10 - Math.abs(offset),
                  }}
                >
                  <ThumbMock mock={m} />
                </div>
              );
            })}
          </div>
        </section>

        {/* Étapes */}
        <section className="px-4 py-24 sm:px-6">
          <SectionTitle kicker="Le principe">
            La mise en page est verrouillée.
            <br />
            <span className="text-white/40">Vous changez juste le texte.</span>
          </SectionTitle>
          <ol className="mx-auto mt-14 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-white/[0.03] p-6 ring-1 ring-white/[0.07]">
                <span className="font-mono text-xs text-white/35">{s.n}</span>
                <h3 className="mt-6 text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Fonctions */}
        <section id="fonctions" className="scroll-mt-20 px-4 py-24 sm:px-6">
          <SectionTitle kicker="Fonctions">
            Le travail fastidieux,
            <br />
            <span className={`${serif} font-normal tracking-[-0.01em] italic`}>c&apos;est lui qui le fait.</span>
          </SectionTitle>
          <div className="mx-auto mt-14 grid max-w-5xl gap-px overflow-hidden rounded-2xl bg-white/[0.07] ring-1 ring-white/[0.07] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-[#0e0e11] p-7">
                <h3 className="text-[17px] font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Un style par client */}
        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-5xl items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">Kits de marque</p>
              <h2 className={`${display} mt-3 text-[clamp(2rem,5vw,3.25rem)] font-extrabold leading-[1.02] tracking-[-0.035em]`}>
                Une patte reconnaissable, client après client.
              </h2>
              <p className="mt-5 max-w-md leading-relaxed text-white/55">
                Les marges, les typos et l&apos;emplacement du texte ne bougent pas. Chaque client garde ses couleurs et ses
                templates, et votre équipe sort des minis cohérentes sans y passer l&apos;après-midi.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[MOCKS[0], MOCKS[3], MOCKS[1]].map((m, i) => (
                <ThumbMock key={i} mock={m} className={i === 1 ? "translate-y-6" : ""} />
              ))}
            </div>
          </div>
        </section>

        {/* Local et privé */}
        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-5xl rounded-3xl bg-gradient-to-b from-white/[0.05] to-transparent p-8 ring-1 ring-white/[0.07] sm:p-14">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">Local et privé</p>
            <h2 className={`${display} mt-3 max-w-2xl text-[clamp(2rem,5vw,3.25rem)] font-extrabold leading-[1.02] tracking-[-0.035em]`}>
              Vos rushes ne quittent pas votre ordinateur.
            </h2>
            <div className="mt-10 grid gap-8 text-sm leading-relaxed text-white/55 sm:grid-cols-3">
              <p>
                <span className="block font-medium text-white">Aucun envoi</span>
                L&apos;analyse des images, l&apos;effacement des sous-titres et le détourage tournent sur votre machine.
              </p>
              <p>
                <span className="block font-medium text-white">Pas de compte</span>
                On télécharge, on ouvre, on fait sa première mini. Rien à créer avant.
              </p>
              <p>
                <span className="block font-medium text-white">Rien à attendre</span>
                Pas de file d&apos;attente sur un serveur : le résultat s&apos;affiche dès qu&apos;on change un réglage.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 px-4 py-24 sm:px-6">
          <SectionTitle kicker="FAQ">Les questions qu&apos;on nous pose</SectionTitle>
          <div className="mx-auto mt-12 max-w-2xl divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-6 rounded text-[16px] font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-xl leading-none text-white/40 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 pr-10 text-sm leading-relaxed text-white/55">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Appel final */}
        <section className="px-4 pt-12 pb-28 text-center sm:px-6">
          <h2 className={`${display} mx-auto max-w-3xl text-[clamp(2.25rem,6vw,4rem)] font-extrabold leading-[0.98] tracking-[-0.04em]`}>
            Prenez une vidéo.
            <br />
            <span className={`${serif} font-normal tracking-[-0.01em] text-[#4D8DFF] italic`}>Voyez la mini.</span>
          </h2>
          <div className="mt-10">
            <SmartDownload />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
