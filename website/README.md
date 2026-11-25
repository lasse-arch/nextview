# nextview360.dk (Astro)

Hjemmesiden som et statisk Astro-site. Siderne ligger i `src/pages/` (én fil pr. side, samme adresser som før: `/priser.html` …), det fælles layout i `src/layouts/Site.astro`, topmenu og footer i `src/components/`. Billeder, video, CSS og JS ligger i `public/`.

- `npm run dev` – kør lokalt
- `npm run build` – byg til `dist/`

## Vercel

Eget projekt med **Root Directory = `website`** (framework: Astro). Miljøvariabler:

- `ARPO_URL` – Arpo (default `https://nextview360.dk`). Kundebåndet hentes derfra ved build, og kontaktformularen sender dertil.
- `SITE_INDEXABLE=1` – **kun når sitet er live på nextview360.dk.** Uden den siger alle sider noindex og robots.txt lukker for søgemaskiner, så en prøveversion aldrig kommer i Google.

I Arpos Vercel-projekt: sæt `SITE_ORIGINS` til prøveversionens adresse (fx `https://nextview360-website.vercel.app`), så kontaktformularen må sende derfra.

Kundebåndet opdateres ved hvert build.
