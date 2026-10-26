-- Tours write like people: no "·" between words and no long dashes (— –),
-- e.g. "Bramming · siden 1897" -> "Bramming, siden 1897". nextviewAI had picked
-- the dots up from the playbook; new text is cleaned as it's written
-- (plainWordsInConfig), this cleans what's already there. The engine's own
-- words changed the same way, so their translations follow.
CREATE TEMP TABLE "_plain" AS
SELECT "id",
       regexp_replace(
         regexp_replace(
           replace(replace("config"::text, 'Bagefter · {tid}', 'Bagefter: {tid}'), 'i denne størrelse · fra', 'i denne størrelse, fra'),
           ' +[·•] +', ', ', 'g'),
         ' *[—–] *', ' - ', 'g') AS "plain"
FROM "Tour"
WHERE "config"::text ~ '[·•—–]';

UPDATE "Tour" t SET "config" = p."plain"::jsonb
FROM "_plain" p
WHERE t."id" = p."id" AND t."config"::text <> p."plain";

-- A tour edited in Arpo gets it as a new version, so the history shows the change.
INSERT INTO "TourVersion" ("id", "tourId", "config", "note", "createdByName")
SELECT 'mig_' || md5(random()::text || t."id"), t."id", t."config", 'Tekster uden "·" og lange tankestreger', 'Arpo'
FROM "Tour" t
JOIN "_plain" p ON p."id" = t."id"
WHERE EXISTS (SELECT 1 FROM "TourVersion" v WHERE v."tourId" = t."id" AND (v."createdByName" IS DISTINCT FROM 'Arpo' OR v."note" IS DISTINCT FROM 'Oprettet fra prototypen'))
  AND NOT EXISTS (SELECT 1 FROM "TourVersion" v WHERE v."tourId" = t."id" AND v."config"::text = t."config"::text);

DROP TABLE "_plain";
