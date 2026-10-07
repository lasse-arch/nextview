-- A preview build of a work branch once ran an SFTP migration under a
-- temporary name (20261005170000_add_betalingsservice_sftp) against the
-- production database; it failed and was recorded as failed, which blocks
-- every later `prisma migrate deploy` with P3009. That name never existed on
-- main, so the failed record is simply removed. Only touches that one,
-- unfinished row - a no-op once it's gone.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261005170000_add_betalingsservice_sftp'
  AND "finished_at" IS NULL;
