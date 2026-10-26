---
name: tour-lab
description: How Nextview360's own tour engine in Arpo (tour-lab) is built and how to extend it - the engine, the tour setups, the editor, Claude in the editor and the tour drejebog. Use whenever working on anything under src/app/(app)/tour-lab, src/lib/tours.ts, src/lib/actions/tours.ts or tour-ai.ts, or when the user asks for a new tour feature, a new customer tour, menus, welcome/cover, place cards, "Vis mig rundt", Find vej, the room picker or the tour editor.
---

# Tour-lab: Nextview360's tour engine in Arpo

Our own premium front-end on top of Matterport - it has replaced MPSkins; nothing new may depend on MPSkins.
One engine, one JSON setup per tour, kept in the database and edited in Arpo.

## Read first

- `src/app/(app)/tour-lab/tours/PLAYBOOK.md` - **how we make a good tour**
  (mobile first, never confusing, converts, red thread from the customer's
  website, branch templates). Claude in the Arpo editor reads this file too:
  when the user teaches you something about good tours, write it there.
- `src/app/(app)/tour-lab/tours/types.ts` - `TourConfig`, every field with a doc
  comment. Claude in the editor reads these comments to know what a field does,
  so every new field needs a clear one (Danish UI, English comments).

## Map

| Part | Where |
| --- | --- |
| Engine (the tour visitors see) | `tour-lab/[slug]/experience.tsx` + `designs.tsx` (cover, dock, picker), `cards.tsx` (place cards, nudge), `guide.tsx` (Vis mig rundt, voice), `day.tsx` (Sådan ser en dag ud), `simple.tsx` ("Helt enkel" welcome + menu), `map.tsx` (interactive map, works with or without a drone scene; icons in `tours/icons.ts`), `info.tsx`, `map.tsx`, `wayfinding.tsx` (Find vej), `measures.tsx`, `stories.tsx`, `links.tsx` (popup/tab/same) |
| Page (server) | `tour-lab/[slug]/page.tsx` (Arpo, with tools) and `src/app/t/[slug]` (published, for iframes) share `load.ts` - maps every ss to a sweep from Matterport's model data (`fetchSweepIndex`), live availability, sweep graph |
| Matterport glue | `tour-lab/matterport.ts` (SDK types, CSS that hides Matterport's UI, link (`ss`, `sr`, `rot=`) parsing); SDK bundle self-hosted in `public/matterport/` |
| Setups | DB `Tour` + `TourVersion` (`src/lib/tours.ts`, `src/lib/actions/tours.ts`). The files in `tour-lab/tours/*.ts` are only the prototypes they were seeded from; a tour nobody has edited in Arpo follows its file |
| Editor | `tour-lab/[slug]/rediger/` - `editor.tsx` (layout, tabs, menu editor, Claude panel, save/versions), `content.tsx` (Start, Vis mig rundt, Stedkort), `map-editor.tsx` (Interaktivt kort: canvas to place/drag points, icons, size, categories, start view), `ui.tsx` (Apple-style fields, `PreviewApi`) |
| nextviewAI (Claude, called nextviewAI in Arpo's UI) | `src/lib/actions/tour-ai.ts` (edits as structured `changes`, new tour from website, `remember` notes → `TourAiMemory`, scope "all" in the cached system prompt and the tour's own in the message; editor panel `rediger/memory.tsx`), `src/lib/site-digest.ts` (`siteResearch`: front page + up to 10 useful subpages + up to 3 PDFs that the model reads itself, all cached a week in `SiteCache`). Key: `ANTHROPIC_API_KEY` env or Arpo setting. Whatever we learn building tours by hand belongs in PLAYBOOK.md or as a memory, so nextviewAI does it too |
| Overview | `tour-lab/page.tsx` (tours grouped by customer), `new-tour.tsx` |
| Measurement | the engine's `track()` sends events to `/api/tour-events` (TourEvent; not from the editor's preview); `src/lib/tour-stats.ts` turns them into the editor's Resultater tab and the overview's numbers. Links out get utm_source=nextview360 (`links.tsx` `tagged`) |
| Kundegennemsyn | `/p/<reviewToken>` (`src/app/p/[token]/page.tsx`, public in `proxy.ts`): the tour as it is now with `feedback.tsx` (point at the spot → view + marked picture, suggestion/bug, name) posting to `/api/tour-feedback` (token-checked, flood guard); `TourFeedback`; switched on/off and reviewed in the editor's Feedback tab (`rediger/feedback-panel.tsx`, "Vis stedet" flies the preview). Review visits aren't tracked |
| People in scans | `/tour-lab/personer` (`personer/review.tsx`), `src/lib/actions/tour-people.ts`: each scan's four walls (Matterport's public model graph, `fetchScanImages`) shown to nextviewAI as image URLs - all small first, then the maybes big; results in `TourScanCheck` (person/clear/hidden/kept), shared between tours of the same model; "Skjul scan" adds the sweep to `hiddenSweeps` as a new version |
| Live data | `src/lib/availability/live.ts` (the customer's page as text, read with the tour's `live.pattern`, cached 10 min - no AI at runtime); Claude writes the pattern once (`setupLiveData` in tour-ai.ts); editor tab Live data; engine shows a chip, a sheet with book buttons and "Ledig" badges in the menu |
| Files | `src/lib/tour-files.ts` (TourFile; Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, else the database up to 4 MB, served by `/api/tour-files/<id>`), copied from other sites by "Gem alle filer hos os" and when Claude builds a tour |

