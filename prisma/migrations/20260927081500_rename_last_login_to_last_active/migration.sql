-- Renaming "last login" to "last active" tracking (see auth.ts touchLastActive) -
-- the existing lastLoginAt values are login timestamps, not the new
-- "last authenticated request" semantics, so they're not carried over; every
-- active user's lastActiveAt repopulates on their very next request anyway.
ALTER TABLE "User" RENAME COLUMN "lastLoginAt" TO "lastActiveAt";
