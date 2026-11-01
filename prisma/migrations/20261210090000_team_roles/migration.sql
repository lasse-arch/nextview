-- Team roles: filmers and tour developers, who never see sales or money.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FILMER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEVELOPER';

-- More roles on top of the main one (e.g. films and builds tours).
ALTER TABLE "User" ADD COLUMN "extraRoles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];
