import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { newDatabaseUrl } from "@/lib/db-move";
import { MoveDatabase } from "./move";

export default async function MoveDatabasePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo");
  if (user.role !== "ADMIN") redirect("/arpo");
  const target = newDatabaseUrl();
  let host: string | null = null;
  try {
    host = target ? new URL(target).hostname : null;
  } catch {}
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Flyt database</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kopierer alle data fra den database, Arpo kører på nu, til en ny tom database (fx Neon i Frankfurt). Den nuværende database bliver kun læst - intet i den ændres. Bagefter peger I Arpo på den nye ved at sætte DATABASE_URL i Vercel.
        </p>
      </div>
      {host ? (
        <MoveDatabase host={host} />
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Sæt <code>NEW_DIRECT_URL</code> (den nye databases adresse uden pooling) og <code>NEW_DATABASE_URL</code> i Vercel, og lav et nyt deploy - så oprettes tabellerne i den nye database, og flytningen kan starte her.
        </p>
      )}
    </div>
  );
}
