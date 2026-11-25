# nextview360.dk (Astro)

Hjemmesiden som et statisk Astro-site. Siderne ligger i `src/pages/` (én fil pr. side, samme adresser som før: `/priser.html` …), det fælles layout i `src/layouts/Site.astro`, topmenu og footer i `src/components/`. Billeder, video, CSS, JS og fonte ligger i `public/`.

Arpo bygger sitet ved hvert deploy (`scripts/build-website.mjs`, kører i `vercel-build`): siderne lægges i `site-web/` og resten i `public/web/` – begge laves på ny hver gang, så `website/` er det eneste sted, man retter. Lige nu ser kun teamet sitet, på `/web/` i Arpo. Kundebåndet på forsiden fyldes af Arpo, når siden sendes.

- `npm run dev` (i `website/`) – kør sitet lokalt
- `npm run build:website` (i roden) – byg det ind i Arpo, som på Vercel

Når sitet skal på nextview360.dk/, bygges det med `SITE_BASE=/` og `SITE_INDEXABLE=1` (så det må komme i Google).
