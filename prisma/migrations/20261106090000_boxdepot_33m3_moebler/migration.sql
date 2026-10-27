-- Boxdepotet (both tours): 33 m³ "Med flyttekasser, dæk og møbler" was missing.
-- In MPSkins it was a tour of its own (scan point 207, hidden in the others);
-- here it's one more room under 33 m³, on the same scanning. Added after the
-- existing ones, with the tour's own link (only the scan point and view differ),
-- and only where it isn't there already.
UPDATE "Tour" t
SET "config" = jsonb_set(
  t."config",
  ARRAY['menu', (m.idx - 1)::text, 'items'],
  (m.elem->'items') || jsonb_build_array(jsonb_build_array(
    'Med flyttekasser, dæk og møbler',
    replace(replace(replace(m.elem->'items'->0->>1, 'ss=204', 'ss=207'), 'sr=-.17,.26', 'sr=-.27,.4'), 'sr=-.17%2C.26', 'sr=-.27%2C.4')
  ))
)
FROM (
  SELECT t2."id", e.elem, e.idx
  FROM "Tour" t2, jsonb_array_elements(t2."config"->'menu') WITH ORDINALITY AS e(elem, idx)
  WHERE e.elem->>'title' = 'Depotrum: 33 m³'
) m
WHERE t."id" = m."id"
  AND t."slug" IN ('boxdepot', 'boxdepot-rum')
  AND m.elem->'items'->0->>1 LIKE '%ss=204%'
  AND (m.elem->'items')::text NOT LIKE '%dæk og møbler%';

INSERT INTO "TourVersion" ("id", "tourId", "config", "note", "createdByName")
SELECT 'mig_' || md5(random()::text || t."id"), t."id", t."config", '33 m³: "Med flyttekasser, dæk og møbler" tilføjet (scanpunkt 207)', 'Arpo'
FROM "Tour" t
WHERE t."slug" IN ('boxdepot', 'boxdepot-rum')
  AND NOT EXISTS (SELECT 1 FROM "TourVersion" v WHERE v."tourId" = t."id" AND v."config"::text = t."config"::text);
