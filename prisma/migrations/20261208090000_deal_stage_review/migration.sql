-- "Gennemgang inden live": a stage between Filmet and Live.
ALTER TYPE "DealStage" ADD VALUE IF NOT EXISTS 'REVIEW' AFTER 'FILMED';
