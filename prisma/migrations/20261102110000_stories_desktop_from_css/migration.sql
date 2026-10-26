-- Some tours had their stories forced onto computers with custom CSS (written
-- by nextviewAI) while the setting "Historier på computer" was off. Then the
-- engine's own computer layout never applied: the row sat to the left, the
-- room's name and the place cards lay on top of it. Turn the setting on where
-- the CSS shows them, so the engine lays them out (the CSS line stays, harmless).
UPDATE "Tour"
SET "config" = jsonb_set("config", '{stories,desktop}', 'true'::jsonb)
WHERE "config" ? 'stories'
  AND COALESCE(("config"->'stories'->>'desktop')::boolean, false) = false
  AND "config"->>'customCss' ~* '\.hv-stor(ies|y)[^{]*\{[^}]*display\s*:\s*(flex|block)';
