-- nextviewAI patched tours with Historier by CSS (.hv{overflow:clip} and the
-- whole stories box made a forced, full-width scroller) so the hidden menu
-- didn't peek in. The engine does that itself now (stories.tsx, .hv clip), and
-- the patch did harm: it forced the stories visible and full-width over its own
-- layout. Those rules are taken out of customCss; anything else stays.
CREATE TEMP TABLE "_css" AS
SELECT "id",
       btrim(regexp_replace(regexp_replace("config"->>'customCss',
         '\.hv\s*\{\s*overflow\s*:\s*clip;?\s*\}\s*', '', 'g'),
         '\.hv \.hv-stories(::-webkit-scrollbar| > \*)?\s*\{[^}]*\}\s*', '', 'g')) AS "css"
FROM "Tour"
WHERE "config"->>'customCss' ~ '\.hv \.hv-stories|\.hv\s*\{\s*overflow\s*:\s*clip';

UPDATE "Tour" t
SET "config" = CASE WHEN c."css" = '' THEN t."config" - 'customCss' ELSE jsonb_set(t."config", '{customCss}', to_jsonb(c."css")) END
FROM "_css" c
WHERE t."id" = c."id";

INSERT INTO "TourVersion" ("id", "tourId", "config", "note", "createdByName")
SELECT 'mig_' || md5(random()::text || t."id"), t."id", t."config", 'Ekstra CSS til historierne fjernet - motoren klarer det selv nu', 'Arpo'
FROM "Tour" t JOIN "_css" c ON c."id" = t."id"
WHERE NOT EXISTS (SELECT 1 FROM "TourVersion" v WHERE v."tourId" = t."id" AND v."config"::text = t."config"::text);

DROP TABLE "_css";
