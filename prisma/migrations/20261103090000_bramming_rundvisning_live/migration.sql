-- Bramming: the live list of tour evenings (rundvisningsaftener, from YoungCRM's
-- event portal) counted every date as its own evening - the sign-up deadlines
-- too - and listed the full one (venteliste). One unit per evening with free
-- places now, named by its day and time, with its own sign-up form as the link
-- (so "Book denne dag" opens the form, not the list).
UPDATE "Tour"
SET "config" = jsonb_set(
      jsonb_set("config", '{live,pattern}', to_jsonb('Rundvisningsaften (?<name>[^\n\[\]]+?kl\. \d{1,2}\.\d{2})\s*\n\s*Ledige pladser: (?<size>[1-9]\d*)\s[\s\S]*?\[Tilmeld\]\((?<link>[^)]+)\)'::text)),
      '{live,flags}', '""'::jsonb)
WHERE "config"->'live'->>'url' ILIKE '%brammingefterskole.dk%rundvisning%';

INSERT INTO "TourVersion" ("id", "tourId", "config", "note", "createdByName")
SELECT 'mig_' || md5(random()::text || t."id"), t."id", t."config", 'Live data: én rundvisningsaften pr. linje, uden venteliste, Book går til tilmeldingen', 'Arpo'
FROM "Tour" t
WHERE t."config"->'live'->>'url' ILIKE '%brammingefterskole.dk%rundvisning%'
  AND NOT EXISTS (SELECT 1 FROM "TourVersion" v WHERE v."tourId" = t."id" AND v."config"::text = t."config"::text);
