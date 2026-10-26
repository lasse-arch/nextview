-- A customer who has signed can never be deleted - not by Arpo, a script or
-- by mistake. The database itself refuses; mark them lost or inactive instead.
CREATE OR REPLACE FUNCTION deal_signed_no_delete() RETURNS trigger AS $$
BEGIN
  IF OLD."contractSignedAt" IS NOT NULL
     OR OLD."contractStatus" = 'SIGNED'
     OR OLD."stage" IN ('CONTRACT_SIGNED', 'FILMED', 'LIVE') THEN
    RAISE EXCEPTION 'Kunden har skrevet under og kan ikke slettes (deal %)', OLD."id";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deal_signed_no_delete
BEFORE DELETE ON "Deal"
FOR EACH ROW EXECUTE FUNCTION deal_signed_no_delete();
