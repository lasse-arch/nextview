-- A signed customer still can't be deleted by a script or by mistake - only
-- by an admin in Arpo, who types the customer's name to confirm. Arpo then
-- sets arpo.delete_signed for that one transaction (SET LOCAL); the deal is
-- kept in DeletedDeal first and can be put back.
CREATE OR REPLACE FUNCTION deal_signed_no_delete() RETURNS trigger AS $$
BEGIN
  IF (OLD."contractSignedAt" IS NOT NULL
      OR OLD."contractStatus" = 'SIGNED'
      OR OLD."stage" IN ('CONTRACT_SIGNED', 'FILMED', 'LIVE'))
     AND coalesce(current_setting('arpo.delete_signed', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Kunden har skrevet under og kan ikke slettes (deal %)', OLD."id";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
