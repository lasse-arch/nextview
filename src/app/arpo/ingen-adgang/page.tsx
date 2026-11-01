export const metadata = { title: "Ingen adgang endnu" };

/** A team member whose role gives them nothing in Arpo yet. */
export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-md pt-16 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Du har ikke adgang til noget endnu</h1>
      <p className="mt-2 text-sm text-slate-500">Bed en admin om at give dig en rolle under Brugere.</p>
    </div>
  );
}
