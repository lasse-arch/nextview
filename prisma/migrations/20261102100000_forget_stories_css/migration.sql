-- nextviewAI had learned to add CSS to every tour with Historier so the menu
-- didn't peek in from the right when a story was tapped. The engine fixes that
-- itself now (stories.tsx scrolls only its own row; .hv is overflow:clip), so
-- the note would only add needless CSS to new tours.
DELETE FROM "TourAiMemory" WHERE "text" ILIKE '%overflow:clip%' AND "text" ILIKE '%stories%';
