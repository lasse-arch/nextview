-- A chain's logins on all its locations: everyone with access to a main deal gets the same on each of its branches
-- (locations linked on before this was kept in step). Access that already exists on a branch is left as it is.
INSERT INTO "CustomerAccountDeal" ("accountId", "dealId", "role", "canApprove", "expiresAt", "invitedById", "createdAt")
SELECT a."accountId", b."id", a."role", a."canApprove", a."expiresAt", a."invitedById", NOW()
FROM "CustomerAccountDeal" a
JOIN "Deal" b ON b."parentDealId" = a."dealId"
ON CONFLICT ("accountId", "dealId") DO NOTHING;
