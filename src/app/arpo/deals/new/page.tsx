import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { NewDealForm } from "./new-deal-form";

export default async function NewDealPage() {
  const [users, currentUser] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-slate-900">Opret ny lead</h1>
      <p className="mt-1 text-sm text-slate-500">
        Minimal information er nok til at oprette en deal. Slå evt. firmaet op via CVR-nummer for at udfylde
        firmanavn og adresse automatisk.
      </p>

      <NewDealForm users={users} defaultOwnerId={currentUser?.id} />
    </div>
  );
}
