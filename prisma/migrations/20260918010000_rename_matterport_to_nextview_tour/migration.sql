-- Data-only migration: "Matterport" was the old vendor-specific name for our
-- 360 tour product on the manual sold-product/ydelser dropdowns. Renames any
-- existing data to the current branded name "Nextview360 Tour" so it's
-- consistent with the contract-builder flow, which has always used that name.

-- Deal.soldProduct is a comma-joined multi-select string (e.g. "Matterport, Hjemmeside"),
-- so a substring replace handles both a lone value and one joined with others.
UPDATE "Deal"
SET "soldProduct" = REPLACE("soldProduct", 'Matterport', 'Nextview360 Tour')
WHERE "soldProduct" LIKE '%Matterport%';

-- DealItem.productType is picked from a fixed dropdown for this one, so an exact match is safe.
UPDATE "DealItem"
SET "productType" = 'Nextview360 Tour'
WHERE "productType" = 'Matterport';
