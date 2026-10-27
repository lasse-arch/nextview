-- One-time repair: leads pasted on the ringeliste as "Navn, By: 12 34 56 78"
-- before such lines were understood got the whole line as their name. Split
-- them into name, town (address) and phone - only manually added leads with
-- no phone, address or website yet, whose name ends in exactly 8 digits.
WITH m AS (
  SELECT id, regexp_match("companyName", '^(.+?)\s*[:–-]\s*(?:\+45\s?)?((?:\d[\s-]?){7}\d)\s*$') AS r
  FROM "Deal"
  WHERE "contactPhone" IS NULL AND "address" IS NULL AND "websiteUrl" IS NULL AND "cvrNumber" IS NULL
    AND "importType" = 'MANUAL' AND "companyName" ~ '\d\s*$'
),
parts AS (
  SELECT id,
    btrim(split_part(r[1], ',', 1)) AS name,
    NULLIF(btrim(CASE WHEN position(',' IN r[1]) > 0 THEN substring(r[1] FROM position(',' IN r[1]) + 1) ELSE '' END), '') AS city,
    regexp_replace(r[2], '\D', '', 'g') AS digits
  FROM m
  WHERE r IS NOT NULL
)
UPDATE "Deal" d
SET "companyName" = p.name,
    "address" = p.city,
    "contactPhone" = regexp_replace(p.digits, '^(\d{2})(\d{2})(\d{2})(\d{2})$', '\1 \2 \3 \4')
FROM parts p
WHERE d.id = p.id AND length(p.digits) = 8 AND p.name <> '';
