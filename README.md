# Miniamaker

Prototype d'outil pour produire des miniatures verticales (Reels, TikTok, Shorts) en série, toujours dans le même style.

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:3000.

## Fonctionnement

- **Import** : vidéo ou image (bouton ou glisser-déposer). Tout est traité dans le navigateur, rien n'est envoyé en ligne.
- **Choix de l'image** : 24 captures réparties sur la vidéo, triées par netteté et par la détection de visage MediaPipe (yeux fermés, bouche ouverte).
- **Sous-titres incrustés** : `src/lib/subtitles.ts`. Détection automatique du texte blanc cerné de sombre (et des bandeaux blancs), masque retouchable au pinceau, puis reconstruction avec MI-GAN (modèle ONNX ~28 Mo, téléchargé une fois depuis Hugging Face puis gardé en cache, exécuté avec onnxruntime-web).
- **Kits de marque** : `src/lib/kits.ts`. Un kit par client = ses templates, ses couleurs et ses concepts. On crée un kit en copiant l'actuel, on le renomme, on le supprime.
- **Éditeur de templates** : `src/components/TemplateEditor.tsx`. Zone de texte réglable à la souris dans l'aperçu (déplacer, tirer les bords) ou aux curseurs, styles de ligne (police, graisse, taille, interlettrage, interligne, capitales), dégradé, ombre, détourage auto.
- **Sauvegarde** : kits, brouillon en cours et 24 dernières minis exportées (vignette + réglages) gardés dans le stockage local du navigateur. Les images ne sont pas gardées.
- **Polices par ligne** : chaque ligne peut prendre n'importe quelle Google Font (1 800+, graisse et italique). La liste est figée dans `src/data/google-fonts.json` ; pour la mettre à jour : `node scripts/update-google-fonts.mjs`. Les polices sont chargées à la demande depuis Google Fonts.
- **Rendu** : `src/lib/render.ts`, canvas 1080 × 1920. La taille du titre s'ajuste toute seule à la zone.
- **Export** : JPG ou PNG en 1080 × 1920, sans les repères (zones TikTok/Reels, grille Insta 3:4).

## Composants d'interface

Deux banques de composants React animés (framer-motion, licence MIT) sont branchées via le CLI shadcn (`components.json`) :

- **EasyUI** (https://easyui.site) → `src/components/ui/`
- **Amicro** (https://amicro.dev) → `src/components/amicro/`

```bash
npx shadcn@latest add Surajmaurya1/easyui/<composant>
npx shadcn@latest add @amicro/<composant>
```

Le code est copié dans le projet et peut être retouché. Les composants EasyUI lisent les jetons `--bg`, `--text-primary`, `--border`… définis dans `src/app/globals.css`.

Les wasm MediaPipe et onnxruntime sont copiés dans `public/` au `postinstall`. Le modèle de visage est chargé depuis les serveurs de Google ; sans réseau, le tri se fait seulement sur la netteté.
