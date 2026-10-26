-- Boxdepotet rumvælger: "Depotrum: 17 m³ - Tomt" pointed at scan 208, which is
-- switched off in Matterport itself (not in Showcase), so the tour couldn't go
-- there. Scan 209 is the same empty room, seen from inside. A tour edited in
-- Arpo gets the fix as a new version too, so the history shows it (one nobody
-- has edited keeps following its prototype file, which has the fix as well).
UPDATE "Tour"
SET "config" = regexp_replace("config"::text, '([?&]ss=)208(?![0-9])', '\1209', 'g')::jsonb
WHERE "slug" = 'boxdepot-rum' AND "config"::text ~ '[?&]ss=208(?![0-9])';

INSERT INTO "TourVersion" ("id", "tourId", "config", "note", "createdByName")
SELECT 'mig_' || md5(random()::text), t."id", t."config", '17 m³ tomt: scan 209 i stedet for 208 (slået fra i Matterport)', 'Arpo'
FROM "Tour" t
WHERE t."slug" = 'boxdepot-rum'
  AND EXISTS (SELECT 1 FROM "TourVersion" v WHERE v."tourId" = t."id" AND (v."createdByName" IS DISTINCT FROM 'Arpo' OR v."note" IS DISTINCT FROM 'Oprettet fra prototypen'))
  AND NOT EXISTS (SELECT 1 FROM "TourVersion" v WHERE v."tourId" = t."id" AND v."config"::text = t."config"::text);
