import { Anton, Instrument_Serif, Inter_Tight } from "next/font/google";

// Typos des miniatures (provisoires, en attendant la DA définitive).
export const interTight = Inter_Tight({ weight: ["600", "700", "800", "900"], subsets: ["latin"] });
export const instrumentSerif = Instrument_Serif({ weight: "400", style: "italic", subsets: ["latin"] });
export const anton = Anton({ weight: "400", subsets: ["latin"] });

export const FONT_ROLE_NAME = { sans: "Inter Tight", serif: "Instrument Serif", condensed: "Anton" } as const;
// Graisses chargées pour chaque police par défaut (Instrument Serif n'existe qu'en italique).
export const FONT_ROLE_WEIGHTS = { sans: [600, 700, 800, 900], serif: [400], condensed: [400] } as const;
