import Link from "next/link";
import { StandaloneContractForm } from "./standalone-contract-form";

export default function NewStandaloneContractPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-slate-500">
        <Link href="/settings/docuseal/standalone-contracts" className="hover:underline">
          ← Tilbage til kontrakter uden deal
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Send kontrakt uden deal</h1>
      <p className="mt-1 text-sm text-slate-500">
        Til fx en kunde der skriver under på stedet ved et event. Kæd kontrakten sammen med en deal bagefter under
        &ldquo;Kontrakter uden deal&rdquo;.
      </p>

      <div className="mt-6">
        <StandaloneContractForm />
      </div>
    </div>
  );
}
