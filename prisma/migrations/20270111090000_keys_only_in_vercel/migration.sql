-- API keys live only in Vercel's environment variables now (ANTHROPIC_API_KEY, GEMINI_API_KEY, MATTERPORT_API_TOKEN) -
-- the copies once pasted into Arpo's settings are removed from the database.
DELETE FROM "IntegrationSetting" WHERE "key" IN ('ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'MATTERPORT_API_TOKEN');
