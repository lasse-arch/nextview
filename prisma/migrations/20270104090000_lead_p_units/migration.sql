-- Leadgeneration can search production units (P-enheder): a hotel in a chain is its own lead,
-- with its own P-nummer, under the chain's CVR number. So a CVR number is unique only among
-- whole companies (pNumber null) - a company's P-units share it, each unique by P-nummer.
DROP INDEX "LeadCandidate_cvrNumber_key";
ALTER TABLE "LeadCandidate" ADD COLUMN "pNumber" TEXT;
CREATE UNIQUE INDEX "LeadCandidate_pNumber_key" ON "LeadCandidate"("pNumber");
CREATE UNIQUE INDEX "LeadCandidate_cvrNumber_company_key" ON "LeadCandidate"("cvrNumber") WHERE "pNumber" IS NULL;
CREATE INDEX "LeadCandidate_cvrNumber_idx" ON "LeadCandidate"("cvrNumber");

ALTER TABLE "Deal" ADD COLUMN "pNumber" TEXT;
CREATE INDEX "Deal_pNumber_idx" ON "Deal"("pNumber");

ALTER TABLE "LeadFilter" ADD COLUMN "productionUnits" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeadFilter" ADD COLUMN "secondaryIndustries" BOOLEAN NOT NULL DEFAULT false;
