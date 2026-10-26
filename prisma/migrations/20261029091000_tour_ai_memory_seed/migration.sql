-- What Nextview360 has taught us while building tours by hand - nextviewAI starts out knowing it.
INSERT INTO "TourAiMemory" ("id", "scope", "text", "createdBy") VALUES
  ('seed-mem-01', 'all', 'Brug aldrig Matterports automatiske fotos - de er næsten altid for dårlige.', 'Nextview360'),
  ('seed-mem-02', 'all', 'Intet fra MPSkins: links går direkte til Matterport, og alle filer (logo, fotos, video, lyd) hostes hos os.', 'Nextview360'),
  ('seed-mem-03', 'all', 'Mobil først: alt skal være tydeligt og nemt på en telefon på højkant - aldrig forvirrende.', 'Nextview360'),
  ('seed-mem-04', 'all', 'Hellere få, tydelige valg end mange. Er der tvivl, så gør det enklere.', 'Nextview360'),
  ('seed-mem-05', 'all', 'Premium og roligt udtryk (Apple-agtigt), i kundens egne farver, skrift og logo, så touren ligner hjemmesiden.', 'Nextview360'),
  ('seed-mem-06', 'all', 'Der skal altid være én tydelig næste handling (fx book en rundvisning), fordi vi vil kunne vise kunden, hvor mange vi sender videre.', 'Nextview360'),
  ('seed-mem-07', 'all', 'Specialskoler (autisme, ADHD, særlige behov): designet "Helt enkel", ingen fliser, intet der dukker op af sig selv, rundtur med stemme hvor man selv trykker videre, og en lille gruppe til forældre og fagfolk.', 'Nextview360'),
  ('seed-mem-08', 'all', 'Dagsrytme, priser og fakta tages fra kundens egne sider og PDF''er (fx ugeskemaet) - aldrig opfundet.', 'Nextview360')
ON CONFLICT ("id") DO NOTHING;
