# Nextview360

Internt CRM til Nextview360's lead- og kundepipeline: deal-tracking, kontrakter
(PandaDoc), fakturering (Dinero) og provisionsberegning.

## Lokal udvikling

```bash
npm install
npm run dev
```

Kræver en lokal Postgres-database (`DATABASE_URL` i `.env`, se `.env.example`).

## Deploy

Deployes på Vercel. `vercel-build`-scriptet kører `prisma migrate deploy` før
`next build`, så databasemigrationer anvendes automatisk ved hvert deploy.
Se `.env.example` for påkrævede miljøvariabler.
