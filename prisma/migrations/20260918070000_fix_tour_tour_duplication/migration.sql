-- The earlier "rename Matterport to Nextview360 Tour" migration did a plain
-- substring REPLACE on Deal.soldProduct. Any value that already contained
-- the word "Tour" right after "Matterport" (e.g. "Matterport Tour x 1")
-- turned into a duplicated "Nextview360 Tour Tour x 1". Collapse that back
-- down to a single "Nextview360 Tour".
UPDATE "Deal"
SET "soldProduct" = REPLACE("soldProduct", 'Nextview360 Tour Tour', 'Nextview360 Tour')
WHERE "soldProduct" LIKE '%Nextview360 Tour Tour%';
