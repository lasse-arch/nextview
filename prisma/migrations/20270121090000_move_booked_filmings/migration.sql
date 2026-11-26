-- Deals signed and with a filming day already booked: on to "Booket filmning dag" (the stage is new).
UPDATE "Deal" SET stage = 'FILMING_BOOKED' WHERE stage = 'CONTRACT_SIGNED' AND "filmingAt" IS NOT NULL;