## How things connect

- **Live preview bridge**: the editor shows `/tour-lab/<slug>` in an iframe and
  talks to it with same-origin `postMessage`: `tour-draft` (the unsaved setup -
  the engine renders it at once), `tour-view` (the scan point + exact view the
  preview stands in, as a `…?ss=N&rot=pitch,yaw` link), `tour-shot` (a photo),
  `tour-go` (fly to a link). Anything in a setup that points at a spot is picked
  this way - never ask users to paste links.
- Photos taken in the editor are stored as `TourStoryImage` rows (`foto:<key>`)
  and served by `tour-lab/[slug]/historie`.
- Places in a setup are Matterport links: my.matterport.com/show/?m=<model>&ss=N,
  where ss = Matterport's own scan point index + 1 (the same number U-links and
  MPSkins used), and `rot=` exact SDK angles (or `sr=` from old U-links). Old
  explore.nextview360.dk links still work, and "Frakobl MPSkins"
  (`src/lib/tour-detach.ts`) moves a tour off them. Matterport's model data
  sometimes leaves scans out - the engine then looks the number up in the
  viewer's own sweeps.
- Scanpunkter shows the points on Matterport's photographic floor plan
  (`colorplan` in the model's assets, placed by its origin and resolution).

## Adding a feature

1. Add the field to `TourConfig` with a doc comment (what it does, defaults).
2. Build it in the engine; keep it off unless set. Mobile first, nothing that
   covers the tour for long, no new buttons unless they earn their place.
3. Give it a proper editor (`content.tsx` or a tab in `editor.tsx`) using the
   `ui.tsx` pieces - only the JSON under "Avanceret" is not good enough.
4. If it changes how a good tour is made, add a line to `PLAYBOOK.md`.

## Checking your work

- `npx tsc --noEmit -p .` (lines from `.next/` are transient) and
  `npx eslint "src/app/(app)/tour-lab"`. Don't run prettier.
- Run the app (Postgres: `service postgresql start`; dev server on port 3100;
  login admin@nextview360.dk / admin123) and screenshot `/tour-lab` and
  `/tour-lab/<slug>/rediger` with Playwright.
- The sandbox can't load Matterport or outside images, so the 3D tour itself
  (flying, the bridge's `view`/`shot`) can only be tested on www.arpo.dk - say so.
- Tour-lab is admin-only, so no /nyheder post until it is shown to customers.
